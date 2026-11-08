// One street-level photo facing where the building most likely connects to the grid, with
// our inferred and detected equipment projected onto it.
//
// Google's Street View Static API supplies the photo. Its terms allow drawing over the image
// but not deriving data from it, so nothing here reads the pixels: the markers come from the
// record, and the image passes through this server only so the key stays off the browser.

import { readFileSync } from "node:fs";
import type { MapFeature, RecordVersion } from "@eqore/contract";
import { conceptSiteLayout } from "@eqore/electrical";
import type { FetchLike } from "@eqore/sources";

export const VIEW = { width: 640, height: 400, fov: 90 };
const CAMERA_HEIGHT_M = 2.5;
const M_PER_DEG_LAT = 111_320;

type LonLat = [number, number];

export interface StreetViewMarker {
  id: string;
  label: string;
  note: string;
  x: number;
  y: number;
  /** False when it falls outside this photo's frame. */
  inFrame: boolean;
  /** Equipment that is inside the building or otherwise not visible from the street. */
  hidden: boolean;
  distanceFt: number;
  basis: "detected" | "inferred" | "concept";
}

export type StreetViewResult =
  | { status: "unavailable"; reason: string; markers: StreetViewMarker[] }
  | {
      status: "ok";
      pano: { lat: number; lng: number; date: string | null };
      camera: { heading: number; pitch: number; fov: number; width: number; height: number };
      imagePath: string;
      target: string;
      markers: StreetViewMarker[];
    };

