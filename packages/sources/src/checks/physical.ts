import { area, booleanPointInPolygon, centroid } from "@turf/turf";
import type { BaseMap, MapFeature, Observation, Source, SourceRun } from "@eqore/contract";
import {
  observe,
  queryArcgis,
  sourceDateOf,
  toObservations,
  type ArcgisFeature,
  type ArcgisResult,
  type CollectContext,
  type PolygonGeometry,
} from "../arcgis.ts";
import { CENSUS_SOURCE } from "../geocode.ts";
import type { BuildingOutlines, ImageryConfig, ParcelLookup, RegionConfig } from "../registry.ts";
import type { SiteAnchor } from "../resolve-site.ts";
import { convertUnit } from "../units.ts";

export type PhysicalCollection = {
  observations: Observation[];
  features: MapFeature[];
  runs: SourceRun[];
  baseMap: BaseMap | null;
  location: [number, number];
  locationMethod: Observation["method"];
  parcelGeometry: PolygonGeometry | null;
};

function isPolygon(geometry: ArcgisFeature["geometry"]): geometry is PolygonGeometry {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// The assessor's stated size and the size of the drawn polygon, kept as two readings.
// They become a conflict later, by comparison, only if they differ beyond the tolerance.
function lotSizeObservations(lookup: ArcgisResult, parcelLookup: ParcelLookup, parcel: ArcgisFeature, ctx: CollectContext): Observation[] {
  const sourceDate = sourceDateOf(lookup.entry, parcel.attributes);
  const observations: Observation[] = [];
  const shared = { field: "lot_size_acres", objectId: parcel.objectId, sourceDate };
  const stated = parcel.attributes[parcelLookup.lotSizeAttribute];
  const units = String(parcel.attributes[parcelLookup.lotUnitsAttribute] ?? "acres").toLowerCase();

  if (typeof stated !== "number" || stated === 0) {
    observations.push(
      observe(lookup, ctx, { ...shared, kind: "no_value", value: null, attribute: parcelLookup.lotSizeAttribute, reason: `${parcelLookup.lotSizeAttribute} is blank or 0 in the source` }),
    );
  } else if (units.startsWith("acre") || units.startsWith("sq") || units === "sf") {
    const acres = units.startsWith("acre") ? stated : convertUnit(stated, "sqft", "acre");
    observations.push(
      observe(lookup, ctx, { ...shared, kind: "reading", value: { type: "quantity", value: acres, unit: "acre" }, attribute: parcelLookup.lotSizeAttribute, grade: "reference" }),
    );
  } else {
    observations.push(
      observe(lookup, ctx, { ...shared, kind: "no_value", value: null, attribute: parcelLookup.lotSizeAttribute, reason: `Unknown lot size unit: ${units}` }),
    );
  }

  if (isPolygon(parcel.geometry)) {
    const acres = round(convertUnit(area(parcel.geometry), "sqm", "acre"), 3);
    observations.push(
      observe(lookup, ctx, { ...shared, kind: "reading", value: { type: "quantity", value: acres, unit: "acre" }, attribute: "polygon area", method: "computed", grade: "reference" }),
    );
  }
  return observations;
}

type Outlines = { observations: Observation[]; features: MapFeature[]; run: SourceRun };

async function collectOutlines(buildings: BuildingOutlines, parcelGeometry: PolygonGeometry, yearBuilt: unknown, ctx: CollectContext): Promise<Outlines> {
  const result = await queryArcgis(buildings.entry, { kind: "polygon", geometry: parcelGeometry }, ctx);
  // A neighbor's roof can touch the query polygon, so keep outlines centered on this parcel.
  const inside = result.features.filter((feature) => isPolygon(feature.geometry) && booleanPointInPolygon(centroid(feature.geometry), parcelGeometry));
  if (inside.length === 0) {
    const reason = result.failure ?? `No roofprint is centered on this parcel (${result.query})`;
    return {
      observations: [observe(result, ctx, { field: "building_outline", kind: "no_value", value: null, reason })],
      features: [],
      run: result.failure ? result.run : { ...result.run, status: "missing", reason },
    };
  }
  const dates = inside.map((feature) => sourceDateOf(buildings.entry, feature.attributes)).filter((date): date is string => Boolean(date)).sort();
  const newest = dates.at(-1) ?? null;
  const roofYear = newest ? Number(newest.slice(0, 4)) : null;
  const staleOutline = typeof yearBuilt === "number" && yearBuilt > 0 && roofYear !== null && yearBuilt > roofYear;
  return {
    observations: [
      observe(result, ctx, {
        field: "building_outline",
        kind: "reading",
        value: { type: "text", value: inside.length === 1 ? "1 roofprint" : `${inside.length} roofprints` },
        objectId: inside.map((feature) => feature.objectId).sort().join(","),
        sourceDate: newest,
        grade: "reference",
        reason: staleOutline ? `The roofprint dates from ${roofYear}, before the ${yearBuilt} year built on the assessor record, so the outline may be out of date.` : undefined,
      }),
    ],
    features: inside.map((feature, index) => ({
      id: `building-${index + 1}`,
      kind: "building_outline",
      field: "building_outline",
      geometry: feature.geometry!,
      label: `Roofprint${feature.attributes[buildings.sourceDateAttribute] ? `, ${sourceDateOf(buildings.entry, feature.attributes)}` : ""} (not surveyed)`,
    })),
    run: result.run,
  };
}

function imagerySource(imagery: ImageryConfig): Source {
  return { id: imagery.id, name: imagery.name, kind: "arcgis_rest", dataOrigin: "real", url: imagery.serviceUrl, licenseNote: imagery.licenseNote };
}

function imageryObservation(imagery: ImageryConfig, ctx: CollectContext): { observation: Observation; run: SourceRun } {
  const origin = { source: imagerySource(imagery), query: `tiles ${imagery.tileUrlTemplate}`, retrievedAt: ctx.now() };
  return {
    observation: observe(origin, ctx, {
      field: "aerial_image",
      kind: "reading",
      value: { type: "text", value: imagery.description },
      sourceDate: imagery.sourceDate,
      grade: "reference",
    }),
    run: { sourceId: imagery.id, name: imagery.name, status: "done" },
  };
}

function baseMapOf(imagery: ImageryConfig, center: [number, number]): BaseMap {
  return {
    tileUrlTemplate: imagery.tileUrlTemplate,
    attribution: imagery.attribution,
    sourceId: imagery.id,
    sourceDate: imagery.sourceDate,
    maxZoom: imagery.maxZoom,
    center,
    zoom: 17,
  };
}

const HAND_PLACED_SOURCE: Source = { id: "engineer-pin", name: "Map pin placed by the engineer", kind: "human_evidence", dataOrigin: "real" };

function locationObservation(anchor: SiteAnchor, location: [number, number], lookup: ArcgisResult | undefined, ctx: CollectContext): { observation: Observation; method: Observation["method"] } {
  const value = { type: "text" as const, value: `${round(location[1], 6)}, ${round(location[0], 6)}` };
  if (anchor.kind === "parcel" && !anchor.pin) {
    return {
      method: "computed",
      observation: observe(lookup!, ctx, { field: "site_location", kind: "reading", value, attribute: "parcel centroid", objectId: anchor.parcel.objectId, method: "computed", grade: "reference" }),
    };
  }
  if ((anchor.kind === "parcel" && anchor.pin) || (anchor.kind === "point" && anchor.method === "hand_placed")) {
    const origin = { source: HAND_PLACED_SOURCE, query: `pin ${location.join(",")}`, retrievedAt: ctx.now() };
    return { method: "hand_placed", observation: observe(origin, ctx, { field: "site_location", kind: "reading", value, method: "hand_placed", grade: "layout" }) };
  }
  const geocode = anchor.kind === "point" ? anchor.geocode : undefined;
  const origin = { source: CENSUS_SOURCE, query: geocode?.query ?? "address", retrievedAt: geocode?.retrievedAt ?? ctx.now() };
  return {
    method: "geocoded_interpolated",
    observation: observe(origin, ctx, {
      field: "site_location",
      kind: "reading",
      value,
      method: "geocoded_interpolated",
      grade: "reference",
      reason: "This point is interpolated along the street, so it isn't a located building.",
    }),
  };
}

// Fills the physical half of the record. Each source fails on its own, with its reason.
export async function collectPhysical(region: RegionConfig, anchor: SiteAnchor, ctx: CollectContext): Promise<PhysicalCollection> {
  const observations: Observation[] = [];
  const features: MapFeature[] = [];
  const runs: SourceRun[] = [];

  const lookup = anchor.kind === "parcel" ? anchor.lookup : anchor.parcelLookup;
  let parcelGeometry: PolygonGeometry | null = null;
  let location: [number, number];

  if (anchor.kind === "parcel" && region.parcels) {
    const parcel = anchor.parcel;
    runs.push(anchor.lookup.run);
    observations.push(...toObservations(anchor.lookup, ctx, [parcel]));
    observations.push(...lotSizeObservations(anchor.lookup, region.parcels, parcel, ctx));
    if (isPolygon(parcel.geometry)) {
      parcelGeometry = parcel.geometry;
      observations.push(
        observe(anchor.lookup, ctx, {
          field: "property_line",
          kind: "reading",
          value: { type: "text", value: "Parcel polygon from the assessor layer, not a survey" },
          objectId: parcel.objectId,
          attribute: "geometry",
          sourceDate: sourceDateOf(anchor.lookup.entry, parcel.attributes),
          grade: "reference",
        }),
      );
      features.push({ id: "property-line", kind: "property_line", field: "property_line", geometry: parcel.geometry, label: "Property line (not surveyed)" });
      location = centroid(parcel.geometry).geometry.coordinates as [number, number];
    } else {
      observations.push(observe(anchor.lookup, ctx, { field: "property_line", kind: "no_value", value: null, objectId: parcel.objectId, reason: "The parcel came back with no polygon" }));
      location = anchor.pin ? [anchor.pin.longitude, anchor.pin.latitude] : [0, 0];
    }
    if (anchor.pin) location = [anchor.pin.longitude, anchor.pin.latitude];
  } else {
    if (anchor.kind !== "point") throw new Error("A parcel anchor needs a region with a parcel source");
    location = [anchor.longitude, anchor.latitude];
    if (anchor.parcelLookup) {
      runs.push(anchor.parcelLookup.run);
      observations.push(...toObservations(anchor.parcelLookup, ctx, []));
    }
  }

  const located = locationObservation(anchor, location, lookup, ctx);
  observations.push(located.observation);

  if (region.buildings && parcelGeometry) {
    const yearBuilt = anchor.kind === "parcel" ? anchor.parcel.attributes.YEAR_BUILT : null;
    const outlines = await collectOutlines(region.buildings, parcelGeometry, yearBuilt, ctx);
    observations.push(...outlines.observations);
    features.push(...outlines.features);
    runs.push(outlines.run);
  }

  let baseMap: BaseMap | null = null;
  if (region.imagery) {
    const imagery = imageryObservation(region.imagery, ctx);
    observations.push(imagery.observation);
    runs.push(imagery.run);
    baseMap = baseMapOf(region.imagery, location);
  }

  return { observations, features, runs, baseMap, location, locationMethod: located.method, parcelGeometry };
}
