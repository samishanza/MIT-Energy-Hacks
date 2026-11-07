import type { MapFeature, Observation, SourceRun } from "@eqore/contract";
import { observe, queryArcgis, toObservations, type ArcgisFeature, type ArcgisResult, type CollectContext, type PolygonGeometry, type SpatialQuery } from "../arcgis.ts";
import type { ArcgisEntry, RegionConfig } from "../registry.ts";

export type GridAnchor = { parcel: PolygonGeometry } | { longitude: number; latitude: number };

export type GridCollection = {
  observations: Observation[];
  features: MapFeature[];
  runs: SourceRun[];
  // The drawn lines, for measuring distances to them.
  lines: { result: ArcgisResult; features: ArcgisFeature[]; label: (feature: ArcgisFeature) => string }[];
};

function queryFor(entry: ArcgisEntry, anchor: GridAnchor): SpatialQuery {
  const bufferMeters = entry.searchRadiusMeters;
  return "parcel" in anchor
    ? { kind: "polygon", geometry: anchor.parcel, bufferMeters }
    : { kind: "point", longitude: anchor.longitude, latitude: anchor.latitude, bufferMeters };
}

// Utility-published context for the location queried, not a statement of which line serves the
// building. Several feeders stay candidates for the Pre-Application Report to settle.
export async function collectGrid(region: RegionConfig, anchor: GridAnchor, ctx: CollectContext): Promise<GridCollection> {
  const observations: Observation[] = [];
  const features: MapFeature[] = [];
  const runs: SourceRun[] = [];
  const measuredLines: GridCollection["lines"] = [];
  let servingUtilityFound = false;
  const results = await Promise.all(
    region.grid.map(async (source) => {
      const [result, lines] = await Promise.all([
        queryArcgis(source.entry, queryFor(source.entry, anchor), ctx),
        source.lineGeometry ? queryArcgis(source.lineGeometry, queryFor(source.lineGeometry, anchor), ctx) : null,
      ]);
      return { source, result, lines };
    }),
  );

  for (const { source, result, lines } of results) {
    runs.push(result.run);
    observations.push(...toObservations(result, ctx));
    if (lines) runs.push(lines.run);
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
    if (result.features.length > 0) {
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
          reason: first.failure ?? `${first.entry.name} returned no feeder here. That doesn't say another utility serves this site. The bill names the utility.`,
        }),
      );
    }
  }
  return { observations, features, runs, lines: measuredLines };
}
