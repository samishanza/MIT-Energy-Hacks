import type { MapFeature, Observation } from "@eqore/contract";
import { observe, type ArcgisResult, type CollectContext, type PolygonGeometry } from "../arcgis.ts";
import { closestGap, frameAround, segmentsOf, verticesOf, type Point } from "../geometry.ts";
import type { NearbySegment } from "./grid.ts";

export type ServicePath = { observations: Observation[]; features: MapFeature[] };

const FIELD = "grid_service_path";
const INFERRED = "INFERRED, NOT FIELD VERIFIED";

function sideOf(center: Point, point: Point): string {
  const degrees = (Math.atan2(point[0] - center[0], point[1] - center[1]) * 180) / Math.PI;
  const sides = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return sides[Math.round(((degrees + 360) % 360) / 45) % 8]!;
}

const transformerFor = (construction: string) =>
  construction === "overhead"
    ? "An overhead line usually feeds a building through a pole-mounted transformer and a service drop."
    : construction === "underground"
      ? "An underground line usually feeds a building through a pad-mounted transformer near it."
      : "How this line is built isn't stated, so the kind of transformer isn't either.";

// How the building is most likely fed: from the mapped line nearest its outline, to the wall nearest that line.
// Line positions are schematic, so every part is inferred, labeled as such, and never verified here.
export function inferServicePath(building: PolygonGeometry | null, segments: NearbySegment[], origin: ArcgisResult | null, ctx: CollectContext): ServicePath {
  if (!origin) return { observations: [], features: [] };
  const missing = (reason: string): ServicePath => ({ observations: [observe(origin, ctx, { field: FIELD, kind: "no_value", value: null, reason })], features: [] });
  if (!building) return missing("No roofprint marks the building, so there's no wall to trace a service to.");
  if (segments.length === 0) return missing(`No mapped distribution line was found near the building, so the service path can't be traced from public data. ${origin.failure ?? ""}`.trim());

  const { toFeet, toLonLat } = frameAround(building);
  const walls = segmentsOf(building, toFeet);
  const nearest = segments
    .map((segment) => ({ segment, gap: closestGap(segmentsOf(segment.feature.geometry, toFeet), walls) }))
    .sort((a, b) => a.gap.feet - b.gap.feet || a.segment.feeder.localeCompare(b.segment.feeder))[0]!;
  const { segment, gap } = nearest;
  const vertices = verticesOf(building).map(toFeet);
  const center: Point = [vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length, vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length];
  const side = sideOf(center, gap.to);
  const feet = Math.round(gap.feet);
  const line = `${segment.phases ? `${segment.phases}-phase ` : ""}${segment.construction}`;
  const why = `The mapped ${line} segment of ${segment.feeder} is the line nearest the building, about ${feet} ft from its ${side} side. Mapped line positions are schematic.`;

  const shared = (equipment: string, reason: string) => ({
    equipment_type: { type: "text" as const, value: equipment },
    basis: { type: "text" as const, value: "inferred" },
    confidence_reason: { type: "text" as const, value: reason },
    feeder: { type: "text" as const, value: segment.feeder },
  });
  const tap = toLonLat(gap.from);
  const entrance = toLonLat(gap.to);
  const features: MapFeature[] = [
    {
      id: "service-path",
      kind: "utility_line",
      field: FIELD,
      geometry: { type: "LineString", coordinates: [tap, entrance] },
      label: `(E) LIKELY SERVICE PATH FROM ${segment.feeder}, ${INFERRED}`,
      attributes: { ...shared("service_path", why), line_class: { type: "text", value: "inferred service path" }, distance_ft: { type: "quantity", value: feet, unit: "ft" } },
    },
    {
      id: "service-tap",
      kind: "existing_equipment",
      field: FIELD,
      geometry: { type: "Point", coordinates: tap },
      label: `(E) LIKELY SERVICE TAP ON ${segment.feeder}, ${INFERRED}`,
      attributes: { ...shared("service_tap", `${why} ${transformerFor(segment.construction)}`), construction: { type: "text", value: segment.construction } },
    },
    {
      id: "service-entrance",
      kind: "existing_equipment",
      field: FIELD,
      geometry: { type: "Point", coordinates: entrance },
      label: `(E) LIKELY SERVICE ENTRANCE, ${side.toUpperCase()} SIDE, ${INFERRED}`,
      attributes: shared("service_entrance", `${why} The service usually enters on the side facing its supply, and the main switchgear is usually just inside it.`),
    },
  ];
  return {
    observations: [
      observe(segment.source, ctx, {
        field: FIELD,
        kind: "reading",
        value: { type: "text", value: `Likely fed from ${segment.feeder} (${line}), the nearest mapped line, about ${feet} ft from the building's ${side} side` },
        attribute: "nearest mapped line to the main building",
        objectId: segment.feature.objectId,
        method: "computed",
        grade: "reference",
        reason: `${why} ${transformerFor(segment.construction)} Inferred from public line maps, not field verified; the utility confirms the service.`,
      }),
    ],
    features,
  };
}
