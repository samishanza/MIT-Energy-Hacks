import type { MapFeature } from "@eqore/contract";

// Features traced from a site's engineered plan set (scripts and output kept out of git, since plan sets
// carry customer details). Where a site has one, it's the better source: what the engineer drew replaces
// what public data and lidar inferred, and each feature says which sheet it came from.

type LonLat = [number, number];
type PlanFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: { type: string; label?: string; sheet?: string; source?: string; method?: string; mark?: string; diameter_in?: number };
};
export type PlanFeatureCollection = { type: "FeatureCollection"; features: PlanFeature[] };

const text = (value: string) => ({ type: "text" as const, value });

const POINT_TYPES: Record<string, { equipment: string; label: string }> = {
  utility_pole: { equipment: "utility_pole", label: "(E) UTILITY POLE" },
  light_pole: { equipment: "light_pole", label: "(E) LIGHT POLE" },
  hydrant: { equipment: "hydrant", label: "(E) FIRE HYDRANT" },
  catch_basin: { equipment: "catch_basin", label: "(E) CATCH BASIN" },
  manhole: { equipment: "manhole", label: "(E) MANHOLE" },
  transformer: { equipment: "pad_mount_transformer", label: "(E) PAD-MOUNT TRANSFORMER" },
  meter: { equipment: "meter", label: "(E) UTILITY METER" },
  main_switchboard: { equipment: "service_entrance", label: "(E) MAIN DISTRIBUTION PANEL" },
  generator: { equipment: "generator", label: "(E) GENERATOR" },
  panel: { equipment: "panel", label: "(E) PANEL" },
  transfer_switch: { equipment: "transfer_switch", label: "(E) TRANSFER SWITCH" },
  disconnect: { equipment: "disconnect", label: "(E) DISCONNECT" },
  annunciator: { equipment: "annunciator", label: "(E) ANNUNCIATOR PANEL" },
  sign: { equipment: "sign", label: "(E) SIGN" },
};

export async function loadPlanFeatures(siteId: string): Promise<PlanFeatureCollection | null> {
  try {
    const response = await fetch(`/private/plan-features/${siteId}.geojson`);
    if (!response.ok || !/json|geo/.test(response.headers.get("content-type") ?? "")) return null;
    const data = (await response.json()) as PlanFeatureCollection;
    return Array.isArray(data?.features) && data.features.length ? data : null;
  } catch {
    return null;
  }
}