/** The key, from GOOGLE_MAPS_API_KEY or the file GOOGLE_MAPS_API_KEY_FILE names. Never logged. */
export function mapsKey(): string | null {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY.trim();
  const file = process.env.GOOGLE_MAPS_API_KEY_FILE;
  if (!file) return null;
  try {
    return readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

const attr = (f: MapFeature, key: string) => {
  const a = f.attributes?.[key] as { value?: unknown } | undefined;
  return a?.value;
};
const typeOf = (f: MapFeature) => String(attr(f, "equipment_type") ?? "");
const basisOf = (f: MapFeature): StreetViewMarker["basis"] => {
  const b = String(attr(f, "basis") ?? "");
  return /lidar|detected/i.test(b) ? "detected" : b === "concept" ? "concept" : "inferred";
};

function pointOf(f: MapFeature): LonLat | null {
  return f.geometry.type === "Point" ? (f.geometry.coordinates as LonLat) : null;
}

export function bearingDeg([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

export function distanceM([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dx = (lon2 - lon1) * M_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Where a point at a given height above the ground lands in the photo, from a pinhole camera. */
export function project(camera: { at: LonLat; heading: number; pitch: number; fov: number; width: number; height: number }, point: LonLat, heightM: number) {
  const d = Math.max(distanceM(camera.at, point), 1);
  let yaw = bearingDeg(camera.at, point) - camera.heading;
  yaw = ((yaw + 540) % 360) - 180;
  const half = (camera.fov / 2) * (Math.PI / 180);
  const vHalf = Math.atan(Math.tan(half) * (camera.height / camera.width));
  const elevation = Math.atan((heightM - CAMERA_HEIGHT_M) / d) - camera.pitch * (Math.PI / 180);
  const x = camera.width / 2 + (camera.width / 2) * (Math.tan(yaw * (Math.PI / 180)) / Math.tan(half));
  const raw = camera.height / 2 - (camera.height / 2) * (Math.tan(elevation) / Math.tan(vHalf));
  // Something tall and close, like a pole beside the camera, runs off the top: pin its marker to the visible edge.
  const y = Math.max(14, Math.min(camera.height - 14, raw));
  const inFrame = Math.abs(yaw) < camera.fov / 2;
  return { x, y, inFrame, distanceFt: d * 3.28084 };
}

interface Subject {
  id: string;
  at: LonLat;
  heightM: number;
  label: string;
  note: string;
  hidden: boolean;
  basis: StreetViewMarker["basis"];
}

/** What to mark, and the one thing to face: the likely connection point. */
export function subjects(record: RecordVersion): { subjects: Subject[]; target: Subject | null } {
  const features = [...record.features, ...conceptSiteLayout(record)];
  const out: Subject[] = [];
  for (const f of features) {
    const at = pointOf(f);
    if (!at || f.kind !== "existing_equipment") continue;
    const type = typeOf(f);
    const label = (f.label ?? type).replace(/, (INFERRED|DETECTED IN LIDAR|CONCEPT LOCATION), NOT (FIELD VERIFIED|A DESIGN)$/i, "");
    const basis = basisOf(f);
    const note = basis === "detected" ? "Detected in public lidar, not field verified" : basis === "concept" ? "Concept location, not a design" : "Inferred from public data, not field verified";
    const height =
      type === "utility_pole" ? Number(attr(f, "height_ft") ?? 30) / 3.28084 : type === "service_tap" ? 7.5 : type === "service_entrance" ? 2.4 : 0.8;
    out.push({ id: f.id, at, heightM: height, label, note, hidden: false, basis });
    if (type === "service_entrance") {
      out.push({
        id: `${f.id}-panel`,
        at,
        heightM: 1.5,
        label: "(E) MAIN DISTRIBUTION PANEL AND METER, LIKELY JUST INSIDE",
        note: "Inside the building, not visible from the street. Inferred from the service side",
        hidden: true,
        basis: "inferred",
      });
    }
  }
  const pick = (...types: string[]) => types.map((t) => out.find((s) => features.find((f) => f.id === s.id && typeOf(f) === t))).find(Boolean) ?? null;
  // Face the service connection; without one, the utility pole nearest the building, which
  // is where an overhead service usually comes from; the concept pad only as a last resort.
  const building = record.features
    .filter((f) => f.kind === "building_outline" && f.geometry.type === "Polygon")
    .map((f) => (f.geometry.coordinates as LonLat[][])[0]!)
    .sort((a, b) => b.length - a.length)[0];
  const centre: LonLat | null = building ? [building.reduce((s, p) => s + p[0], 0) / building.length, building.reduce((s, p) => s + p[1], 0) / building.length] : null;
  const poles = out.filter((s) => features.find((f) => f.id === s.id && typeOf(f) === "utility_pole"));
  const nearestPole = centre && poles.length ? [...poles].sort((a, b) => distanceM(a.at, centre) - distanceM(b.at, centre))[0]! : null;
  const target = pick("service_tap", "service_entrance") ?? nearestPole ?? pick("bess_pad");
  return { subjects: out, target };
}

function roadLines(record: RecordVersion): LonLat[][] {
  return record.features
    .filter((f) => f.kind === "road")
    .flatMap((f) => (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [])) as LonLat[][];
}

/** The closest point along any mapped road, not just its vertices, so the camera stands beside the target. */
export function nearestOnRoads(target: LonLat, lines: LonLat[][], alongM = 0): LonLat | null {
  const k = Math.cos(target[1] * (Math.PI / 180));
  let best: LonLat | null = null;
  let bestD = Infinity;
  let bestDir: [number, number] = [0, 0];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const ax = (a[0] - target[0]) * k, ay = a[1] - target[1];
      const bx = (b[0] - target[0]) * k, by = b[1] - target[1];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const px = ax + t * dx, py = ay + t * dy;
      const d = px * px + py * py;
      if (d < bestD) {
        bestD = d;
        best = [target[0] + px / k, target[1] + py];
        const len = Math.hypot(dx, dy) || 1;
        bestDir = [dx / len, dy / len];
      }
    }
  }
  if (!best || !alongM) return best;
  // Step along the road, so the camera sees the target from the side rather than standing on it.
  const step = alongM / M_PER_DEG_LAT;
  return [best[0] + (bestDir[0] * step) / k, best[1] + bestDir[1] * step];
}

export async function streetView(record: RecordVersion, fetchImpl: FetchLike, key: string | null): Promise<StreetViewResult> {
  const { subjects: marks, target } = subjects(record);
  if (!target) return { status: "unavailable", reason: "Nothing on this site is located well enough to face: no detected or inferred service, and no open ground for a concept pad.", markers: [] };
  if (!key) return { status: "unavailable", reason: "No Google Maps key is configured. Set GOOGLE_MAPS_API_KEY_FILE in .env.", markers: [] };

  const from = nearestOnRoads(target.at, roadLines(record), 25) ?? target.at;
  const meta = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  meta.searchParams.set("location", `${from[1]},${from[0]}`);
  meta.searchParams.set("radius", "20");
  meta.searchParams.set("source", "outdoor");
  meta.searchParams.set("key", key);
  let body: { status?: string; date?: string; location?: { lat: number; lng: number }; error_message?: string };
  try {
    body = (await (await fetchImpl(meta.toString())).json()) as typeof body;
  } catch (error) {
    return { status: "unavailable", reason: `Street View couldn't be reached: ${(error as Error).message}`, markers: [] };
  }
  if (body.status !== "OK" || !body.location) {
    const why =
      body.status === "REQUEST_DENIED"
        ? `Google refused the key: ${body.error_message ?? "request denied"}`
        : body.status === "ZERO_RESULTS"
          ? "Google has no Street View photo within 60 m of the nearest mapped road."
          : `Street View answered ${body.status ?? "nothing"}.`;
    return { status: "unavailable", reason: why, markers: [] };
  }

  const at: LonLat = [body.location.lng, body.location.lat];
  const heading = Math.round(bearingDeg(at, target.at));
  const camera = { at, heading, pitch: 5, ...VIEW };
  const markers = marks.map((s) => {
    const p = project(camera, s.at, s.heightM);
    return { id: s.id, label: s.label, note: s.note, x: Math.round(p.x), y: Math.round(p.y), inFrame: p.inFrame, hidden: s.hidden, distanceFt: Math.round(p.distanceFt), basis: s.basis };
  });
  const imagePath = `/api/sites/${record.site.id}/versions/${record.version}/street-view.jpg?lat=${at[1]}&lng=${at[0]}&heading=${heading}&pitch=5`;
  return {
    status: "ok",
    pano: { lat: at[1], lng: at[0], date: body.date ?? null },
    camera: { heading, pitch: 5, fov: VIEW.fov, width: VIEW.width, height: VIEW.height },
    imagePath,
    target: target.label,
    markers,
  };
}

/**
 * Where Google's nearest outdoor panorama to a point stands, and when it was taken, so the browser
 * can pick the panorama that sees a piece of equipment best. Only its position and date, never pixels.
 */
export async function streetViewMetadata(fetchImpl: FetchLike, key: string, lat: number, lng: number): Promise<{ status: string; lat?: number; lng?: number; date?: string | null }> {
  const meta = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  meta.searchParams.set("location", `${lat},${lng}`);
  meta.searchParams.set("radius", "50");
  meta.searchParams.set("source", "outdoor");
  meta.searchParams.set("key", key);
  const body = (await (await fetchImpl(meta.toString())).json()) as { status?: string; date?: string; location?: { lat: number; lng: number } };
  return body.status === "OK" && body.location ? { status: "OK", lat: body.location.lat, lng: body.location.lng, date: body.date ?? null } : { status: body.status ?? "UNKNOWN" };
}

/** The photo itself, passed through so the key stays on the server. Not stored. */
export async function streetViewImage(fetchImpl: FetchLike, key: string, q: { lat: string; lng: string; heading: string; pitch: string; fov?: string }): Promise<Response> {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", `${VIEW.width}x${VIEW.height}`);
  url.searchParams.set("location", `${Number(q.lat)},${Number(q.lng)}`);
  url.searchParams.set("heading", String(Number(q.heading)));
  url.searchParams.set("pitch", String(Number(q.pitch)));
  // A narrower field of view zooms in on distant equipment; Google allows 10 to 120 degrees.
  url.searchParams.set("fov", String(q.fov ? Math.max(20, Math.min(120, Number(q.fov))) : VIEW.fov));
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", key);
  const upstream = await fetchImpl(url.toString());
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "image/jpeg", "cache-control": "no-store" } });
}
