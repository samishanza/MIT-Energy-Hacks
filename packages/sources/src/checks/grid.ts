import type { MapFeature, Observation, SourceRun } from "@eqore/contract";
import { observe, queryArcgis, toObservations, type ArcgisFeature, type ArcgisResult, type CollectContext, type PolygonGeometry, type SpatialQuery } from "../arcgis.ts";
import { sourceOf, type ArcgisEntry, type FeederDetail, type RegionConfig } from "../registry.ts";
import type { GridOutcome } from "./energy.ts";

export type GridAnchor = { parcel: PolygonGeometry } | { longitude: number; latitude: number };

export type GridCollection = {
  observations: Observation[];
  features: MapFeature[];
  runs: SourceRun[];
  // The drawn lines, for measuring distances to them.
  lines: { result: ArcgisResult; features: ArcgisFeature[]; label: (feature: ArcgisFeature) => string }[];
  outcomes: GridOutcome[];
};

function queryFor(entry: ArcgisEntry, anchor: GridAnchor, bufferMeters = entry.searchRadiusMeters): SpatialQuery {
  return "parcel" in anchor
    ? { kind: "polygon", geometry: anchor.parcel, bufferMeters }
    : { kind: "point", longitude: anchor.longitude, latitude: anchor.latitude, bufferMeters };
}

const quoted = (text: string) => `'${text.replace(/'/g, "''")}'`;

function shareUnderground(detail: Extract<FeederDetail, { kind: "construction" }>, rows: ArcgisFeature[]): string | null {
  let underground = 0;
  let total = 0;
  for (const row of rows) {
    const length = Number(row.attributes[detail.lengthAttribute]);
    if (!Number.isFinite(length) || length <= 0) continue;
    total += length;
    if (String(row.attributes[detail.constructionAttribute]) === detail.underground) underground += length;
  }
  if (total === 0) return null;
  const percent = Math.round((underground / total) * 100);
  if (percent === 100) return "Underground";
  if (percent === 0) return "Overhead";
  return `Mixed: ${percent}% underground by mapped length`;
}

// Joins a utility's other layers to each feeder candidate, so loading, rating, construction, and
// study status travel with the feeder they describe.
async function collectDetails(details: FeederDetail[], feederIds: string[], anchor: GridAnchor, searchedMeters: number, ctx: CollectContext) {
  const observations: Observation[] = [];
  const runs: SourceRun[] = [];
  if (feederIds.length === 0) return { observations, runs };
  const ids = new Set(feederIds);
  await Promise.all(
    details.map(async (detail) => {
      const where = `${detail.joinAttribute} IN (${feederIds.map(quoted).join(",")})`;
      if (detail.kind === "by_feeder") {
        const result = await queryArcgis(detail.entry, { kind: "attribute", where }, ctx);
        runs.push(result.run);
        observations.push(...toObservations(result, ctx, result.features.filter((feature) => ids.has(feature.objectId))));
        return;
      }
      if (detail.kind === "nearest") {
        const result = await queryArcgis(detail.entry, queryFor(detail.entry, anchor, searchedMeters), ctx);
        runs.push(result.run);
        observations.push(...toObservations(result, ctx, result.features.filter((feature) => ids.has(feature.objectId))));
        return;
      }
      const results = await Promise.all(detail.entries.map((entry) => queryArcgis(entry, { kind: "attribute", where }, ctx)));
      runs.push(...results.map((result) => result.run));
      const failure = results.find((result) => result.failure)?.failure;
      const origin = { source: { ...sourceOf(detail.entries[0]!), name: `${detail.entries[0]!.name} (overhead and underground layers)` }, query: results.map((result) => result.query).join(" | "), retrievedAt: results[0]!.retrievedAt };
      for (const feederId of feederIds) {
        const rows = results.flatMap((result) => result.features.filter((feature) => String(feature.attributes[detail.joinAttribute]) === feederId));
        const share = failure ? null : shareUnderground(detail, rows);
        observations.push(
          share
            ? observe(origin, ctx, { field: detail.field, kind: "reading", value: { type: "text", value: share }, attribute: detail.constructionAttribute, objectId: feederId, grade: "reference", reason: "Lengths are as the utility maps them, not surveyed." })
            : observe(origin, ctx, { field: detail.field, kind: "no_value", value: null, objectId: feederId, reason: failure ?? "No overhead or underground segment is mapped for this feeder." }),
        );
      }
    }),
  );
  return { observations, runs };
}