function centroid(ring: LonLat[]): LonLat {
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

/** The pad's long side as an angle counterclockwise from east, as the 3D models take it. */
function padTurn(ring: LonLat[]): number {
  const k = Math.cos((ring[0]![1] * Math.PI) / 180);
  const side = (a: LonLat, b: LonLat) => [(b[0] - a[0]) * k, b[1] - a[1]] as const;
  const [s1, s2] = [side(ring[0]!, ring[1]!), side(ring[1]!, ring[2]!)];
  const long = Math.hypot(...s1) >= Math.hypot(...s2) ? s1 : s2;
  return (Math.atan2(long[1], long[0]) * 180) / Math.PI;
}

/**
 * The drawing's own wording, shortened for a callout: "(N) 60 kW diesel generator, 60 kW/75 kVA, ..." becomes
 * "(N) 60 KW DIESEL GENERATOR". The full note stays on the feature for its details.
 */
export function shortLabel(label: string | undefined, fallback: string): string {
  if (!label) return fallback;
  const status = /^\((E|N|R)\)/i.exec(label)?.[0]?.toUpperCase() ?? /^\([EN]\)/.exec(fallback)?.[0] ?? "(E)";
  const body = label.replace(/^\([A-Z]\)\s*/i, "").split(/[,;(]/)[0]!.trim();
  return `${status} ${body}`.toUpperCase().slice(0, 48);
}

/** A polygon's centre and its sides in feet, for a solid model sized to the drawing. */
function sizeOf(ring: LonLat[]): { at: LonLat; widthFt: number; depthFt: number; turn: number } {
  const k = Math.cos((ring[0]![1] * Math.PI) / 180);
  const ft = (a: LonLat, b: LonLat) => (Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111_320) / 0.3048;
  return { at: centroid(ring), widthFt: ft(ring[0]!, ring[1]!), depthFt: ft(ring[1]!, ring[2]!), turn: padTurn(ring) };
}

export function planMapFeatures(collection: PlanFeatureCollection): MapFeature[] {
  const out: MapFeature[] = [];
  const evidence = (p: PlanFeature["properties"]) => ({
    basis: text("plan set"),
    confidence_reason: text(`From the ${p.source ?? "engineered plan set"}, sheet ${p.sheet ?? "ESS-1.0"}${p.method ? `; ${p.method}` : ""}.`),
  });
  const stripes: LonLat[][] = [];
  const curbs: LonLat[][] = [];
  let n = 0;
  for (const f of collection.features) {
    const p = f.properties ?? { type: "" };
    const id = `plan-${p.type}-${++n}`;
    // A transformer the drawing says is on a pole is a pole-top can, not a pad-mount on the ground.
    const point = p.type === "transformer" && /pole/i.test(p.label ?? "") ? { equipment: "service_tap", label: "(E) POLE-MOUNTED TRANSFORMER" } : POINT_TYPES[p.type];
    if (point && f.geometry.type === "Point") {
      out.push({
        id,
        kind: "existing_equipment",
        field: "detected_grid_equipment",
        geometry: { type: "Point", coordinates: f.geometry.coordinates as LonLat },
        label: shortLabel(p.label, point.label),
        attributes: { equipment_type: text(point.equipment), ...evidence(p), ...(p.label ? { drawing_note: text(p.label) } : {}), ...(p.mark ? { plan_mark: text(p.mark) } : {}) },
      });
      continue;
    }
    switch (p.type) {
      case "parking_stripe":
        if (f.geometry.type === "LineString") stripes.push(f.geometry.coordinates as LonLat[]);
        if (f.geometry.type === "MultiLineString") stripes.push(...(f.geometry.coordinates as LonLat[][]));
        break;
      case "curb":
        if (f.geometry.type === "LineString") curbs.push(f.geometry.coordinates as LonLat[]);
        if (f.geometry.type === "MultiLineString") curbs.push(...(f.geometry.coordinates as LonLat[][]));
        break;
      case "concrete_pad":
        if (f.geometry.type === "Polygon") {
          const s = sizeOf((f.geometry.coordinates as LonLat[][])[0]!);
          out.push({
            id,
            kind: "existing_equipment",
            field: "detected_grid_equipment",
            geometry: { type: "Point", coordinates: s.at },
            label: shortLabel(p.label, "(E) CONCRETE PAD"),
            attributes: {
              equipment_type: text("concrete_pad"),
              width_ft: { type: "quantity", value: Math.round(s.widthFt), unit: "ft" },
              depth_ft: { type: "quantity", value: Math.round(s.depthFt), unit: "ft" },
              rotation_deg: { type: "quantity", value: s.turn, unit: "deg" },
              ...(p.label ? { drawing_note: text(p.label) } : {}),
              ...evidence(p),
            },
          });
        }
        break;
      case "pavement":
        if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
          out.push({ id, kind: "constraint", field: "paved_area_sqft", geometry: f.geometry as MapFeature["geometry"], label: "(E) PAVED PARKING AND DRIVES", attributes: { surface_kind: text("paved_parking_and_drives"), ...evidence(p) } });
        break;
      case "bess_pad":
        if (f.geometry.type === "Polygon") {
          const ring = (f.geometry.coordinates as LonLat[][])[0]!;
          out.push({
            id,
            kind: "existing_equipment",
            field: "candidate_areas",
            geometry: { type: "Point", coordinates: centroid(ring) },
            label: "(N) BESS PAD",
            attributes: { equipment_type: text("bess_pad"), rotation_deg: { type: "quantity", value: padTurn(ring), unit: "deg" }, width_ft: { type: "quantity", value: 11.5, unit: "ft" }, depth_ft: { type: "quantity", value: 14, unit: "ft" }, ...evidence(p) },
          });
        }
        break;
      case "conduit":
        if (f.geometry.type === "LineString")
          out.push({
            id,
            kind: "utility_line",
            field: "candidate_areas",
            geometry: { type: "LineString", coordinates: f.geometry.coordinates as LonLat[] },
            label: shortLabel(p.label, "(N) CONDUIT"),
            attributes: { line_class: text(/^\(E\)/i.test(p.label ?? "") ? "existing conduit" : "proposed trench route"), ...(p.label ? { drawing_note: text(p.label) } : {}), ...evidence(p) },
          });
        break;
    }
  }
  if (stripes.length)
    out.push({ id: "plan-parking-stripes", kind: "constraint", field: "parking_stalls", geometry: { type: "MultiLineString", coordinates: stripes }, label: "(E) PARKING STALLS", attributes: { basis: text("plan set"), confidence_reason: text("Stall lines traced from the engineered plan set, sheet ESS-1.0.") } });
  if (curbs.length)
    out.push({ id: "plan-curbs", kind: "constraint", field: "paved_curbs", geometry: { type: "MultiLineString", coordinates: curbs }, label: "(E) CURB", attributes: { basis: text("plan set"), confidence_reason: text("Curb and pavement edges traced from the engineered plan set, sheet ESS-1.0.") } });
  return out;
}

/**
 * The record's features with the plan set laid over them. What the plan draws replaces the public or
 * lidar version of the same thing: poles and equipment, paving and stalls, the switchboard, and the
 * concept pad and trench (the battery zone stays, as the analysis behind the choice).
 */
export function withPlanSet(features: MapFeature[], plan: MapFeature[]): MapFeature[] {
  if (!plan.length) return features;
  const type = (f: MapFeature) => String((f.attributes?.["equipment_type"] as { value?: unknown } | undefined)?.value ?? "");
  const planHas = (t: string) => plan.some((f) => type(f) === t);
  const replaced = (f: MapFeature) => {
    if (f.kind === "existing_equipment" && f.attributes?.["basis"] && type(f) !== "" && type(f) !== "bess_pad" && type(f) !== "ac_disconnect" && type(f) !== "new_breaker") return true;
    if (f.kind === "existing_equipment" && type(f) === "service_entrance" && planHas("service_entrance")) return true;
    if ((f.field === "paved_area_sqft" || f.field === "parking_stalls") && f.kind === "constraint" && plan.some((p) => p.field === f.field)) return true;
    // The concept pad, disconnect and trench give way to the engineer's; the new breaker in the panel stays.
    if (f.id.startsWith("concept-") && f.kind !== "candidate_area" && type(f) !== "new_breaker" && planHas("bess_pad")) return true;
    return false;
  };
  return [...features.filter((f) => !replaced(f)), ...plan];
}
