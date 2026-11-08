import type { MapFeature, Observation, Source, SourceRun } from "@eqore/contract";
import { observe, type ArcgisFeature, type CollectContext, type PolygonGeometry } from "../arcgis.ts";
import type { LidarPoint } from "../ept.ts";
import { normalizeStreet, streetNameOf } from "../resolve-site.ts";
import { detectEquipment, type Road } from "./lidar-equipment.ts";

type Point = [number, number];

export type LidarConfig = { bases: string[]; source: Source; sourceDate: string };
export type ReadLidar = (bases: string[], center: Point, halfMeters: number, fetchImpl: CollectContext["fetch"]) => Promise<{ base: string; points: LidarPoint[] } | null>;

export type LidarCollection = { observations: Observation[]; features: MapFeature[]; run: SourceRun; servicePathDetected: boolean };

const FEET = 3.280839895;
const BASIS = { type: "text" as const, value: "detected (lidar)" };
const text = (value: string) => ({ type: "text" as const, value });

function sideOf(center: Point, point: Point): string {
  const degrees = (Math.atan2(point[0] - center[0], point[1] - center[1]) * 180) / Math.PI;
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(((degrees + 360) % 360) / 45) % 8]!;
}

// Poles, overhead conductors, a service drop, and pad-mount candidates, found by shape in public lidar around the
// buildings and the road in front of them. Where a drop is found, it shows how the building is fed.
export async function collectLidarEquipment(
  config: LidarConfig,
  read: ReadLidar,
  buildings: PolygonGeometry[],
  roadFeatures: ArcgisFeature[],
  roadName: string,
  address: string,
  ctx: CollectContext,
): Promise<LidarCollection | null> {
  if (buildings.length === 0) return null;
  const source = config.source;
  const run = (status: SourceRun["status"], reason?: string): SourceRun => ({ sourceId: source.id, name: source.name, status, ...(reason ? { reason } : {}) });
  const vertices = buildings.flatMap((polygon) => (polygon.type === "Polygon" ? polygon.coordinates[0]! : polygon.coordinates.flatMap((part) => part[0]!))) as Point[];
  const lons = vertices.map(([lon]) => lon), lats = vertices.map(([, lat]) => lat);
  const center: Point = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
  const perLon = 111320 * Math.cos((center[1] * Math.PI) / 180);
  const local = ([lon, lat]: Point): Point => [(lon - center[0]) * perLon, (lat - center[1]) * 111320];
  const lonLat = ([x, y]: Point): Point => [center[0] + x / perLon, center[1] + y / 111320];
  // The buildings and 40 m around them, which reaches the poles on the road in front.
  const half = Math.min(200, Math.max(...vertices.map(local).map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) + 40);
  const query = `points within ${Math.round(half)} m of ${center[0].toFixed(5)},${center[1].toFixed(5)}`;
  const origin = (retrievedAt: string) => ({ source, query, retrievedAt });
  const missing = (reason: string): LidarCollection => ({
    observations: [observe(origin(ctx.now()), ctx, { field: "detected_grid_equipment", kind: "no_value", value: null, reason })],
    features: [],
    run: run("missing", reason),
    servicePathDetected: false,
  });

  let found: Awaited<ReturnType<ReadLidar>>;
  try {
    found = await read(config.bases, center, half, ctx.fetch);
  } catch (error) {
    return missing(`The lidar couldn't be read: ${(error as Error).message}`);
  }
  if (!found) return missing("No configured lidar collection covers this site.");

  const street = streetNameOf(address);
  const roads: Road[] = roadFeatures
    .filter((feature) => feature.geometry && (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString"))
    .flatMap((feature) => {
      const name = String(feature.attributes[roadName] ?? "unnamed road");
      const lines = (feature.geometry!.type === "LineString" ? [feature.geometry!.coordinates] : feature.geometry!.coordinates) as Point[][];
      return lines.map((line) => ({ name, line: line.map(local), onAddress: normalizeStreet(name) === street }));
    });
  const detection = detectEquipment(found.points, buildings.map((polygon) => (polygon.type === "Polygon" ? polygon.coordinates[0]! : polygon.coordinates[0]![0]!).map((point) => local(point as Point))), roads);
  const retrievedAt = ctx.now();
  const shared = (equipment: string, reason: string) => ({ equipment_type: text(equipment), basis: BASIS, confidence_reason: text(reason) });

  const features: MapFeature[] = [];
  detection.poles.forEach((pole, index) =>
    features.push({
      id: `lidar-pole-${index + 1}`,
      kind: "existing_equipment",
      field: "detected_grid_equipment",
      geometry: { type: "Point", coordinates: lonLat(pole.at) },
      label: "(E) UTILITY POLE",
      attributes: {
        ...shared("utility_pole", `A column of returns ${pole.low.toFixed(1)} to ${pole.high.toFixed(1)} m above ground, half a metre wide, with open air around it, ${pole.roadFeet} ft from ${pole.road}.`),
        height_ft: { type: "quantity", value: Math.round(pole.high * FEET), unit: "ft" },
      },
    }),
  );
  detection.conductors.forEach((span, index) =>
    features.push({
      id: `lidar-conductor-${index + 1}`,
      kind: "utility_line",
      field: "detected_grid_equipment",
      geometry: { type: "LineString", coordinates: [lonLat(span.from), lonLat(span.to)] },
      label: "(E) OVERHEAD CONDUCTOR",
      attributes: {
        ...shared("overhead_conductor", `${span.returns} returns about ${span.heightM.toFixed(1)} m up, covering ${Math.round(span.coverage * 100)}% of the ${Math.round(span.lengthM * FEET)} ft between two detected poles.`),
        line_class: text("detected overhead conductor"),
      },
    }),
  );
  const pads = detection.padMounts.map((pad, index): MapFeature => ({
    id: `lidar-pad-mount-${index + 1}`,
    kind: "existing_equipment",
    field: "detected_grid_equipment",
    geometry: { type: "Point", coordinates: lonLat(pad.at) },
    label: "(E) EQUIPMENT BOX",
    attributes: shared(
      "pad_mount_transformer_candidate",
      `A box about ${pad.widthM} by ${pad.depthM} m and ${pad.heightM.toFixed(1)} m tall, ${Math.round(pad.wallM * FEET)} ft from the building. It could also be other equipment, a dumpster, or a vehicle.`,
    ),
  }));
  features.push(...pads);

  const observations: Observation[] = [];
  const counts = [
    `${detection.poles.length} pole${detection.poles.length === 1 ? "" : "s"}`,
    `${detection.conductors.length} conductor span${detection.conductors.length === 1 ? "" : "s"}`,
    detection.drop ? "a likely service drop" : "no service drop",
    `${detection.padMounts.length} possible pad-mount transformer${detection.padMounts.length === 1 ? "" : "s"}`,
  ];
  observations.push(
    observe(origin(retrievedAt), ctx, {
      field: "detected_grid_equipment",
      kind: "reading",
      value: text(`Found in lidar: ${counts.join(", ")}`),
      attribute: "shape detection in the point cloud",
      method: "computed",
      sourceDate: config.sourceDate,
      grade: "reference",
      reason: "Found by shape in public lidar, which doesn't label poles or wires. Each is a detection to confirm in the field.",
    }),
  );

  if (detection.drop) {
    const { drop } = detection;
    const wallPoints = buildings.flatMap((polygon) => (polygon.type === "Polygon" ? polygon.coordinates[0]! : polygon.coordinates[0]![0]!)).map((point) => local(point as Point));
    const middle: Point = [wallPoints.reduce((sum, [x]) => sum + x, 0) / wallPoints.length, wallPoints.reduce((sum, [, y]) => sum + y, 0) / wallPoints.length];
    const side = sideOf(middle, drop.wall);
    const feet = Math.round(drop.lengthM * FEET);
    const why = `${drop.returns} returns about ${drop.heightM.toFixed(1)} m up run from a detected pole on ${drop.pole.road} to the building's ${side} side, covering ${Math.round(drop.coverage * 100)}% of ${feet} ft.`;
    features.push(
      {
        id: "lidar-service-drop",
        kind: "utility_line",
        field: "grid_service_path",
        geometry: { type: "LineString", coordinates: [lonLat(drop.from), lonLat(drop.wall)] },
        label: `(E) OVERHEAD SERVICE DROP, ${feet} FT`,
        attributes: { ...shared("service_drop", why), line_class: text("detected service drop"), distance_ft: { type: "quantity", value: feet, unit: "ft" } },
      },
      {
        id: "lidar-service-pole",
        kind: "existing_equipment",
        field: "grid_service_path",
        geometry: { type: "Point", coordinates: lonLat(drop.from) },
        label: "(E) SERVICE POLE",
        attributes: shared("service_tap", `${why} An overhead service is usually fed through a pole-mounted transformer on this pole.`),
      },
      {
        id: "lidar-service-entrance",
        kind: "existing_equipment",
        field: "grid_service_path",
        geometry: { type: "Point", coordinates: lonLat(drop.wall) },
        label: "(E) SERVICE ENTRANCE",
        attributes: shared("service_entrance", `${why} The main switchgear is usually just inside where the service enters.`),
      },
    );
    observations.push(
      observe(origin(retrievedAt), ctx, {
        field: "grid_service_path",
        kind: "reading",
        value: text(`Likely fed overhead from a pole on ${drop.pole.road}, by a service drop of about ${feet} ft to the building's ${side} side`),
        attribute: "service drop detected in lidar",
        method: "computed",
        sourceDate: config.sourceDate,
        grade: "reference",
        reason: `${why} Detected in public lidar, not field verified; the utility confirms the service.`,
      }),
    );
  }
  return { observations, features, run: run("done"), servicePathDetected: Boolean(detection.drop) };
}