// Utility-published context for the location queried, not a statement of which line serves the
// building. Several feeders stay candidates for the Pre-Application Report to settle.
export async function collectGrid(region: RegionConfig, anchor: GridAnchor, ctx: CollectContext): Promise<GridCollection> {
  const observations: Observation[] = [];
  const features: MapFeature[] = [];
  const runs: SourceRun[] = [];
  const measuredLines: GridCollection["lines"] = [];
  const outcomes: GridOutcome[] = [];
  let servingUtilityFound = false;
  const search = (source: (typeof region.grid)[number], meters: number) =>
    Promise.all([
      queryArcgis(source.entry, queryFor(source.entry, anchor, meters), ctx),
      source.lineGeometry ? queryArcgis(source.lineGeometry, queryFor(source.lineGeometry, anchor, meters), ctx) : null,
    ]);
  const results = await Promise.all(
    region.grid.map(async (source) => {
      const near = source.entry.searchRadiusMeters;
      let [result, lines] = await search(source, near);
      let searchedMeters = near;
      let note: string | undefined;
      if (!result.failure && result.features.length === 0 && source.widenToMeters) {
        [result, lines] = await search(source, source.widenToMeters);
        searchedMeters = source.widenToMeters;
        note = `Nothing is mapped within ${near} m of the site, so the search reached ${searchedMeters} m. A nearby line isn't evidence that it serves the site.`;
      }
      return { source, result, lines, searchedMeters, note };
    }),
  );

  const detailed = await Promise.all(results.map(({ source, result, searchedMeters }) => collectDetails(source.details ?? [], [...new Set(result.features.map((feature) => feature.objectId))], anchor, searchedMeters, ctx)));
  observations.push(...detailed.flatMap((detail) => detail.observations));

  for (const [index, { source, result, lines, searchedMeters, note }] of results.entries()) {
    runs.push(result.run);
    outcomes.push({ utilityName: source.utilityName, feederFound: result.features.length > 0, widened: Boolean(note), searchedMeters, failure: result.failure, barredReason: source.entry.barred?.reason });
    observations.push(...toObservations(result, ctx, result.features, { note, emptyReason: `${source.utilityName}'s map shows no feeder within ${searchedMeters} m of this site.` }));
    if (lines) runs.push(lines.run);
    runs.push(...detailed[index]!.runs);
    const feederAttribute = source.entry.fields.find((mapping) => mapping.field === "feeder")?.attribute;
    // Only draw lines the record has a feeder for. The line layer also holds transmission lines.
    const feederIds = new Set(result.features.map((feature) => feature.objectId));
    const drawn = lines ? lines.features.filter((feature) => feederIds.has(feature.objectId)) : result.features;
    const nameOf = (feature: ArcgisFeature) => String((feederAttribute ? feature.attributes[feederAttribute] : undefined) ?? feature.objectId);
    measuredLines.push({ result: lines ?? result, features: drawn, label: nameOf });
    drawn.forEach((feature, index) => {
      if (feature.geometry) {
        const name = nameOf(feature);
        features.push({
          id: `${source.entry.id}-${index + 1}`,
          kind: "utility_line",
          field: "feeder",
          geometry: feature.geometry,
          label: `Nearby line: ${String(name)}`,
        });
      }
    });
    if (result.features.length > 0 && !note) {
      servingUtilityFound = true;
      observations.push(
        observe(result, ctx, {
          field: "serving_utility",
          kind: "reading",
          value: { type: "text", value: source.utilityName },
          grade: "reference",
          attribute: "configured service that returned a feeder",
        }),
      );
    }
  }

  if (!servingUtilityFound) {
    const first = results[0]?.result;
    if (first) {
      observations.push(
        observe(first, ctx, {
          field: "serving_utility",
          kind: "no_value",
          value: null,
          reason:
            first.failure ??
            (results.some(({ note, result }) => note && result.features.length > 0)
              ? "The only feeder found is beyond the first search distance, which doesn't show which utility serves this site. The bill names the utility."
              : `${first.entry.name} returned no feeder here. That doesn't say another utility serves this site. The bill names the utility.`),
        }),
      );
    }
  }
  return { observations, features, runs, lines: measuredLines, outcomes };
}
