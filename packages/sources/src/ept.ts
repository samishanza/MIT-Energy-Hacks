import { createLazPerf } from "laz-perf";
import type { FetchLike } from "./arcgis.ts";

// A lidar return in metres east and north of an origin, with its ASPRS class and how many returns its pulse had.
export type LidarPoint = { x: number; y: number; z: number; classification: number; returns?: number };

type Ept = { bounds: number[]; boundsConforming: number[]; srs: { horizontal?: string } };

const RADIUS = 6378137;
const mercator = (lon: number, lat: number): [number, number] => [(lon * Math.PI * RADIUS) / 180, RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

let lazPerf: ReturnType<typeof createLazPerf> | null = null;

// Decodes one LAZ file into points, reading the LAS header for scale and offset.
async function decode(bytes: Uint8Array): Promise<LidarPoint[]> {
  lazPerf ??= createLazPerf();
  const lp = await lazPerf;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint8(104) & 0x3f;
  const scale = [view.getFloat64(131, true), view.getFloat64(139, true), view.getFloat64(147, true)];
  const offset = [view.getFloat64(155, true), view.getFloat64(163, true), view.getFloat64(171, true)];
  // Formats 6 and up keep the class in a full byte at 16; older ones in the low five bits of byte 15.
  const classAt = format >= 6 ? 16 : 15;
  const filePointer = lp._malloc(bytes.byteLength);
  lp.HEAPU8.set(bytes, filePointer);
  const laszip = new lp.LASZip();
  const points: LidarPoint[] = [];
  try {
    laszip.open(filePointer, bytes.byteLength);
    const length = laszip.getPointLength();
    const pointPointer = lp._malloc(length);
    try {
      for (let index = 0, count = laszip.getCount(); index < count; index++) {
        laszip.getPoint(pointPointer);
        const record = new DataView(lp.HEAPU8.buffer, pointPointer, length);
        points.push({
          x: record.getInt32(0, true) * scale[0]! + offset[0]!,
          y: record.getInt32(4, true) * scale[1]! + offset[1]!,
          z: record.getInt32(8, true) * scale[2]! + offset[2]!,
          classification: format >= 6 ? record.getUint8(classAt) : record.getUint8(classAt) & 0x1f,
          // Formats 6 and up keep the number of returns in the high four bits of byte 14; older ones in bits 3 to 5.
          returns: format >= 6 ? record.getUint8(14) >> 4 : (record.getUint8(14) >> 3) & 0x07,
        });
      }
    } finally {
      lp._free(pointPointer);
    }
  } finally {
    laszip.delete();
    lp._free(filePointer);
  }
  return points;
}

// Reads every point inside a square around a site from an Entwine Point Tiles resource in Web Mercator,
// as USGS publishes 3DEP. Only the octree nodes that touch the square are fetched.
export async function readEptPoints(base: string, [lon, lat]: [number, number], halfMeters: number, fetchImpl: FetchLike): Promise<LidarPoint[]> {
  const json = async <T>(url: string) => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as T;
  };
  const ept = await json<Ept>(`${base}/ept.json`);
  if (ept.srs.horizontal !== "3857") throw new Error(`Unsupported lidar coordinate system: ${ept.srs.horizontal ?? "unknown"}`);
  const [cx, cy] = mercator(lon, lat);
  // Web Mercator stretches distance by 1/cos(latitude).
  const stretch = 1 / Math.cos((lat * Math.PI) / 180);
  const box = [cx - halfMeters * stretch, cy - halfMeters * stretch, cx + halfMeters * stretch, cy + halfMeters * stretch];
  const [b0, b1, , b3] = ept.bounds;
  const hierarchy: Record<string, number> = {};
  const loadHierarchy = async (key: string) => Object.assign(hierarchy, await json<Record<string, number>>(`${base}/ept-hierarchy/${key}.json`));
  await loadHierarchy("0-0-0-0");

  const keys: string[] = [];
  const stack = ["0-0-0-0"];
  while (stack.length) {
    const key = stack.pop()!;
    const [d, xi, yi, zi] = key.split("-").map(Number) as [number, number, number, number];
    const size = (b3! - b0!) / 2 ** d;
    const x0 = b0! + xi * size;
    const y0 = b1! + yi * size;
    if (x0 > box[2]! || x0 + size < box[0]! || y0 > box[3]! || y0 + size < box[1]!) continue;
    let count = hierarchy[key];
    if (count === undefined) continue;
    if (count === -1) {
      await loadHierarchy(key);
      count = hierarchy[key]!;
    }
    if (count > 0) keys.push(key);
    for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) stack.push(`${d + 1}-${2 * xi + dx}-${2 * yi + dy}-${2 * zi + dz}`);
  }

  const points: LidarPoint[] = [];
  for (const key of keys) {
    const response = await fetchImpl(`${base}/ept-data/${key}.laz`);
    if (!response.ok) throw new Error(`HTTP ${response.status} for lidar node ${key}`);
    for (const point of await decode(new Uint8Array(await response.arrayBuffer()))) {
      if (point.x < box[0]! || point.x > box[2]! || point.y < box[1]! || point.y > box[3]!) continue;
      points.push({ x: (point.x - cx) / stretch, y: (point.y - cy) / stretch, z: point.z, classification: point.classification, returns: point.returns });
    }
  }
  return points;
}

// The first configured collection that covers the point, and its points around it.
export async function readLidarAround(bases: string[], center: [number, number], halfMeters: number, fetchImpl: FetchLike) {
  const base = await eptCovering(bases, center, fetchImpl);
  return base ? { base, points: await readEptPoints(base, center, halfMeters, fetchImpl) } : null;
}

// The resource whose collection footprint holds the point, from a list a region configures.
export async function eptCovering(bases: string[], [lon, lat]: [number, number], fetchImpl: FetchLike): Promise<string | null> {
  const [x, y] = mercator(lon, lat);
  for (const base of bases) {
    const response = await fetchImpl(`${base}/ept.json`);
    if (!response.ok) continue;
    const bounds = ((await response.json()) as Ept).boundsConforming;
    if (x >= bounds[0]! && x <= bounds[3]! && y >= bounds[1]! && y <= bounds[4]!) return base;
  }
  return null;
}
