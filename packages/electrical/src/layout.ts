import type { MapFeature, RecordVersion } from "@eqore/contract";

type Point = [number, number];
type Segment = [Point, Point];

const FEET_PER_DEGREE = (6371008.8 * Math.PI * 3.280839895) / 180;

function ringsOf(feature: MapFeature): Point[][] {
  const { geometry } = feature;
  switch (geometry.type) {
    case "Point":
      return [[geometry.coordinates as Point]];
    case "LineString":
      return [geometry.coordinates as Point[]];
    case "MultiLineString":
      return geometry.coordinates as Point[][];
    case "Polygon":
      return geometry.coordinates as Point[][];
    case "MultiPolygon":
      return (geometry.coordinates as Point[][][]).flat();
  }
}

function frame(origin: Point) {
  const perLon = FEET_PER_DEGREE * Math.cos((origin[1] * Math.PI) / 180);
  return {
    toFeet: ([lon, lat]: Point): Point => [(lon - origin[0]) * perLon, (lat - origin[1]) * FEET_PER_DEGREE],
    toLonLat: ([x, y]: Point): Point => [origin[0] + x / perLon, origin[1] + y / FEET_PER_DEGREE],
  };
}

function segmentsOf(features: MapFeature[], toFeet: (point: Point) => Point): Segment[] {
  return features.flatMap((feature) =>
    ringsOf(feature).flatMap((ring) => {
      const points = ring.map(toFeet);
      return points.length === 1 ? [[points[0]!, points[0]!] as Segment] : points.slice(1).map((point, index): Segment => [points[index]!, point]);
    }),
  );
}

function closestOn([a, b]: Segment, p: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return [a[0] + t * dx, a[1] + t * dy];
}

// For segments that don't cross, the closest approach is at an endpoint of one of them.
function closest(first: Segment[], second: Segment[]): { from: Point; to: Point; feet: number } | null {
  let best: { from: Point; to: Point; feet: number } | null = null;
  const consider = (from: Point, to: Point) => {
    const feet = Math.hypot(from[0] - to[0], from[1] - to[1]);
    if (!best || feet < best.feet) best = { from, to, feet };
  };
  for (const segment of first) for (const point of segment) for (const other of second) consider(point, closestOn(other, point));
  for (const segment of second) for (const point of segment) for (const other of first) consider(closestOn(other, point), point);
  return best;
}

const isEntrance = (feature: MapFeature) => feature.attributes?.equipment_type?.type === "text" && feature.attributes.equipment_type.value === "service_entrance";

export type ShortestRun = { from: Point; to: Point; feet: number; target: "inferred service entrance" | "nearest building wall" };

// The shortest plausible run: from the nearest point of open ground to where the service likely enters, in a straight line.
export function shortestRun(record: RecordVersion): ShortestRun | null {
  const open = record.features.filter((feature) => feature.kind === "candidate_area");
  const entrance = record.features.find(isEntrance);
  const buildings = record.features.filter((feature) => feature.kind === "building_outline");
  const targets = entrance ? [entrance] : buildings;
  if (open.length === 0 || targets.length === 0) return null;
  const origin = (record.site.location ?? ringsOf(open[0]!)[0]![0]!) as Point;
  const { toFeet, toLonLat } = frame(origin);
  const gap = closest(segmentsOf(open, toFeet), segmentsOf(targets, toFeet));
  if (!gap) return null;
  return { from: toLonLat(gap.from), to: toLonLat(gap.to), feet: Math.round(gap.feet), target: entrance ? "inferred service entrance" : "nearest building wall" };
}

const text = (value: string) => ({ type: "text" as const, value });
const CONCEPT = "CONCEPT LOCATION, NOT A DESIGN";

// Where the new equipment could go and how it could connect, for the site plan to draw. These are concept
// locations from public geometry: the engineer sets the real pad, clearances, and route.
export function conceptSiteLayout(record: RecordVersion, breakerLabel = "NEW BREAKER IN THE MAIN DISTRIBUTION PANEL"): MapFeature[] {
  const run = shortestRun(record);
  if (!run) return [];
  const shared = (equipment: string, reason: string) => ({ equipment_type: text(equipment), basis: text("concept"), confidence_reason: text(reason) });
  const where = run.target === "inferred service entrance" ? "the inferred service entrance" : "the nearest building wall, since no service entrance was inferred";
  return [
    {
      id: "concept-bess-pad",
      kind: "existing_equipment",
      field: "pad_zone_x_ft",
      geometry: { type: "Point", coordinates: run.from },
      label: `(N) BESS PAD, ${CONCEPT}`,
      attributes: shared("bess_pad", `The point of open ground nearest ${where}. Clearances, setbacks, and the real pad location are the engineer's.`),
    },
    {
      id: "concept-ac-disconnect",
      kind: "existing_equipment",
      field: "electrical_poi",
      geometry: { type: "Point", coordinates: run.from },
      label: `(N) AC DISCONNECT AT THE PAD, ${CONCEPT}`,
      attributes: shared("ac_disconnect", "The disconnect stands at the pad, as in the source plan set."),
    },
    {
      id: "concept-trench-route",
      kind: "utility_line",
      field: "electrical_poi",
      geometry: { type: "LineString", coordinates: [run.from, run.to] },
      label: `(N) PROPOSED TRENCH ROUTE, ±${run.feet} FT, ${CONCEPT}`,
      attributes: { ...shared("trench_route", `The shortest plausible run, straight line, from the open ground to ${where}. The real route is longer.`), line_class: text("proposed trench route, concept"), distance_ft: { type: "quantity", value: run.feet, unit: "ft" } },
    },
    {
      id: "concept-new-breaker",
      kind: "existing_equipment",
      field: "electrical_poi",
      geometry: { type: "Point", coordinates: run.to },
      label: `(N) ${breakerLabel}, AT ${run.target === "inferred service entrance" ? "THE INFERRED SERVICE ENTRANCE" : "THE NEAREST WALL"}, ${CONCEPT}`,
      attributes: shared("new_breaker", "The panel is assumed to sit just inside where the service enters. A site visit finds it."),
    },
  ];
}
