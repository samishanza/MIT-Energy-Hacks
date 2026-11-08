// The collection pipeline's steps, each with what it read, what it produced, and deterministic cross-checks of that
// output against the other steps. The review agent inspects every step through these, so its proposals rest on
// checks the code computes, not on the model's arithmetic.
import type { MapFeature, RecordVersion, Value } from "@eqore/contract";
import { feasibleBessZone } from "@eqore/electrical";

export type CheckResult = { check: string; result: "pass" | "fail" | "unknown"; detail: string };
export type StepReport = {
  step: StepId;
  label: string;
  sources: { id: string; status: string; reason?: string }[];
  values: { field: string; state: string; value: string }[];
  features: number;
  checks: CheckResult[];
};

export const STEPS = {
  site: { label: "Address, parcel, and building", sources: /parcel|roofprint|municipalit|imagery-2025$/, fields: ["site_location", "parcel_id", "property_line", "lot_size_acres", "building_outline", "building_area_sqft", "building_stories", "building_footprint_sqft", "use_description", "zoning_district"] },
  roads: { label: "Roads and frontage", sources: /road/, fields: ["road_name", "road_width_ft", "road_lanes", "road_side", "road_surface_type"] },
  grid: { label: "Utility, feeders, lines, and substations", sources: /national-grid|hifld/, fields: ["serving_utility", "utility_territories", "feeder", "distance_to_nearest_line_ft", "substations_nearby", "transmission_nearby"] },
  environment: { label: "Wetlands, flood, terrain, and land cover", sources: /wetland|flood|epqs|earth-engine|lidar-dem|fire-station/, fields: ["wetlands_nearby", "flood_zone", "site_slope_pct", "ground_elevation_ft", "land_cover", "fire_stations_nearby"] },
  paved: { label: "Paved parking and drives", sources: /land-cover-2016/, fields: ["paved_area_sqft"] },
  parking: { label: "Parking stall stripes", sources: /stalls/, fields: ["parking_stall_count"] },
  lidar: { label: "Lidar equipment detection", sources: /3dep-lidar/, fields: ["detected_grid_equipment"] },
  service: { label: "Service path and equipment locations", sources: /^$/, fields: ["grid_service_path", "switchboard_location", "meter_location", "utility_transformer_location", "service_voltage", "main_device_rating"] },
  battery_zone: { label: "Battery zone for the site plan", sources: /^$/, fields: ["candidate_areas"] },
} as const;
export type StepId = keyof typeof STEPS;
export const STEP_IDS = Object.keys(STEPS) as StepId[];

type Point = [number, number];
const SQFT_PER_SQM = 10.7639;
// A 9 by 18 ft stall, the smallest common size, so the stall count can't need more paving than this.
const STALL_SQFT = 162;

const text = (v: unknown) => (v && typeof v === "object" && "value" in v ? String((v as { value: unknown }).value) : v === undefined || v === null ? "" : String(v));
const valueOf = (record: RecordVersion, field: string): Value | undefined => record.values.find((v) => v.field === field);
const number = (record: RecordVersion, field: string): number | null => {
  const current = valueOf(record, field)?.current as { type?: string; value?: unknown } | undefined | null;
  return current && current.type === "quantity" && typeof current.value === "number" ? current.value : null;
};

function ringsOf(feature: MapFeature): Point[][] {
  const g = feature.geometry;
  if (g.type === "Polygon") return [(g.coordinates as Point[][])[0]!];
  if (g.type === "MultiPolygon") return (g.coordinates as Point[][][]).map((p) => p[0]!);
  return [];
}

// Metres east and north of the main building's centre.
function frame(record: RecordVersion) {
  const building = record.features.find((f) => f.kind === "building_outline");
  const ring = building ? ringsOf(building)[0] : undefined;
  const centre: Point = ring ? [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length] : ((record.site.location ?? [0, 0]) as Point);
  const perLon = 111320 * Math.cos((centre[1] * Math.PI) / 180);
  return (p: Point): Point => [(p[0] - centre[0]) * perLon, (p[1] - centre[1]) * 111320];
}

