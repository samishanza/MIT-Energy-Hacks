import { area, buffer, difference, featureCollection, intersect, polygon as turfPolygon, multiPolygon, union } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { MapFeature, Observation, SourceRun } from "@eqore/contract";
import { observe, queryArcgis, type CollectContext, type PolygonGeometry } from "../arcgis.ts";
import type { ArcgisEntry } from "../registry.ts";

// Paved parking and drives on the lot: the impervious land cover mapped from 2016 aerial imagery, inside the
// lot, less the buildings and the public road surface. The land cover doesn't tell a parking stall from a drive
// aisle or a sidewalk, so each area is paved surface, which a person divides into stalls and aisles.

export type PavedSurfaces = { entry: ArcgisEntry; coverAttribute: string; imperviousCode: number; sourceDate: string };
export type PavedCollection = { observations: Observation[]; features: MapFeature[]; run: SourceRun };

const SQFT_PER_SQM = 10.7639;
// Pieces smaller than this are slivers left at edges, not lots.
const MIN_AREA_SQM = 60;

type Shape = Feature<Polygon | MultiPolygon>;
const asShape = (geometry: PolygonGeometry): Shape => (geometry.type === "Polygon" ? turfPolygon(geometry.coordinates as number[][][]) : multiPolygon(geometry.coordinates as number[][][][]));
const merge = (shapes: Shape[]): Shape | null => (shapes.length === 0 ? null : shapes.length === 1 ? shapes[0]! : (union(featureCollection(shapes)) as Shape | null));
const minus = (shape: Shape | null, cut: Shape | null): Shape | null => (shape && cut ? (difference(featureCollection([shape, cut])) as Shape | null) : shape);

export async function collectPavedSurfaces(
  config: PavedSurfaces,
  parcel: PolygonGeometry,
  buildings: PolygonGeometry[],
  roads: { line: number[][]; halfWidthM: number }[],
  ctx: CollectContext,
): Promise<PavedCollection> {
  const result = await queryArcgis(config.entry, { kind: "polygon", geometry: parcel, bufferMeters: 0 }, ctx);
  if (result.failure) {
    return { observations: [observe(result, ctx, { field: "paved_area_sqft", kind: "no_value", value: null, reason: result.failure })], features: [], run: result.run };
  }
  const impervious = result.features
    .filter((feature) => Number(feature.attributes[config.coverAttribute]) === config.imperviousCode && feature.geometry && (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"))
    .map((feature) => asShape(feature.geometry as PolygonGeometry));

  let paved = merge(impervious);
  paved = paved ? (intersect(featureCollection([paved, asShape(parcel)])) as Shape | null) : null;
  paved = minus(paved, merge(buildings.map((building) => buffer(asShape(building), 0.5, { units: "meters" }) as Shape)));
  const streets = roads.filter((road) => road.line.length > 1).map((road) => buffer({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: road.line } }, road.halfWidthM, { units: "meters" }) as Shape);
  paved = minus(paved, merge(streets));

  const pieces: number[][][][] = !paved ? [] : paved.geometry.type === "Polygon" ? [paved.geometry.coordinates] : paved.geometry.coordinates;
  const kept = pieces.map((coordinates) => ({ coordinates, sqm: area(turfPolygon(coordinates)) })).filter((piece) => piece.sqm >= MIN_AREA_SQM).sort((a, b) => b.sqm - a.sqm);
  const totalSqft = Math.round(kept.reduce((sum, piece) => sum + piece.sqm, 0) * SQFT_PER_SQM);

  const reason = `Impervious land cover from ${config.entry.name}, mapped from ${config.sourceDate} aerial imagery, inside the lot, less the buildings and the public road surface. It doesn't separate parking stalls from drive aisles and walks.`;
  const features: MapFeature[] = kept.map((piece, index) => ({
    id: `paved-area-${index + 1}`,
    kind: "constraint",
    field: "paved_area_sqft",
    geometry: { type: "Polygon", coordinates: piece.coordinates.map((ring) => ring.map(([x, y]) => [x!, y!] as [number, number])) },
    label: "(E) PAVED PARKING AND DRIVES",
    attributes: {
      surface_kind: { type: "text", value: "paved_parking_and_drives" },
      area_sqft: { type: "quantity", value: Math.round(piece.sqm * SQFT_PER_SQM), unit: "sqft" },
      basis: { type: "text", value: "public map" },
      confidence_reason: { type: "text", value: reason },
    },
  }));
  const observations = [
    kept.length
      ? observe(result, ctx, { field: "paved_area_sqft", kind: "reading", value: { type: "quantity", value: totalSqft, unit: "sqft" }, attribute: config.coverAttribute, sourceDate: config.sourceDate, grade: "reference", reason })
      : observe(result, ctx, { field: "paved_area_sqft", kind: "no_value", value: null, attribute: config.coverAttribute, reason: "No impervious land cover is mapped on the lot outside the buildings and roads." }),
  ];
  return { observations, features, run: result.run };
}
