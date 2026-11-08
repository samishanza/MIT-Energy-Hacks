import { CONCEPT_GRADE_NOTE } from "@eqore/contract";
import type { Geometry, MapFeature, RecordVersion } from "@eqore/contract";

type Point = [number, number];

// One layer per kind, named the way drafters name them.
const LAYERS: Record<MapFeature["kind"], string> = {
  property_line: "PARCEL",
  building_outline: "BUILDINGS",
  road: "ROADS",
  constraint: "CONSTRAINTS",
  dimension_line: "DIMENSIONS",
  candidate_area: "CANDIDATE_AREAS",
  utility_line: "UTILITY_LINES",
  substation: "SUBSTATIONS",
  existing_equipment: "EQUIPMENT",
  capture_pin: "PINS",
};

// The same sphere as the measurements, flattened around the site, which is accurate at the size of a site.
const FEET_PER_DEGREE = (6371008.8 * Math.PI * 3.280839895) / 180;

function ringsOf(geometry: Geometry): { points: Point[]; closed: boolean }[] {
  switch (geometry.type) {
    case "Polygon":
      return (geometry.coordinates as Point[][]).map((points) => ({ points, closed: true }));
    case "MultiPolygon":
      return (geometry.coordinates as Point[][][]).flat().map((points) => ({ points, closed: true }));
    case "LineString":
      return [{ points: geometry.coordinates as Point[], closed: false }];
    case "MultiLineString":
      return (geometry.coordinates as Point[][]).map((points) => ({ points, closed: false }));
    case "Point":
      return [{ points: [geometry.coordinates as Point], closed: false }];
  }
}

function headerLines(record: RecordVersion, generatedAt: string): string[] {
  return [
    CONCEPT_GRADE_NOTE,
    `Record ${record.id}, version ${record.version}, exported ${generatedAt}.`,
    ...(record.synthetic ? ["Contains synthetic test data."] : []),
    `Site: ${record.site.address}.`,
  ];
}

// The origin is the site's location, or its first mapped point when it has none, stated in the file
// so the drawing can be placed back on the map.
export function siteFrame(record: RecordVersion) {
  const firstPoint = record.features.flatMap((feature) => ringsOf(feature.geometry).flatMap((ring) => ring.points))[0];
  const [lon0, lat0] = record.site.location ?? firstPoint ?? [0, 0];
  const perLon = FEET_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  return {
    origin: [lon0, lat0] as Point,
    toFeet: ([lon, lat]: Point): Point => [(lon - lon0) * perLon, (lat - lat0) * FEET_PER_DEGREE],
  };
}

const fixed = (number: number) => number.toFixed(3);
const pair = (code: number, value: string | number) => `${code}\n${value}`;

// AutoCAD R12 ASCII, which every free viewer opens. Coordinates are feet east and north of the stated origin.
export function toDxf(record: RecordVersion, generatedAt: string): string {
  const { origin, toFeet } = siteFrame(record);
  const used = [...new Set(record.features.map((feature) => LAYERS[feature.kind]))].sort();
  const layers = ["NOTES", ...used];
  const notes = [...headerLines(record, generatedAt), `Units: feet. Origin (0,0) is longitude ${origin[0]}, latitude ${origin[1]} (WGS 84). +X is east and +Y is north.`];

  const out: string[] = [];
  for (const line of notes) out.push(pair(999, line));
  out.push(pair(0, "SECTION"), pair(2, "HEADER"), pair(9, "$ACADVER"), pair(1, "AC1009"), pair(9, "$INSBASE"), pair(10, "0.0"), pair(20, "0.0"), pair(30, "0.0"), pair(0, "ENDSEC"));
  out.push(pair(0, "SECTION"), pair(2, "TABLES"), pair(0, "TABLE"), pair(2, "LAYER"), pair(70, layers.length));
  layers.forEach((name, index) => out.push(pair(0, "LAYER"), pair(2, name), pair(70, 0), pair(62, (index % 7) + 1), pair(6, "CONTINUOUS")));
  out.push(pair(0, "ENDTAB"), pair(0, "ENDSEC"));

  out.push(pair(0, "SECTION"), pair(2, "ENTITIES"));
  notes.forEach((line, index) => out.push(pair(0, "TEXT"), pair(8, "NOTES"), pair(10, "0.0"), pair(20, fixed(-20 - index * 6)), pair(30, "0.0"), pair(40, "4.0"), pair(1, line)));
  for (const feature of record.features) {
    const layer = LAYERS[feature.kind];
    for (const { points, closed } of ringsOf(feature.geometry)) {
      const local = points.map(toFeet);
      if (local.length === 1) {
        out.push(pair(0, "POINT"), pair(8, layer), pair(10, fixed(local[0]![0])), pair(20, fixed(local[0]![1])), pair(30, "0.0"));
        continue;
      }
      // A closed ring repeats its first point, which the closed flag already implies.
      const vertices = closed && local.length > 1 ? local.slice(0, -1) : local;
      out.push(pair(0, "POLYLINE"), pair(8, layer), pair(66, 1), pair(10, "0.0"), pair(20, "0.0"), pair(30, "0.0"), pair(70, closed ? 1 : 0));
      for (const [x, y] of vertices) out.push(pair(0, "VERTEX"), pair(8, layer), pair(10, fixed(x)), pair(20, fixed(y)), pair(30, "0.0"));
      out.push(pair(0, "SEQEND"), pair(8, layer));
    }
  }
  out.push(pair(0, "ENDSEC"), pair(0, "EOF"));
  return `${out.join("\n")}\n`;
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const coordinates = (points: Point[]) => points.map(([lon, lat]) => `${lon},${lat},0`).join(" ");

function kmlGeometry(geometry: Geometry): string {
  const parts = ringsOf(geometry).map(({ points, closed }) => {
    if (points.length === 1) return `<Point><coordinates>${coordinates(points)}</coordinates></Point>`;
    if (closed) return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates(points)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    return `<LineString><coordinates>${coordinates(points)}</coordinates></LineString>`;
  });
  return parts.length === 1 ? parts[0]! : `<MultiGeometry>${parts.join("")}</MultiGeometry>`;
}

// Longitude and latitude on WGS 84, one folder per layer, as Google Earth reads it.
export function toKml(record: RecordVersion, generatedAt: string): string {
  const description = headerLines(record, generatedAt).join(" ");
  const byLayer = new Map<string, MapFeature[]>();
  for (const feature of record.features) {
    const layer = LAYERS[feature.kind];
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), feature]);
  }
  const folders = [...byLayer.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([layer, features]) =>
        `<Folder><name>${layer}</name>${features
          .map((feature) => `<Placemark><name>${escapeXml(feature.label ?? feature.id)}</name><description>${escapeXml(`${feature.field}, from record ${record.id}`)}</description>${kmlGeometry(feature.geometry)}</Placemark>`)
          .join("")}</Folder>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document><name>${escapeXml(`${record.site.address}, version ${record.version}`)}</name><description>${escapeXml(description)}</description>
${folders}
</Document>
</kml>
`;
}