const areaSqm = (ring: Point[]) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function inside(p: Point, ring: Point[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const toRing = (p: Point, ring: Point[]) => Math.min(...ring.map((a, i) => {
  const b = ring[(i + 1) % ring.length]!, dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}));
const normalizeStreet = (s: string) => s.toUpperCase().replace(/\b(STREET|ST|ROAD|RD|AVENUE|AVE|DRIVE|DR|LANE|LN|BOULEVARD|BLVD|WAY|PLACE|PL|COURT|CT)\b\.?/g, "").replace(/[^A-Z0-9]/g, "");

const pass = (check: string, ok: boolean | null, detail: string): CheckResult => ({ check, result: ok === null ? "unknown" : ok ? "pass" : "fail", detail });

function checks(step: StepId, record: RecordVersion): CheckResult[] {
  const local = frame(record);
  const parcelRings = record.features.filter((f) => f.kind === "property_line").flatMap(ringsOf).map((r) => r.map(local));
  const buildingRings = record.features.filter((f) => f.kind === "building_outline").flatMap(ringsOf).map((r) => r.map(local));
  const equipment = (type: string) => record.features.filter((f) => f.geometry.type === "Point" && text(f.attributes?.equipment_type) === type);
  const at = (f: MapFeature) => local(f.geometry.coordinates as Point);
  const footprintSqft = buildingRings[0] ? areaSqm(buildingRings[0]) * SQFT_PER_SQM : null;
  const parcelSqft = parcelRings.length ? parcelRings.reduce((s, r) => s + areaSqm(r), 0) * SQFT_PER_SQM : null;
  switch (step) {
    case "site": {
      const lot = number(record, "lot_size_acres");
      const area = number(record, "building_area_sqft"), stories = number(record, "building_stories") ?? 1;
      const outside = buildingRings[0] && parcelRings.length ? buildingRings[0].filter((p) => !parcelRings.some((r) => inside(p, r) || toRing(p, r) < 1)).length : null;
      return [
        pass("building outline inside the parcel", outside === null ? null : outside === 0, outside === null ? "No parcel or building to compare." : `${outside} of ${buildingRings[0]!.length} building corners fall outside the parcel.`),
        pass("parcel area matches the assessor's lot size", lot === null || parcelSqft === null ? null : Math.abs(parcelSqft / 43560 - lot) / lot < 0.15, lot === null || parcelSqft === null ? "Lot size or parcel missing." : `Parcel polygon ${(parcelSqft / 43560).toFixed(2)} acres; assessor ${lot} acres.`),
        pass("roofprint matches the assessor's building area", area === null || footprintSqft === null ? null : footprintSqft * stories / area > 0.5 && footprintSqft * stories / area < 2, area === null || footprintSqft === null ? "Building area or outline missing." : `Roofprint ${Math.round(footprintSqft)} sq ft x ${stories} stories against ${area} sq ft on the assessor's card.`),
      ];
    }
    case "roads": {
      const street = record.site.address.split(",")[0]!.replace(/^\s*\d+[A-Z]?\s+/i, "");
      const fronting = record.features.filter((f) => f.kind === "road" && f.attributes?.fronting && (f.attributes.fronting as { value?: unknown }).value === true);
      return [
        pass("a fronting road was found", fronting.length > 0, `${fronting.length} fronting road features.`),
        pass("the fronting road is the address's street", fronting.length ? fronting.some((f) => normalizeStreet(f.label ?? "") === normalizeStreet(street)) : null, `Address street ${street}; fronting ${fronting.map((f) => f.label).join(", ") || "none"}.`),
      ];
    }
    case "grid": {
      const distance = number(record, "distance_to_nearest_line_ft");
      const utility = valueOf(record, "serving_utility");
      return [
        pass("a distribution line is within 300 ft", distance === null ? null : distance <= 300, distance === null ? "No line distance." : `Nearest mapped line ${distance} ft away.`),
        pass("one serving utility", utility ? utility.state !== "conflicting" && utility.state !== "missing" : null, `Serving utility is ${utility?.state ?? "absent"}: ${text(utility?.current)}.`),
      ];
    }
    case "environment": {
      const slope = number(record, "site_slope_pct");
      const flood = valueOf(record, "flood_zone");
      return [
        pass("slope is in a plausible range", slope === null ? null : slope >= 0 && slope <= 60, slope === null ? "No slope." : `Slope ${slope}%.`),
        pass("flood zone is known", flood ? flood.state === "verified" || flood.state === "inferred" : null, `Flood zone is ${flood?.state ?? "absent"}; FEMA's service can't be read automatically, so a person checks it.`),
      ];
    }
    case "paved": {
      const paved = number(record, "paved_area_sqft");
      return [
        pass("paved area fits on the parcel beside the building", paved === null || parcelSqft === null ? null : paved <= parcelSqft - (footprintSqft ?? 0) + 1, paved === null || parcelSqft === null ? "Paved area or parcel missing." : `Paved ${Math.round(paved)} sq ft; parcel ${Math.round(parcelSqft)} sq ft less the building ${Math.round(footprintSqft ?? 0)} sq ft.`),
      ];
    }
    case "parking": {
      const stalls = number(record, "parking_stall_count"), paved = number(record, "paved_area_sqft");
      const rows = record.features.filter((f) => f.field === "parking_stalls" && f.geometry.type === "Polygon");
      const pavedRings = record.features.filter((f) => f.field === "paved_area_sqft").flatMap(ringsOf).map((r) => r.map(local));
      const centroid = (f: MapFeature) => { const r = ringsOf(f)[0]!.map(local); return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length] as Point; };
      const offPaving = pavedRings.length ? rows.filter((f) => !pavedRings.some((r) => inside(centroid(f), r) || toRing(centroid(f), r) < 2)).length : null;
      return [
        pass("the stalls fit in the paved area", stalls === null || paved === null ? null : stalls * STALL_SQFT <= paved, stalls === null || paved === null ? "Stall count or paved area missing." : `${stalls} stalls need at least ${stalls * STALL_SQFT} sq ft; ${Math.round(paved)} sq ft is paved.`),
        pass("every stall row lies on paving", offPaving === null ? null : offPaving === 0, offPaving === null ? "No paved areas." : `${offPaving} of ${rows.length} stall rows are off the paving.`),
      ];
    }
    case "lidar": {
      const shift = record.features.find((f) => f.field === "detected_grid_equipment" && f.attributes?.registration_shift_m);
      const shiftText = text(shift?.attributes?.registration_shift_m);
      const shiftM = Number((shiftText.match(/([\d.]+)\s*m/) ?? [])[1] ?? 0);
      const box = equipment("pad_mount_transformer_candidate").find((f) => text(f.attributes?.candidate_rank) === "1");
      const boxWall = box && buildingRings[0] ? toRing(at(box), buildingRings[0]) : null;
      const lights = equipment("light_pole");
      const lightsOff = parcelRings.length ? lights.filter((f) => !parcelRings.some((r) => inside(at(f), r) || toRing(at(f), r) < 15)).length : null;
      const poles = equipment("utility_pole");
      return [
        pass("lidar registration shift is small", shift ? shiftM <= 3 : null, shift ? `Shift ${shiftText}.` : "No lidar detections carry a registration shift."),
        pass("the likeliest transformer box is near the building", boxWall === null ? null : boxWall <= 15, boxWall === null ? "No ranked box." : `Rank-1 box is ${boxWall.toFixed(1)} m from the building.`),
        pass("light poles are on or beside the parcel", lightsOff === null || lights.length === 0 ? null : lightsOff === 0, `${lights.length} light poles; ${lightsOff ?? "?"} more than 15 m off the parcel.`),
        pass("utility poles were found", poles.length > 0 ? true : null, `${poles.length} utility poles detected.`),
      ];
    }
    case "service": {
      const pin = (field: string) => record.features.some((f) => f.kind === "capture_pin" && f.field === field);
      const drop = record.features.some((f) => f.id === "lidar-service-drop");
      const pathValue = valueOf(record, "grid_service_path");
      return [
        pass("switchboard placed", pin("switchboard_location"), pin("switchboard_location") ? "A person placed the switchboard." : "No switchboard pin; the battery zone's anchor is assumed."),
        pass("transformer placed", pin("utility_transformer_location"), pin("utility_transformer_location") ? "A person placed the transformer." : "No transformer pin."),
        pass("service path agrees with the lidar", pathValue ? (drop ? /overhead/i.test(text(pathValue.current)) : true) : null, `Service path: ${text(pathValue?.current) || "none"}; lidar drop ${drop ? "found" : "not found"}.`),
      ];
    }
    case "battery_zone": {
      const zone = feasibleBessZone(record);
      return [
        pass("a feasible zone exists", Boolean(zone.zone), zone.reason ?? `Measured from the ${zone.target}.`),
        pass("the zone is anchored on a placed switchboard", zone.target === "main switchboard", `Measured from the ${zone.target}.`),
      ];
    }
  }
}

export function inspectStep(record: RecordVersion, step: StepId): StepReport {
  const spec = STEPS[step];
  return {
    step,
    label: spec.label,
    sources: record.sourceRuns.filter((run) => spec.sources.test(run.sourceId)).map((run) => ({ id: run.sourceId, status: run.status, ...(run.reason ? { reason: run.reason } : {}) })),
    values: (spec.fields as readonly string[]).flatMap((field) => { const v = valueOf(record, field); return v ? [{ field, state: v.state, value: text(v.current).slice(0, 200) }] : []; }),
    features: record.features.filter((f) => (spec.fields as readonly string[]).includes(f.field)).length,
    checks: checks(step, record),
  };
}

export const stepSummary = (record: RecordVersion) =>
  STEP_IDS.map((step) => { const report = inspectStep(record, step); return { step, label: report.label, failed: report.checks.filter((c) => c.result === "fail").map((c) => c.check), unknown: report.checks.filter((c) => c.result === "unknown").length, sourcesNotDone: report.sources.filter((s) => s.status !== "done").map((s) => s.id) }; });
