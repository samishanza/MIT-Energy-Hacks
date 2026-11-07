import type { Geometry, MapFeature, Observation, ObservedValue, SourceRun } from "@eqore/contract";
import { observe, queryArcgis, readMapping, sourceDateOf, toObservations, type ArcgisFeature, type ArcgisResult, type CollectContext, type PolygonGeometry, type SpatialQuery } from "./arcgis.ts";
import { feetBetween } from "./geometry.ts";
import type { LayerSource } from "./registry.ts";
import { normalizeStreet, parseAddress } from "./resolve-site.ts";

export type LayerAnchor = { parcel: PolygonGeometry | null; location: [number, number] };

export type LayerCollection = { observations: Observation[]; features: MapFeature[]; run: SourceRun; result: ArcgisResult };

function queryFor(source: LayerSource, anchor: LayerAnchor): SpatialQuery {
  const bufferMeters = source.entry.searchRadiusMeters;
  return anchor.parcel
    ? { kind: "polygon", geometry: anchor.parcel, bufferMeters }
    : { kind: "point", longitude: anchor.location[0], latitude: anchor.location[1], bufferMeters };
}

function anchorGeometry(anchor: LayerAnchor): Geometry {
  return anchor.parcel ?? { type: "Point", coordinates: anchor.location };
}

function closestTo(anchor: Geometry, features: ArcgisFeature[]): { feature: ArcgisFeature; feet: number }[] {
  return features
    .filter((feature) => feature.geometry)
    .map((feature) => ({ feature, feet: feetBetween(anchor, feature.geometry!) }))
    .sort((a, b) => a.feet - b.feet || a.feature.objectId.localeCompare(b.feature.objectId));
}

function pickOne(source: Extract<LayerSource["mode"], { kind: "one" }>, features: ArcgisFeature[], anchor: Geometry, address: string): { feature: ArcgisFeature | null; note?: string } {
  const nearest = closestTo(anchor, features);
  if (source.pick === "first") return { feature: nearest[0]?.feature ?? features[0] ?? null };
  const street = parseAddress(address)?.street.replace(/^\S+\s+/, "");
  const attribute = source.streetAttribute!;
  const onStreet = nearest.find(({ feature }) => normalizeStreet(String(feature.attributes[attribute] ?? "")) === street);
  if (onStreet) return { feature: onStreet.feature };
  const fallback = nearest[0]?.feature ?? null;
  return { feature: fallback, note: fallback ? `This is the closest mapped road, ${String(fallback.attributes[attribute] ?? "with no name")}. It isn't the street in the address.` : undefined };
}

function collectOne(source: LayerSource, mode: Extract<LayerSource["mode"], { kind: "one" }>, result: ArcgisResult, anchor: LayerAnchor, address: string, ctx: CollectContext): Observation[] {
  if (result.features.length === 0) {
    return source.entry.fields.map((mapping) =>
      observe(result, ctx, { field: mapping.field, kind: "no_value", value: null, attribute: mapping.attribute, reason: result.failure ?? mode.emptyReason ?? `The source returned nothing for ${result.query}` }),
    );
  }
  // Areas that overlap the site, such as flood zones, keep every distinct answer in one reading.
  if (mode.pick === "all_distinct") {
    return source.entry.fields.map((mapping) => {
      const read = result.features.flatMap((feature) => {
        const value = readMapping(mapping, feature);
        return "value" in value && value.value.type === "text" ? [value.value.value] : [];
      });
      const distinct = [...new Set(read)].sort();
      if (distinct.length === 0) return observe(result, ctx, { field: mapping.field, kind: "no_value", value: null, attribute: mapping.attribute, reason: `${mapping.attribute} is blank in the source` });
      return observe(result, ctx, { field: mapping.field, kind: "reading", value: { type: "text", value: distinct.join(", ") }, attribute: mapping.attribute, grade: mapping.grade, sourceDate: sourceDateOf(source.entry, result.features[0]!.attributes) });
    });
  }
  const { feature, note } = pickOne(mode, result.features, anchorGeometry(anchor), address);
  if (!feature) return toObservations(result, ctx, []);
  return toObservations(result, ctx, [feature]).map((observation) =>
    note && observation.kind === "reading" ? observe(result, ctx, { field: observation.field, kind: "reading", value: observation.value, attribute: observation.locator.attribute, objectId: observation.locator.objectId, sourceDate: observation.sourceDate, grade: observation.grade, reason: note }) : observation,
  );
}

function collectItems(source: LayerSource, mode: Extract<LayerSource["mode"], { kind: "items" }>, result: ArcgisResult, anchor: LayerAnchor, ctx: CollectContext): { observations: Observation[]; features: MapFeature[] } {
  const from = anchorGeometry(anchor);
  const radius = source.entry.searchRadiusMeters;
  if (result.failure) {
    return { observations: [observe(result, ctx, { field: mode.field, kind: "no_value", value: null, reason: result.failure })], features: [] };
  }
  const items = closestTo(from, result.features);
  if (items.length === 0) {
    const none = mode.absent === "none_mapped"
      ? observe(result, ctx, { field: mode.field, kind: "reading", value: { type: "text", value: `None mapped within ${radius} m` }, attribute: "search result", grade: "reference", reason: `This means none are mapped within ${radius} m of the site, not that none exist.` })
      : observe(result, ctx, { field: mode.field, kind: "no_value", value: null, reason: `The source returned nothing within ${radius} m, which doesn't show there are none.` });
    return { observations: [none], features: [] };
  }

  const named = (feature: ArcgisFeature) => String(feature.attributes[mode.nameAttribute] ?? mode.noun);
  const dates = items.map(({ feature }) => sourceDateOf(source.entry, feature.attributes)).filter((date): date is string => Boolean(date)).sort();
  const closest = items[0]!;
  const summary = `${items.length} ${items.length === 1 ? mode.noun : mode.plural} within ${radius} m. Nearest: ${named(closest.feature)}, about ${Math.round(closest.feet)} ft`;
  const observations = [
    observe(result, ctx, {
      field: mode.field,
      kind: "reading",
      value: { type: "text", value: summary },
      attribute: mode.nameAttribute,
      objectId: items.map(({ feature }) => feature.objectId).sort().join(","),
      sourceDate: dates.at(-1) ?? null,
      grade: "reference",
      reason: mode.note,
    }),
  ];
  const features: MapFeature[] = items.slice(0, mode.limit).flatMap(({ feature, feet }, index) => {
    if (!feature.geometry) return [];
    const attributes: Record<string, ObservedValue> = { distance_ft: { type: "quantity", value: Math.round(feet), unit: "ft" } };
    for (const mapping of source.entry.fields) {
      const read = readMapping(mapping, feature);
      if ("value" in read) attributes[mapping.field] = read.value;
    }
    return [{ id: `${source.entry.id}-${index + 1}`, kind: mode.feature, field: mode.field, geometry: feature.geometry, label: named(feature), attributes }];
  });
  return { observations, features };
}

// Runs one configured layer. New layers need an entry in a region's list, and no code here.
export async function collectLayer(source: LayerSource, anchor: LayerAnchor, address: string, ctx: CollectContext): Promise<LayerCollection> {
  const result = await queryArcgis(source.entry, queryFor(source, anchor), ctx);
  if (source.mode.kind === "one") {
    return { observations: collectOne(source, source.mode, result, anchor, address, ctx), features: [], run: result.run, result };
  }
  const { observations, features } = collectItems(source, source.mode, result, anchor, ctx);
  return { observations, features, run: result.run, result };
}


