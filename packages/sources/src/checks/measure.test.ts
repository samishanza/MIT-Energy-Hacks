import { fileURLToPath } from "node:url";
import { distance } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { californiaPge, massachusetts, type CollectContext, type FetchLike } from "../index.ts";
import { collectSite } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (fetch: FetchLike = recorded): CollectContext => ({ siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0 });

async function collect(address: string, fetch: FetchLike = recorded, region = massachusetts) {
  const ctx = context(fetch);
  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, region, resolved.anchor, ctx);
  const values = deriveValues(collection.observations);
  return { collection, value: (field: string): Value => values.find((entry) => entry.field === field)! };
}

const number = (value: Value) => (value.current?.type === "quantity" ? value.current.value : null);
const feet = (from: [number, number], to: [number, number]) => distance(from, to, { units: "feet" });

// A stand-in site: a rectangle of a parcel, with buildings, lines, and roads each test can set.
const [WEST, EAST, SOUTH, NORTH] = [-71.8, -71.79, 42.26, 42.265];
const rectangle = (west: number, east: number, south: number, north: number) => [[[west, south], [west, north], [east, north], [east, south], [west, south]]];
const roofprint = (id: string, date: number, rings: number[][][]) => ({ attributes: { STRUCT_ID: id, SOURCEDATE: date }, geometry: { rings } });

function standIn(options: { buildings?: unknown[]; lines?: unknown[]; roads?: unknown[] | "down" }): FetchLike {
  const features = (list: unknown[]) => new Response(JSON.stringify({ features: list }));
  return async (url) => {
    if (url.includes("Property_Tax_Parcels")) {
      return features([{ attributes: { LOC_ID: "P-1", SITE_ADDR: "1 TEST WAY", CITY: "WORCESTER", USE_DESC: "Test", LOT_SIZE: 100, LOT_UNITS: "Acres", BLD_AREA: 1000, FY: 2026 }, geometry: { rings: rectangle(WEST, EAST, SOUTH, NORTH) } }]);
    }
    if (url.includes("Building_Structures")) return features(options.buildings ?? []);
    if (url.includes("MASDP_Feeders")) return features(options.lines ?? []);
    if (url.includes("MASDP_HostingCapacity")) return features((options.lines ?? []).map((line) => ({ attributes: (line as { attributes: unknown }).attributes })));
    if (url.includes("tigerweb")) return options.roads === "down" ? new Response("down", { status: 503 }) : features(options.roads ?? []);
    throw new Error(`Unexpected request to ${url}`);
  };
}
const ADDRESS = "1 Test Way, Worcester, MA";
const line = (id: string, paths: number[][][]) => ({ attributes: { Master_CDF: id }, geometry: { paths } });
const road = (name: string | null, paths: number[][][]) => ({ attributes: { OBJECTID: name ?? "x", NAME: name }, geometry: { paths } });

