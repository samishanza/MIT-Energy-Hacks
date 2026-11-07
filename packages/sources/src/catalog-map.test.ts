import { fileURLToPath } from "node:url";
import { FIELD_CATALOG } from "@eqore/catalog";
import { describe, expect, it } from "vitest";
import { massachusetts, type CollectContext } from "./index.ts";
import { CATALOG_ROUTES, catalogCoverage, lineToLineVolts, publicFieldsNotCollected } from "./catalog-map.ts";
import { collectSite } from "./collect.ts";
import { deriveValues } from "./derive.ts";
import { fieldDefinition } from "./fields.ts";
import { fixtureFetch } from "./fixtures.ts";
import { resolveSite } from "./resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const ctx: CollectContext = { siteId: "t", fetch: fixtureFetch(dir("arcgis"), dir("geocoder")), now: () => "2026-11-07T20:00:00.000Z", measureSlope: async () => ({ slopePercent: 6.96, sampleCount: 35, demResolutionFt: 4.9 }) };

async function worcesterValues() {
  const resolved = await resolveSite("100 Research Dr, Worcester, MA", massachusetts, ctx);
  if (resolved.status !== "resolved") throw new Error("Expected one match");
  return deriveValues((await collectSite("100 Research Dr, Worcester, MA", massachusetts, resolved.anchor, ctx)).observations);
}

describe("the catalog map", () => {
  it("routes every catalog key exactly once, naming any it misses", () => {
    const routed = CATALOG_ROUTES.map((route) => route.key);
    expect(FIELD_CATALOG.map((spec) => spec.key).filter((key) => !routed.includes(key))).toEqual([]);
    expect(routed.filter((key) => !FIELD_CATALOG.some((spec) => spec.key === key))).toEqual([]);
    expect(new Set(routed).size).toBe(routed.length);
  });

  it("gives every route a reason and a value, so an unanswered field still shows who holds it", () => {
    for (const route of CATALOG_ROUTES) {
      expect(route.why.length).toBeGreaterThan(0);
      expect(fieldDefinition(route.field), route.key).toBeDefined();
    }
    expect(fieldDefinition("design_wind_speed_mph")).toMatchObject({ owner: "engineer", family: "decision" });
  });

  it("gives a bus rating to a qualified person, and public data only to fields a source fills", async () => {
    expect(CATALOG_ROUTES.find((route) => route.key === "electrical.bus_rating_a")).toMatchObject({ owner: "qualified_person", field: "bus_rating" });
    expect(fieldDefinition("bus_rating")!.owner).toBe("qualified_person");
    const answered = new Set((await worcesterValues()).filter((value) => value.observationIds.length > 0).map((value) => value.field));
    const unsourced = CATALOG_ROUTES.filter((route) => route.owner === "public_data" && !answered.has(route.field)).map((route) => route.key);
    expect(unsourced).toEqual([]);
  });

  it("reports what a public source could fill and nothing collects yet", () => {
    const keys = publicFieldsNotCollected().map((route) => route.key);
    expect(keys).toEqual(expect.arrayContaining(["codes.building", "design.wind_speed_mph", "zoning.setback_front_ft", "zoning.screening_required", "fire.hydrant_distance_ft"]));
    for (const route of publicFieldsNotCollected()) expect(route.owner).not.toBe("public_data");
  });

  it("counts Worcester's coverage as a hand count of its recorded values", async () => {
    const coverage = catalogCoverage(await worcesterValues());
    // address, parcel ID, year built, lot width and depth, building x, y, width, and depth, height,
    // road side, slope, zoning district, serving utility, hosting capacity on the feeder candidates,
    // and the largest candidate pad area derived from the parcel and roofprint polygons.
    expect(coverage).toEqual({ filled: 16, total: FIELD_CATALOG.length, byOwner: { public_data: 1, customer: 23, engineer: 30, qualified_person: 7, utility: 2 } });
  });

  it("sets a family on every value", async () => {
    for (const value of await worcesterValues()) expect(value.family, value.field).toBeDefined();
  });
});

describe("reading a printed service voltage", () => {
  it.each([
    ["480Y/277 V", 480],
    ["480Y/277", 480],
    ["277/480Y V", 480],
    ["208Y/120", 208],
    ["120/240 V", 240],
    ["480 volts", 480],
    ["13.8 kV", 13800],
  ])("reads %s as %d line-to-line volts", (printed, volts) => {
    expect(lineToLineVolts(printed)).toBe(volts);
  });

  it.each(["unknown", "see panel", "A/B/C", ""])("keeps %j as printed", (printed) => {
    expect(lineToLineVolts(printed)).toBe(printed);
  });
});
