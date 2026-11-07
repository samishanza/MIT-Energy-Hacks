import { createHash, randomUUID } from "node:crypto";
import { applyTransform } from "./transforms.ts";
import { booleanClockwise, distance, nearestPointOnLine } from "@turf/turf";
import type { Geometry, Observation, ObservedValue, Source, SourceRun } from "@eqore/contract";
import { ObservationSchema } from "@eqore/contract";
import { convertUnit } from "./units.ts";
import { sourceOf, type ArcgisEntry, type FieldMapping, type SourceDateFormat } from "./registry.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type PolygonGeometry = Extract<Geometry, { type: "Polygon" | "MultiPolygon" }>;

export type SpatialQuery =
  | { kind: "attribute"; where: string }
  | { kind: "point"; longitude: number; latitude: number; bufferMeters?: number }
  | { kind: "polygon"; geometry: PolygonGeometry; bufferMeters?: number };

export type ArcgisFeature = {
  objectId: string;
  attributes: Record<string, unknown>;
  geometry: Geometry | null;
};

export type ArcgisResult = {
  entry: ArcgisEntry;
  query: string;
  retrievedAt: string;
  features: ArcgisFeature[];
  run: SourceRun;
  failure?: string;
};

export type CollectContext = {
  siteId: string;
  fetch: FetchLike;
  now: () => string;
  newId?: () => string;
  retryDelayMs?: number;
  // Names of the API keys the live fetch can supply. The keys themselves never come through here.
  availableKeys?: string[];
  // The Earth Engine runner the caller signed in, or why there isn't one.
  earthEngine?: import("./earthengine.ts").EarthEngineRunner | { missing: string };
  runDeadlineMs?: number;
  // Lidar slope sampling lives in the agent layer, so the caller passes it in.
  measureSlope?: (box: { west: number; south: number; east: number; north: number }, fetchImpl: FetchLike) => Promise<{ slopePercent: number; sampleCount: number; demResolutionFt: number; aspectDegrees?: number } | null>;
};

// Replayed responses carry the time they were really retrieved.
export const RECORDED_AT_HEADER = "x-recorded-at";

const SERVICE_ERROR_RETRIES = 3;
// Longer than the slowest answer measured from MassGIS, so a slow query isn't cut off before it can finish.
const QUERY_TIMEOUT_MS = 70_000;

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function describeQuery(query: SpatialQuery): string {
  if (query.kind === "attribute") return `where ${query.where}`;
  const buffer = `buffer ${query.bufferMeters ?? 0} m`;
  if (query.kind === "point") return `point ${query.longitude},${query.latitude}, ${buffer}`;
  return `polygon ${sha256(JSON.stringify(query.geometry)).slice(0, 16)}, ${buffer}`;
}

function toEsriGeometry(query: Exclude<SpatialQuery, { kind: "attribute" }>) {
  if (query.kind === "point") {
    return {
      geometryType: "esriGeometryPoint",
      geometry: JSON.stringify({ x: query.longitude, y: query.latitude, spatialReference: { wkid: 4326 } }),
    };
  }
  const rings = query.geometry.type === "Polygon" ? query.geometry.coordinates : query.geometry.coordinates.flat();
  return {
    geometryType: "esriGeometryPolygon",
    geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
  };
}

export function queryParams(entry: ArcgisEntry, query: SpatialQuery): URLSearchParams {
  const params = new URLSearchParams({
    f: "json",
    outFields: entry.outFields.join(","),
    returnGeometry: entry.attributesOnly ? "false" : "true",
    outSR: "4326",
  });
  if (query.kind === "attribute") {
    params.set("where", query.where);
    return params;
  }
  const { geometry, geometryType } = toEsriGeometry(query);
  params.set("where", "1=1");
  params.set("geometry", geometry);
  params.set("geometryType", geometryType);
  params.set("inSR", "4326");
  params.set("spatialRel", "esriSpatialRelIntersects");
  if (query.bufferMeters) {
    params.set("distance", String(query.bufferMeters));
    params.set("units", "esriSRUnit_Meter");
  }
  return params;
}

type Position = [number, number];

function toGeometry(raw: unknown): Geometry | null {
  if (!raw || typeof raw !== "object") return null;
  const shape = raw as { x?: number; y?: number; paths?: Position[][]; rings?: Position[][] };
  if (typeof shape.x === "number" && typeof shape.y === "number") {
    return { type: "Point", coordinates: [shape.x, shape.y] };
  }
  if (shape.paths?.length) {
    return shape.paths.length === 1
      ? { type: "LineString", coordinates: shape.paths[0]! }
      : { type: "MultiLineString", coordinates: shape.paths };
  }
  if (shape.rings?.length) {
    // Esri lists each outer ring clockwise, followed by its holes.
    const polygons: Position[][][] = [];
    for (const ring of shape.rings) {
      if (booleanClockwise(ring) || polygons.length === 0) polygons.push([ring]);
      else polygons[polygons.length - 1]!.push(ring);
    }
    return polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0]! }
      : { type: "MultiPolygon", coordinates: polygons };
  }
  return null;
}