describe("site measurements", () => {
  it("measures the Worcester parcel as computed, reference-grade values, none of them verified", async () => {
    const { value, collection } = await collect("100 Research Dr, Worcester, MA");

    // Worked out separately with Turf from the same recorded polygons.
    expect(number(value("building_footprint_sqft"))).toBe(115615);
    expect(number(value("roofprint_coverage_pct"))).toBe(9.6);
    expect(number(value("building_to_lot_line_ft"))).toBeCloseTo(100.4, 0);
    expect(number(value("distance_to_nearest_line_ft"))).toBeCloseTo(93, 0);

    for (const field of ["lot_width_ft", "lot_depth_ft", "building_x_ft", "building_y_ft", "building_width_ft", "building_depth_ft", "building_footprint_sqft", "roofprint_coverage_pct", "building_to_lot_line_ft", "distance_to_nearest_line_ft", "road_side"]) {
      expect(value(field)).toMatchObject({ state: "inferred", method: "computed", grade: "reference", owner: "public_data" });
    }
    const width = collection.observations.find((observation) => observation.field === "building_width_ft")!;
    expect(width.sourceDate).toBe("parcel FY2026; roofprint 2011");
    expect(width.synthetic).toBe(false);
  });

  it("gives lot and building sizes in feet, with x from the west and y from the north", async () => {
    const building = roofprint("B-1", 20230400, rectangle(-71.797, -71.795, 42.262, 42.263));
    const { value } = await collect(ADDRESS, standIn({ buildings: [building] }));

    expect(number(value("lot_width_ft"))).toBeCloseTo(feet([WEST, 42.2625], [EAST, 42.2625]), -1);
    expect(number(value("lot_depth_ft"))).toBeCloseTo(feet([WEST, SOUTH], [WEST, NORTH]), 0);
    expect(number(value("building_x_ft"))).toBeCloseTo(feet([WEST, 42.2625], [-71.797, 42.2625]), -1);
    expect(number(value("building_y_ft"))).toBeCloseTo(feet([-71.797, NORTH], [-71.797, 42.263]), 0);
    expect(number(value("building_width_ft"))).toBeCloseTo(feet([-71.797, 42.2625], [-71.795, 42.2625]), -1);
    expect(number(value("building_depth_ft"))).toBeCloseTo(feet([-71.797, 42.262], [-71.797, 42.263]), 0);
    expect(value("lot_width_ft").flags.join(" ")).toContain("Fitted, not surveyed");
    expect(value("lot_width_ft").flags.join(" ")).toContain("fills about 100%");
  });

  it("states the method and what picking one roofprint changes", async () => {
    const main = roofprint("B-1", 20110000, rectangle(-71.797, -71.795, 42.262, 42.263));
    const shed = roofprint("B-2", 20230400, rectangle(-71.7999, -71.7995, 42.2601, 42.2603));
    const { value } = await collect(ADDRESS, standIn({ buildings: [shed, main] }));

    const choice = value("building_x_ft").flags.join(" ");
    expect(choice).toContain("largest of 2 roofprints, dated 2011");
    expect(choice).toContain("A box around all of them would be");
    expect(choice).toContain("Roofprints date from 2011 to 2023-04");
    // The shed is what comes closest to the lot line, so the choice changes that answer.
    expect(value("building_to_lot_line_ft").flags.join(" ")).toContain("Another roofprint on the parcel comes as close as");
  });

  it("doesn't mention a choice when there's only one roofprint, and never calls a distance a setback check result", async () => {
    const only = roofprint("B-1", 20110000, rectangle(-71.797, -71.795, 42.262, 42.263));
    const { value } = await collect(ADDRESS, standIn({ buildings: [only] }));
    expect(value("building_x_ft").flags.join(" ")).toContain("the one roofprint, dated 2011");
    const lotLine = value("building_to_lot_line_ft");
    expect(lotLine.flags.join(" ")).not.toContain("Another roofprint");
    expect(lotLine.flags.join(" ")).toContain("not a survey or a setback check");
    expect(JSON.stringify(lotLine)).not.toMatch(/required|complian|violat/i);
  });

  it("reads 0 and flags it when the main roofprint crosses the parcel line, with no dimension line", async () => {
    // Its center has to fall inside the parcel for it to count as this parcel's roofprint.
    const wide = roofprint("B-1", 20110000, rectangle(-71.8002, -71.797, 42.262, 42.263));
    const { value, collection } = await collect(ADDRESS, standIn({ buildings: [wide] }));
    expect(number(value("building_to_lot_line_ft"))).toBe(0);
    expect(value("building_to_lot_line_ft").flags.join(" ")).toContain("crosses the parcel line");
    expect(collection.features.some((feature) => feature.id === "dim-lot-line")).toBe(false);
  });

  it("measures the lot and leaves building values missing when no roofprint is on the parcel", async () => {
    const { value, collection } = await collect(ADDRESS, standIn({}));
    expect(value("lot_width_ft").state).toBe("inferred");
    expect(value("building_width_ft").state).toBe("missing");
    expect(value("building_width_ft").reason).toContain("Needs a parcel polygon");
    expect(collection.features.filter((feature) => feature.kind === "dimension_line").map((feature) => feature.id)).toEqual(["dim-lot-width", "dim-lot-depth"]);
  });

  it("invents nothing where there's no parcel, as in Fremont", async () => {
    const { value, collection } = await collect("47200 Bayside Pkwy, Fremont, CA", recorded, californiaPge);
    for (const field of ["lot_width_ft", "building_x_ft", "building_to_lot_line_ft", "distance_to_nearest_line_ft", "road_side"]) {
      expect(value(field).state).toBe("missing");
    }
    expect(collection.features.some((feature) => feature.kind === "dimension_line")).toBe(false);
    expect(collection.sourceRuns.some((run) => run.sourceId === "census-tiger-local-roads")).toBe(false);
  });

  it("says a distance to a line isn't evidence that the line serves the site, and draws it", async () => {
    const building = roofprint("B-1", 20110000, rectangle(-71.797, -71.795, 42.262, 42.263));
    const near = line("NEAR", [[[-71.7965, 42.2635], [-71.7955, 42.2635]]]);
    const far = line("FAR", [[[-71.7965, 42.2645], [-71.7955, 42.2645]]]);
    const { value, collection } = await collect(ADDRESS, standIn({ buildings: [building], lines: [far, near] }));

    const distanceValue = value("distance_to_nearest_line_ft");
    expect(number(distanceValue)).toBeCloseTo(feet([-71.796, 42.263], [-71.796, 42.2635]), 0);
    expect(distanceValue.flags.join(" ")).toContain("To NEAR, the nearest of 2 mapped lines");
    expect(distanceValue.flags.join(" ")).toContain("doesn't show the line serves the site");
    expect(value("feeder").state).toBe("conflicting");
    expect(collection.features.find((feature) => feature.id === "dim-nearest-line")).toMatchObject({ kind: "dimension_line", field: "distance_to_nearest_line_ft" });
  });

  it("reports no nearby line as missing with the reason", async () => {
    const { value } = await collect("11 Bartzak Dr, Holliston, MA");
    expect(value("distance_to_nearest_line_ft")).toMatchObject({ state: "missing", reason: "No mapped line was found near this parcel." });
    expect(value("road_side").state).toBe("inferred");
  });

  it("takes the road side from the street in the address, ahead of a closer road", async () => {
    const onEast = road("Test Way", [[[-71.7895, SOUTH], [-71.7895, NORTH]]]);
    const closerOnSouth = road("Other St", [[[WEST, 42.25999], [EAST, 42.25999]]]);
    const { value } = await collect(ADDRESS, standIn({ roads: [closerOnSouth, onEast] }));
    expect(value("road_side").current).toEqual({ type: "text", value: "east" });
    expect(value("road_side").flags.join(" ")).toContain("Test Way, the street in the address");
    expect(value("road_side").flags.join(" ")).toContain("Also near: Other St to the south");
  });

  it("falls back to the closest road and says so when the address's street isn't mapped nearby", async () => {
    const closerOnSouth = road("Other St", [[[WEST, 42.25999], [EAST, 42.25999]]]);
    const { value } = await collect(ADDRESS, standIn({ roads: [closerOnSouth] }));
    expect(value("road_side").current).toEqual({ type: "text", value: "south" });
    expect(value("road_side").flags.join(" ")).toContain("It isn't the street in the address");
  });

  it("leaves the road side missing with the reason when the road service fails, and measures the rest", async () => {
    const { value, collection } = await collect(ADDRESS, standIn({ roads: "down" }));
    expect(value("road_side").state).toBe("missing");
    expect(value("road_side").reason).toContain("HTTP 503");
    expect(collection.sourceRuns.find((run) => run.sourceId === "census-tiger-local-roads")).toMatchObject({ status: "missing" });
    expect(value("lot_width_ft").state).toBe("inferred");
  });

  it("keeps a repeat run unchanged, and replaces a measurement without a conflict when its inputs change", async () => {
    const first = await collect(ADDRESS, standIn({ buildings: [roofprint("B-1", 20110000, rectangle(-71.797, -71.795, 42.262, 42.263))] }));
    const repeat = await collect(ADDRESS, standIn({ buildings: [roofprint("B-1", 20110000, rectangle(-71.797, -71.795, 42.262, 42.263))] }));
    const changed = await collect(ADDRESS, standIn({ buildings: [roofprint("B-1", 20230400, rectangle(-71.797, -71.794, 42.262, 42.263))] }));

    const twice = deriveValues([...first.collection.observations, ...repeat.collection.observations]);
    expect(twice.find((entry) => entry.field === "building_width_ft")!.current).toEqual(first.value("building_width_ft").current);
    expect(twice.find((entry) => entry.field === "building_width_ft")!.flags).toEqual(first.value("building_width_ft").flags);

    const updated = deriveValues([...first.collection.observations, ...changed.collection.observations]).find((entry) => entry.field === "building_width_ft")!;
    expect(updated.state).toBe("inferred");
    expect(updated.current).toEqual(changed.value("building_width_ft").current);
    expect(updated.flags).toEqual(changed.value("building_width_ft").flags);
  });
});
