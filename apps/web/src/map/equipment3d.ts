import type { MapFeature } from "@eqore/contract";
import { drawnEquipment } from "@eqore/sheets";

// Simple solid models of the electrical equipment, at true size, for the 3D views.
// Each is a footprint polygon with a base and top height in meters, so MapLibre's
// fill-extrusion and Google's extruded 3D polygons can both draw it. Overhead wires are
// thin strips lifted to conductor height.

type LonLat = [number, number];

export interface Solid {
  id: string;
  featureId: string;
  field: string;
  /** Short drawing tag shown on the model, e.g. "T", "MDP". */
  tag: string;
  name: string;
  color: string;
  base: number;
  top: number;
  ring: LonLat[];
}

const M_PER_DEG = 111_320;
const FT = 0.3048;

function offset([lon, lat]: LonLat, eastM: number, northM: number): LonLat {
  return [lon + eastM / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)), lat + northM / M_PER_DEG];
}

function box(center: LonLat, widthM: number, depthM: number, rotationDeg = 0): LonLat[] {
  const r = (rotationDeg * Math.PI) / 180;
  const corners: [number, number][] = [
    [-widthM / 2, -depthM / 2],
    [widthM / 2, -depthM / 2],
    [widthM / 2, depthM / 2],
    [-widthM / 2, depthM / 2],
  ];
  const ring = corners.map(([x, y]) => offset(center, x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)));
  return [...ring, ring[0]!];
}

function octagon(center: LonLat, radiusM: number): LonLat[] {
  const ring = Array.from({ length: 8 }, (_, i) => offset(center, radiusM * Math.cos((i * Math.PI) / 4), radiusM * Math.sin((i * Math.PI) / 4)));
  return [...ring, ring[0]!];
}

function strip(line: LonLat[], halfWidthM: number): LonLat[][] {
  const out: LonLat[][] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const k = Math.cos((a[1] * Math.PI) / 180);
    const dx = (b[0] - a[0]) * M_PER_DEG * k;
    const dy = (b[1] - a[1]) * M_PER_DEG;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfWidthM;
    const ny = (dx / len) * halfWidthM;
    const ring = [offset(a, nx, ny), offset(b, nx, ny), offset(b, -nx, -ny), offset(a, -nx, -ny)];
    out.push([...ring, ring[0]!]);
  }
  return out;
}

const attr = (f: MapFeature, key: string) => (f.attributes?.[key] as { value?: unknown } | undefined)?.value;
const typeOf = (f: MapFeature) => String(attr(f, "equipment_type") ?? "");

/** The equipment's drawing tag and name, by what the record says it is. */
export function equipmentTag(f: MapFeature): { tag: string; name: string } | null {
  switch (typeOf(f)) {
    case "utility_pole":
      return { tag: "P", name: "Utility pole" };
    case "service_tap":
      return { tag: "T", name: "Pole-mounted transformer" };
    case "pad_mount_transformer_candidate":
      return { tag: "EQ", name: "Equipment box" };
    case "service_entrance":
      return { tag: "MDP", name: "Service entrance, main distribution panel" };
    case "bess_pad":
      return { tag: "ESS", name: "Battery energy storage system" };
    case "ac_disconnect":
      return { tag: "DS", name: "AC disconnect" };
    case "new_breaker":
      return { tag: "CB", name: "New breaker" };
    default:
      return f.kind === "substation" ? { tag: "SUB", name: "Substation" } : null;
  }
}

/** The equipment the site plan draws too, so the map and the sheet show the same items. */
export const drawableEquipment = drawnEquipment;