function distanceToGeometry(from: Position, geometry: Geometry | null): number {
  if (!geometry) return Number.POSITIVE_INFINITY;
  const lines =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : [];
  if (lines.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...lines.map((line) =>
      distance(from, nearestPointOnLine({ type: "LineString", coordinates: line }, from), { units: "meters" }),
    ),
  );
}

// Keeps one feature per group, so sections of one feeder don't read as several feeders.
// This never chooses between groups: every feeder stays a candidate.
function keepNearestPerGroup(features: ArcgisFeature[], attribute: string, anchor: Position | null): ArcgisFeature[] {
  const best = new Map<string, { feature: ArcgisFeature; meters: number }>();
  for (const feature of features) {
    const key = String(feature.attributes[attribute] ?? feature.objectId);
    const meters = anchor ? distanceToGeometry(anchor, feature.geometry) : 0;
    const current = best.get(key);
    if (!current || meters < current.meters) best.set(key, { feature, meters });
  }
  return [...best.values()].map(({ feature }) => feature);
}

function anchorOf(query: SpatialQuery): Position | null {
  if (query.kind === "point") return [query.longitude, query.latitude];
  if (query.kind === "polygon") {
    const ring = query.geometry.type === "Polygon" ? query.geometry.coordinates[0] : query.geometry.coordinates[0]?.[0];
    return ring?.[0] ?? null;
  }
  return null;
}

export async function queryArcgis(entry: ArcgisEntry, query: SpatialQuery, ctx: CollectContext): Promise<ArcgisResult> {
  const description = describeQuery(query);
  const base = { entry, query: description, retrievedAt: ctx.now() };

  if (entry.barred) {
    return {
      ...base,
      features: [],
      run: { sourceId: entry.id, name: entry.name, status: "person_only", reason: entry.barred.reason },
      failure: entry.barred.reason,
    };
  }

  const fail = (reason: string, retrievedAt = base.retrievedAt): ArcgisResult => ({
    ...base,
    retrievedAt,
    features: [],
    run: { sourceId: entry.id, name: entry.name, status: "missing", reason },
    failure: reason,
  });

  type QueryBody = { error?: { message?: string }; features?: { attributes: Record<string, unknown>; geometry?: unknown }[] };
  let body: QueryBody = {};
  let retrievedAt = base.retrievedAt;

  // A cold MassGIS parcel query can run about 55 seconds and then answer with an "invalid query"
  // error body. The same query then succeeds, usually within seconds.
  for (let attempt = 0; attempt <= SERVICE_ERROR_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, (ctx.retryDelayMs ?? 1500) * attempt));
    let response: Response;
    try {
      response = await ctx.fetch(`${entry.serviceUrl}/${entry.layer}/query`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: queryParams(entry, query).toString(),
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = (error as Error).name === "TimeoutError";
      if (timedOut && attempt < SERVICE_ERROR_RETRIES) continue;
      return fail(timedOut ? `The service didn't answer within ${QUERY_TIMEOUT_MS / 1000} seconds` : `The service could not be reached: ${(error as Error).message}`);
    }
    retrievedAt = response.headers.get(RECORDED_AT_HEADER) ?? base.retrievedAt;
    if (!response.ok) return fail(`The service returned HTTP ${response.status}`, retrievedAt);
    try {
      body = (await response.json()) as QueryBody;
    } catch {
      return fail("The service returned a response that wasn't JSON", retrievedAt);
    }
    if (!body.error) break;
  }
  if (body.error) return fail(`The service returned an error: ${body.error.message ?? "no message"}`, retrievedAt);

  let features: ArcgisFeature[] = (body.features ?? []).map((feature) => ({
    objectId: String(feature.attributes[entry.objectIdAttribute] ?? ""),
    attributes: feature.attributes,
    geometry: toGeometry(feature.geometry),
  }));
  if (entry.groupByAttribute) features = keepNearestPerGroup(features, entry.groupByAttribute, anchorOf(query));

  return {
    ...base,
    retrievedAt,
    features,
    run: features.length
      ? { sourceId: entry.id, name: entry.name, status: "done" }
      : { sourceId: entry.id, name: entry.name, status: "missing", reason: `No features for ${description}` },
  };
}

