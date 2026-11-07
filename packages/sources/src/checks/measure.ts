import { area, booleanPointInPolygon } from "@turf/turf";
import type { MapFeature, Observation } from "@eqore/contract";
import { observe, sourceDateOf, type ArcgisFeature, type ArcgisResult, type CollectContext, type PolygonGeometry } from "../arcgis.ts";
import { boxOf, closestGap, frameAround, segmentsOf, verticesOf, type Box, type Point, type Segment, closestPointOn } from "../geometry.ts";
import { normalizeStreet, parseAddress } from "../resolve-site.ts";
import { convertUnit } from "../units.ts";

export type MeasureInputs = {
  address: string;
  lookup: ArcgisResult;
  parcel: ArcgisFeature & { geometry: PolygonGeometry };
  outlines: { result: ArcgisResult; features: (ArcgisFeature & { geometry: PolygonGeometry })[] } | null;
  lines: { result: ArcgisResult; features: ArcgisFeature[]; label: (feature: ArcgisFeature) => string }[];
  roads: { result: ArcgisResult; features: ArcgisFeature[]; nameAttribute: string } | null;
  assessorAreaSqft: number | null;
};

export type Measurements = { observations: Observation[]; features: MapFeature[] };

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const whole = (value: number) => Math.round(value).toLocaleString("en-US");

function datesOf(...inputs: [string, string | null][]): string {
  return inputs.map(([name, date]) => `${name} ${date ?? "date not stated"}`).join("; ");
}

// Measured from each side's midpoint, because a road running along one side can be just as close to a corner.
function sideFacing(road: Segment[], box: Box): "north" | "south" | "east" | "west" {
  const middleX = (box.minX + box.maxX) / 2;
  const middleY = (box.minY + box.maxY) / 2;
  const sides = [
    ["west", [box.minX, middleY]],
    ["east", [box.maxX, middleY]],
    ["south", [middleX, box.minY]],
    ["north", [middleX, box.maxY]],
  ] as const;
  const toRoad = (point: readonly [number, number]) =>
    Math.min(
      ...road.map((segment) => {
        const closest = closestPointOn(segment, [point[0], point[1]]);
        return Math.hypot(point[0] - closest[0], point[1] - closest[1]);
      }),
    );
  return [...sides].sort((a, b) => toRoad(a[1]) - toRoad(b[1]))[0]![0];
}

function streetOf(address: string): string | null {
  // The house number isn't part of a road's name.
  return parseAddress(address)?.street.replace(/^\S+\s+/, "") ?? null;
}