export function equipmentSolids(all: MapFeature[]): Solid[] {
  const features = drawableEquipment(all);
  const solids: Solid[] = [];
  const poles = features.filter((f) => typeOf(f) === "utility_pole" && f.geometry.type === "Point");
  const poleTop = (at: LonLat) => {
    const near = poles
      .map((p) => ({ p, d: Math.hypot(((p.geometry.coordinates as LonLat)[0] - at[0]) * 82_000, ((p.geometry.coordinates as LonLat)[1] - at[1]) * M_PER_DEG) }))
      .sort((a, b) => a.d - b.d)[0];
    const ft = Number(near ? attr(near.p, "height_ft") : NaN);
    return Number.isFinite(ft) ? ft * FT : 10.5;
  };
  const add = (f: MapFeature, suffix: string, s: Omit<Solid, "id" | "featureId" | "field" | "tag" | "name">) => {
    const t = equipmentTag(f);
    solids.push({ id: `${f.id}-${suffix}`, featureId: f.id, field: f.field, tag: t?.tag ?? "", name: t?.name ?? f.label ?? "", ...s });
  };

  for (const f of features) {
    if (f.geometry.type === "Point" && f.kind === "existing_equipment") {
      const at = f.geometry.coordinates as LonLat;
      switch (typeOf(f)) {
        case "utility_pole": {
          const top = Number(attr(f, "height_ft")) * FT || 10.5;
          add(f, "pole", { color: "#7a5a3a", base: 0, top, ring: octagon(at, 0.16) });
          add(f, "arm", { color: "#5d4630", base: top - 0.6, top: top - 0.45, ring: box(at, 2.4, 0.12) });
          break;
        }
        case "service_tap": {
          const top = poleTop(at);
          add(f, "pole", { color: "#7a5a3a", base: 0, top, ring: octagon(at, 0.16) });
          add(f, "can", { color: "#8f9aa3", base: top - 2.6, top: top - 1.5, ring: octagon(offset(at, 0.35, 0), 0.32) });
          break;
        }
        case "pad_mount_transformer_candidate": {
          // Sized from the lidar returns when the detector measured it.
          const w = Number(attr(f, "width_ft")) * FT || 1.8;
          const d = Number(attr(f, "depth_ft")) * FT || 1.7;
          const h = Number(attr(f, "height_ft")) * FT || 1.5;
          add(f, "box", { color: "#8f9aa3", base: 0, top: h, ring: box(at, w, d) });
          break;
        }
        case "service_entrance":
          add(f, "gear", { color: "#9aa3ab", base: 0, top: 2.3, ring: box(at, 2.4, 0.7) });
          break;
        case "bess_pad":
          add(f, "pad", { color: "#c8c4bb", base: 0, top: 0.15, ring: box(at, 14 * FT, 11.5 * FT) });
          add(f, "battery", { color: "#f4f4f2", base: 0.15, top: 0.15 + 8.2 * FT, ring: box(offset(at, -0.8, 0), 7.88 * FT, 4.59 * FT) });
          add(f, "xfmr", { color: "#2f6b45", base: 0.15, top: 1.8, ring: box(offset(at, 1.25, 0.3), 1.2, 1.1) });
          break;
        case "ac_disconnect":
          add(f, "disc", { color: "#9aa3ab", base: 0.6, top: 1.6, ring: box(offset(at, 1.9, -1.2), 0.5, 0.3) });
          break;
        case "new_breaker":
          add(f, "brk", { color: "#0b5cad", base: 0.9, top: 1.5, ring: box(offset(at, 0.6, 0), 0.4, 0.3) });
          break;
      }
    }
    if (f.kind === "utility_line" && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")) {
      const cls = String(attr(f, "line_class") ?? "");
      const lines = (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates) as LonLat[][];
      const lifted = cls === "detected overhead conductor" ? poleTop(lines[0]![0]!) - 0.5 : cls === "detected service drop" ? 6 : null;
      if (lifted === null) continue;
      lines.forEach((line, i) =>
        strip(line, 0.06).forEach((ring, j) =>
          solids.push({ id: `${f.id}-w${i}-${j}`, featureId: f.id, field: f.field, tag: "", name: cls === "detected service drop" ? "Overhead service drop" : "Overhead line", color: "#1c2326", base: lifted, top: lifted + 0.08, ring }),
        ),
      );
    }
  }
  return solids;
}

/** Pole positions, drawn as small round objects so they stay visible from straight above. */
export function polePoints(features: MapFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features
      .filter((f) => (typeOf(f) === "utility_pole" || typeOf(f) === "service_tap") && f.geometry.type === "Point")
      .map((f) => ({ type: "Feature" as const, properties: { featureId: f.id, field: f.field }, geometry: f.geometry })),
  };
}

export function solidsCollection(solids: Solid[]) {
  return {
    type: "FeatureCollection" as const,
    features: solids.map((s) => ({
      type: "Feature" as const,
      id: s.id,
      properties: { id: s.id, featureId: s.featureId, field: s.field, color: s.color, base: s.base, top: s.top },
      geometry: { type: "Polygon" as const, coordinates: [s.ring] },
    })),
  };
}

/** Overhead wires as 3D lines at conductor height, for views that draw lines in the air. */
export function overheadWires(features: MapFeature[]): { id: string; featureId: string; field: string; heightM: number; line: LonLat[] }[] {
  return features.flatMap((f) => {
    if (f.kind !== "utility_line" || (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString")) return [];
    const cls = String(attr(f, "line_class") ?? "");
    const heightM = cls === "detected overhead conductor" ? 9.5 : cls === "detected service drop" ? 6 : null;
    if (heightM === null) return [];
    const lines = (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates) as LonLat[][];
    return lines.map((line, i) => ({ id: `${f.id}-${i}`, featureId: f.id, field: f.field, heightM, line }));
  });
}