function formatSourceDate(raw: unknown, format: SourceDateFormat): string | null {
  if (raw === null || raw === undefined || raw === "" || raw === 0) return null;
  switch (format) {
    case "fiscal_year":
      return `FY${raw}`;
    case "yyyymmdd": {
      // Roofprint dates carry zeros for the month and day they don't know, such as 20110000.
      const text = String(raw);
      const [year, month, day] = [text.slice(0, 4), text.slice(4, 6), text.slice(6, 8)];
      if (month === "00" || !month) return year;
      return day === "00" || !day ? `${year}-${month}` : `${year}-${month}-${day}`;
    }
    case "epoch_ms":
      return typeof raw === "number" ? new Date(raw).toISOString().slice(0, 10) : String(raw);
    case "text":
      return String(raw);
  }
}

export function sourceDateOf(entry: ArcgisEntry, attributes: Record<string, unknown>): string | null {
  if (!entry.sourceDate) return null;
  if ("fixed" in entry.sourceDate) return entry.sourceDate.fixed;
  return formatSourceDate(attributes[entry.sourceDate.attribute], entry.sourceDate.format);
}

type NewObservation = {
  field: string;
  kind: "reading" | "no_value";
  value: ObservedValue | null;
  method?: Observation["method"];
  attribute?: string;
  objectId?: string;
  sourceDate?: string | null;
  grade?: Observation["grade"];
  reason?: string;
};

export type ObservationOrigin = { source: Source; query: string; retrievedAt: string };

// Builds one observation. Evidence identity is source, query, and a hash of the content,
// so a repeat read of unchanged data can be recognized later.
export function observe(origin: ArcgisResult | ObservationOrigin, ctx: CollectContext, input: NewObservation): Observation {
  const source = "source" in origin ? origin.source : sourceOf(origin.entry);
  const content = JSON.stringify([input.field, input.kind, input.value, input.attribute, input.objectId, input.reason]);
  return ObservationSchema.parse({
    id: ctx.newId?.() ?? randomUUID(),
    siteId: ctx.siteId,
    field: input.field,
    kind: input.kind,
    value: input.value,
    source,
    retrievedAt: origin.retrievedAt,
    sourceDate: input.sourceDate ?? null,
    method: input.method ?? "source_read",
    locator: { query: origin.query, attribute: input.attribute, objectId: input.objectId },
    identity: { sourceId: source.id, query: origin.query, contentHash: sha256(content) },
    grade: input.grade,
    reason: input.reason,
    synthetic: false,
  });
}

export function readMapping(mapping: FieldMapping, feature: ArcgisFeature): { value: ObservedValue } | { reason: string } {
  if (mapping.constant) return { value: mapping.constant };
  if (mapping.transform) return applyTransform(mapping.transform, mapping.attribute, feature.attributes, mapping.sentinels);
  const attribute = mapping.attribute!;
  const raw = feature.attributes[attribute];
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    return { reason: `${attribute} is blank in the source` };
  }
  if (mapping.type === "quantity") {
    const number = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(number)) return { reason: `${attribute} isn't a number: ${String(raw)}` };
    if (mapping.sentinels?.includes(number)) return { reason: `${attribute} is ${number}, which the source uses to mean no value` };
    if (number === 0 && mapping.zeroIsMissing) {
      return { reason: `${attribute} is 0 in the source, which can't be true, so it's stored as missing` };
    }
    const unit = mapping.unit!;
    return { value: { type: "quantity", value: convertUnit(number, mapping.sourceUnit ?? unit, unit), unit } };
  }
  const text = String(raw).trim();
  if (mapping.blankValues?.includes(text)) return { reason: `${attribute} is ${text} in the source, which means it has no value` };
  return { value: { type: "text", value: text } };
}

// Maps features to observations through the entry's field table, with no source-specific code.
// A note goes on every reading, and an empty reason replaces the generic one when the source answered with nothing.
export function toObservations(result: ArcgisResult, ctx: CollectContext, features = result.features, explain: { note?: string; emptyReason?: string } = {}): Observation[] {
  const { entry } = result;
  if (features.length === 0) {
    const reason = result.failure ?? explain.emptyReason ?? `The source returned nothing for ${result.query}`;
    return entry.fields.map((mapping) =>
      observe(result, ctx, { field: mapping.field, kind: "no_value", value: null, attribute: mapping.attribute, reason }),
    );
  }
  return features.flatMap((feature) =>
    entry.fields.map((mapping) => {
      const shared = {
        field: mapping.field,
        attribute: mapping.attribute,
        objectId: feature.objectId,
        sourceDate: sourceDateOf(entry, feature.attributes),
      };
      const read = readMapping(mapping, feature);
      return "value" in read
        ? observe(result, ctx, { ...shared, kind: "reading", value: read.value, grade: mapping.grade, reason: explain.note })
        : observe(result, ctx, { ...shared, kind: "no_value", value: null, reason: read.reason });
    }),
  );
}