// Measures what the collected geometry supports. Every result is a computed reading for a person to
// trust or check: fitted boxes are labeled as fitted, and nothing here compares a distance with a rule.
export function measureSite(input: MeasureInputs, ctx: CollectContext): Measurements {
  const { lookup, parcel } = input;
  const { toFeet, toLonLat } = frameAround(parcel.geometry);
  const parcelSegments = segmentsOf(parcel.geometry, toFeet);
  const lot = boxOf(parcelSegments.flat());
  const lotWidth = lot.maxX - lot.minX;
  const lotDepth = lot.maxY - lot.minY;
  const parcelDate = sourceDateOf(lookup.entry, parcel.attributes);
  const parcelSqft = convertUnit(area(parcel.geometry), "sqm", "sqft");

  const observations: Observation[] = [];
  const features: MapFeature[] = [];
  const dimension = (id: string, field: string, from: Point, to: Point, label: string) =>
    features.push({ id, kind: "dimension_line", field, geometry: { type: "LineString", coordinates: [toLonLat(from), toLonLat(to)] }, label });

  const record = (origin: ArcgisResult, field: string, value: Observation["value"], attribute: string, sourceDate: string, reason?: string, objectId?: string) =>
    observations.push(
      observe(origin, ctx, { field, kind: "reading", value, method: "computed", attribute, sourceDate, grade: "reference", reason, objectId }),
    );
  const quantity = (value: number, unit: string) => ({ type: "quantity" as const, value, unit });

  const fill = Math.round((parcelSqft / (lotWidth * lotDepth)) * 100);
  const fitted = `Fitted, not surveyed: the lot's full east-west and north-south extent. The parcel fills about ${fill}% of that box.`;
  record(lookup, "lot_width_ft", quantity(oneDecimal(lotWidth), "ft"), "east-west extent of the parcel polygon", datesOf(["parcel", parcelDate]), fitted, parcel.objectId);
  record(lookup, "lot_depth_ft", quantity(oneDecimal(lotDepth), "ft"), "north-south extent of the parcel polygon", datesOf(["parcel", parcelDate]), fitted, parcel.objectId);
  dimension("dim-lot-width", "lot_width_ft", [lot.minX, lot.minY], [lot.maxX, lot.minY], `${whole(lotWidth)} ft (fitted)`);
  dimension("dim-lot-depth", "lot_depth_ft", [lot.minX, lot.minY], [lot.minX, lot.maxY], `${whole(lotDepth)} ft (fitted)`);

  const buildings = input.outlines?.features ?? [];
  const outlineResult = input.outlines?.result;
  const main = [...buildings].sort((a, b) => area(b.geometry) - area(a.geometry) || a.objectId.localeCompare(b.objectId))[0];

  if (main && outlineResult) {
    const mainSegments = segmentsOf(main.geometry, toFeet);
    const box = boxOf(mainSegments.flat());
    const mainDate = sourceDateOf(outlineResult.entry, main.attributes);
    const mainSqft = convertUnit(area(main.geometry), "sqm", "sqft");
    const totalSqft = buildings.reduce((sum, building) => sum + convertUnit(area(building.geometry), "sqm", "sqft"), 0);
    const mainDates = datesOf(["parcel", parcelDate], ["roofprint", mainDate]);
    const allDates = buildings.map((building) => sourceDateOf(outlineResult.entry, building.attributes) ?? "date not stated").sort();
    const dateNote = allDates[0] === allDates.at(-1) ? "" : ` Roofprints date from ${allDates[0]} to ${allDates.at(-1)}.`;

    // The main building is the largest roofprint on the parcel. With others present, say what that choice changes.
    const allBox = boxOf(buildings.flatMap((building) => segmentsOf(building.geometry, toFeet)).flat());
    const choice =
      buildings.length === 1
        ? `Fitted to the one roofprint, dated ${mainDate ?? "with no date"}.`
        : `Fitted to the largest of ${buildings.length} roofprints, dated ${mainDate ?? "with no date"}. A box around all of them would be ${whole(allBox.maxX - allBox.minX)} by ${whole(allBox.maxY - allBox.minY)} ft, starting ${whole(allBox.minX - lot.minX)} ft from the west and ${whole(lot.maxY - allBox.maxY)} ft from the north.${dateNote}`;
    const boxes: [string, number, string][] = [
      ["building_x_ft", box.minX - lot.minX, "west side of the main roofprint's box to the west side of the lot's box"],
      ["building_y_ft", lot.maxY - box.maxY, "north side of the main roofprint's box to the north side of the lot's box"],
      ["building_width_ft", box.maxX - box.minX, "east-west extent of the main roofprint"],
      ["building_depth_ft", box.maxY - box.minY, "north-south extent of the main roofprint"],
    ];
    for (const [field, feet, attribute] of boxes) record(outlineResult, field, quantity(oneDecimal(feet), "ft"), attribute, mainDates, choice, main.objectId);

    record(
      outlineResult,
      "building_footprint_sqft",
      quantity(Math.round(mainSqft), "sqft"),
      "area of the main roofprint",
      datesOf(["roofprint", mainDate]),
      buildings.length > 1 ? `The largest of ${buildings.length} roofprints, which total ${whole(totalSqft)} sq ft.${dateNote}` : undefined,
      main.objectId,
    );
    const assessorRatio = input.assessorAreaSqft ? input.assessorAreaSqft / totalSqft : null;
    record(
      outlineResult,
      "roofprint_coverage_pct",
      quantity(oneDecimal((totalSqft / parcelSqft) * 100), "percent"),
      "total roofprint area over parcel polygon area",
      datesOf(["parcel", parcelDate], ["roofprints", allDates.at(-1) ?? null]),
      assessorRatio !== null && assessorRatio >= 1.5
        ? `The assessor lists ${whole(input.assessorAreaSqft!)} sq ft of building area, ${assessorRatio.toFixed(1)} times the ${whole(totalSqft)} sq ft of roofprints. Upper floors or out-of-date outlines could explain it, and the two aren't compared as a conflict.`
        : undefined,
    );

    // A measured distance only. Whether it meets any required setback is for a person to judge.
    const crosses = verticesOf(main.geometry).some((vertex) => !booleanPointInPolygon(vertex, parcel.geometry));
    const gap = crosses ? null : closestGap(mainSegments, parcelSegments);
    const closestAny = Math.min(...buildings.map((building) => closestGap(segmentsOf(building.geometry, toFeet), parcelSegments).feet));
    const lotLineNotes = [
      crosses ? "The main roofprint crosses the parcel line, so this reads 0." : "",
      !crosses && gap && gap.feet - closestAny >= 1 ? `Measured from the main roofprint. Another roofprint on the parcel comes as close as ${oneDecimal(closestAny)} ft.` : "",
      "A measured distance from public outlines, not a survey or a setback check.",
    ].filter(Boolean);
    record(outlineResult, "building_to_lot_line_ft", quantity(gap ? oneDecimal(gap.feet) : 0, "ft"), "closest distance from the main roofprint to the parcel line", mainDates, lotLineNotes.join(" "), main.objectId);
    if (gap) dimension("dim-lot-line", "building_to_lot_line_ft", gap.from, gap.to, `${whole(gap.feet)} ft`);

    const measuredLines = input.lines.flatMap(({ result, features: lineFeatures, label }) =>
      lineFeatures
        .filter((feature) => feature.geometry)
        .map((feature) => {
          const segments = segmentsOf(feature.geometry!, toFeet);
          return { result, feature, name: label(feature), gap: closestGap(mainSegments, segments), closestAny: Math.min(...buildings.map((building) => closestGap(segmentsOf(building.geometry, toFeet), segments).feet)) };
        }),
    );
    const nearest = [...measuredLines].sort((a, b) => a.gap.feet - b.gap.feet || a.name.localeCompare(b.name))[0];
    if (nearest) {
      const lineNotes = [
        `To ${nearest.name}, the nearest of ${measuredLines.length} mapped ${measuredLines.length === 1 ? "line" : "lines"}. This doesn't show the line serves the site, and line positions aren't surveyed.`,
        nearest.gap.feet - Math.min(...measuredLines.map((line) => line.closestAny)) >= 1 ? `Measured from the main roofprint. Another roofprint comes as close as ${oneDecimal(Math.min(...measuredLines.map((line) => line.closestAny)))} ft.` : "",
      ].filter(Boolean);
      record(
        nearest.result,
        "distance_to_nearest_line_ft",
        quantity(oneDecimal(nearest.gap.feet), "ft"),
        "closest distance from the main roofprint to a mapped line",
        datesOf(["roofprint", mainDate], ["line", sourceDateOf(nearest.result.entry, nearest.feature.attributes)]),
        lineNotes.join(" "),
        nearest.feature.objectId,
      );
      dimension("dim-nearest-line", "distance_to_nearest_line_ft", nearest.gap.from, nearest.gap.to, `${whole(nearest.gap.feet)} ft`);
    } else {
      const origin = input.lines[0]?.result;
      if (origin) observations.push(observe(origin, ctx, { field: "distance_to_nearest_line_ft", kind: "no_value", value: null, reason: "No mapped line was found near this parcel." }));
    }
  }

  if (input.roads) {
    const { result, features: roadFeatures, nameAttribute } = input.roads;
    const street = streetOf(input.address);
    const roads = roadFeatures
      .filter((feature) => feature.geometry)
      .map((feature) => {
        const segments = segmentsOf(feature.geometry!, toFeet);
        return { feature, name: String(feature.attributes[nameAttribute] ?? "unnamed road"), gap: closestGap(segments, parcelSegments), side: sideFacing(segments, lot) };
      })
      .sort((a, b) => a.gap.feet - b.gap.feet || a.name.localeCompare(b.name));
    const onAddress = roads.find((road) => normalizeStreet(road.name) === street);
    const chosen = onAddress ?? roads[0];
    if (chosen) {
      const others = [...new Set(roads.filter((road) => road.side !== chosen.side && road.feature.attributes[nameAttribute]).map((road) => `${road.name} to the ${road.side}`))];
      const how = onAddress ? `The side of the lot's box nearest ${chosen.name}, the street in the address.` : `The side of the lot's box nearest ${chosen.name}, the closest mapped road. It isn't the street in the address.`;
      record(
        result,
        "road_side",
        { type: "text", value: chosen.side },
        "side of the lot's box nearest the road",
        datesOf(["parcel", parcelDate], ["road", null]),
        [how, others.length ? `Also near: ${others.slice(0, 3).join(", ")}.` : ""].filter(Boolean).join(" "),
        chosen.feature.objectId,
      );
    } else {
      observations.push(observe(result, ctx, { field: "road_side", kind: "no_value", value: null, reason: result.failure ?? `No mapped local road was found within ${result.entry.searchRadiusMeters} m of the parcel.` }));
    }
  }

  return { observations, features };
}
