import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { californiaPge, massachusetts, type CollectContext } from "../index.ts";
import { collectSite } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";
import { convertUnit } from "../units.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (): CollectContext => ({ siteId: "test-site", fetch: recorded, now: () => "2026-11-07T20:00:00.000Z" });

async function values(address: string, region: typeof massachusetts) {
  const ctx = context();
  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, region, resolved.anchor, ctx);
  const all = deriveValues(collection.observations);
  return { collection, value: (field: string): Value => all.find((entry) => entry.field === field)! };
}

describe("utility-side collection", () => {
  it("lists each Worcester feeder with its substation, voltage, phase, and hosting capacity in MW", async () => {
    const { value, collection } = await values("100 Research Dr, Worcester, MA", massachusetts);
    const feeder = value("feeder");

    expect(value("serving_utility").current).toEqual({ type: "text", value: "National Grid" });
    expect(value("serving_utility").method).toBe("source_read");
    expect(feeder.candidates.map((candidate) => candidate.value)).toEqual(
      ["05_01_10J323", "05_01_10J366", "05_01_27W2", "05_01_27W3"].map((name) => ({ type: "text", value: name })),
    );
    expect(feeder.candidates[0]!.attributes).toMatchObject({
      substation: { type: "text", value: "RENASTREET10" },
      voltage: { type: "quantity", value: 4.16, unit: "kV" },
      phase: { type: "quantity", value: 3, unit: "phase" },
    });
    expect(feeder.candidates[0]!.attributes!.hosting_capacity).toMatchObject({ unit: "MW" });
    const lines = collection.features.filter((feature) => feature.kind === "utility_line" && feature.label?.startsWith("Nearby line"));
    expect(lines.map((line) => line.label).sort()).toEqual([
      "Nearby line: 05_01_10J323",
      "Nearby line: 05_01_10J366",
      "Nearby line: 05_01_27W2",
      "Nearby line: 05_01_27W3",
    ]);
    expect(lines[0]!.geometry.type).toMatch(/LineString/);

    // The fixed search distance is stored on the evidence.
    const reading = collection.observations.find((observation) => observation.field === "feeder")!;
    expect(reading.locator.query).toContain("buffer 30 m");
  });

  it("reads a Fremont feeder at 21 kV, 3 phase, with its screen result and analysis date", async () => {
    const { value } = await values("47200 Bayside Pkwy, Fremont, CA", californiaPge);
    const newark = value("feeder").candidates.find((candidate) => candidate.value.type === "text" && candidate.value.value === "NEWARK 21KV 2104")!;

    expect(value("serving_utility").current).toEqual({ type: "text", value: "PG&E" });
    expect(newark.attributes!.voltage).toEqual({ type: "quantity", value: 21, unit: "kV" });
    expect(newark.attributes!.phase).toEqual({ type: "quantity", value: 3, unit: "phase" });
    expect(newark.attributes!.screen_result?.type).toBe("text");
    expect(newark.attributes!.source_date?.type).toBe("text");
  });

  it("keeps two candidate feeders as conflicting, with both listed", async () => {
    const { value } = await values("47200 Bayside Pkwy, Fremont, CA", californiaPge);
    const feeder = value("feeder");
    expect(feeder.state).toBe("conflicting");
    expect(feeder.conflictKind).toBe("feeder_candidates");
    expect(feeder.candidates).toHaveLength(2);
    expect(feeder.current).toBeNull();
  });

  it("leaves Holliston's feeder missing, and its utility among candidates with none asserted", async () => {
    const { value } = await values("11 Bartzak Dr, Holliston, MA", massachusetts);
    expect(value("feeder").state).toBe("missing");
    expect(value("serving_utility")).toMatchObject({ state: "conflicting", current: null });
  });

  it("converts kW to MW before storing a PG&E capacity, and refuses a pair it can't convert", async () => {
    const { collection } = await values("47200 Bayside Pkwy, Fremont, CA", californiaPge);
    const capacity = collection.observations.find((observation) => observation.field === "feeder_hosting_capacity" && observation.kind === "reading")!;
    expect(capacity.value).toEqual({ type: "quantity", value: 0.559, unit: "MW" });
    expect(convertUnit(4160, "V", "kV")).toBeCloseTo(4.16);
    expect(() => convertUnit(1, "kW", "kWh")).toThrow("No conversion");
  });
});

describe("deeper utility data, joined to each feeder candidate", () => {
  const attributesOf = async (address: string, region: typeof massachusetts, feeder: string) => {
    const { value } = await values(address, region);
    return value("feeder").candidates!.find((candidate) => candidate.value.type === "text" && candidate.value.value === feeder)!.attributes!;
  };

  it("carries 05_01_27W2's loading, forecast, rating, construction, and study status", async () => {
    const details = await attributesOf("100 Research Dr, Worcester, MA", massachusetts, "05_01_27W2");
    expect(details.peak_loading).toEqual({ type: "quantity", value: 54.3, unit: "percent" });
    expect(details.peak_forecast).toEqual({ type: "text", value: "6.4, 6.4, 7.8, 7.8, 7.8, 7.8 MVA (peak this year, then each of the next five, as the utility forecasts)" });
    expect(details.rating).toEqual({ type: "quantity", value: 11.8, unit: "MVA" });
    expect(details.construction).toEqual({ type: "text", value: "Mixed: 57% underground by mapped length" });
    expect(details.study_status).toEqual({ type: "text", value: "Group Study Impending Accepting Applications" });
    expect(details.installed_dg).toEqual({ type: "quantity", value: 1.41219, unit: "MW" });
  });

  it("keeps each nodal limit near the site and names the lowest", async () => {
    const details = await attributesOf("100 Research Dr, Worcester, MA", massachusetts, "05_01_27W2");
    expect(details.hosting_capacity_near_site).toEqual({
      type: "text",
      value: "2.5 MW, limited by thermal (also over-voltage 10, voltage deviation 10, regulator deviation 10, anti-islanding 10, flicker 20 MW)",
    });
  });

  it("reports substations and transmission as nearby context with measured distance, never as what serves the site", async () => {
    const worcester = await values("100 Research Dr, Worcester, MA", massachusetts);
    expect(worcester.value("substations_nearby").flags.join(" ")).toContain("doesn't show which substation serves the site");
    const substation = worcester.collection.features.find((feature) => feature.kind === "substation")!;
    expect(substation.attributes!.distance_ft).toMatchObject({ unit: "ft" });

    const fremont = await values("47200 Bayside Pkwy, Fremont, CA", californiaPge);
    expect((fremont.value("transmission_nearby").current as { value: string }).value).toMatch(/^11 mapped transmission lines within 1500 m/);
    // PG&E publishes its substation DG totals with no unit, so they aren't read as kW or MW.
    const pgeSubstation = fremont.collection.features.find((feature) => feature.kind === "substation")!;
    expect(Object.keys(pgeSubstation.attributes!).sort()).toEqual(["distance_ft", "substation_voltage"]);
  });
});

describe("every collected grid feature, drawn", () => {
  it("draws each mapped segment near the site with how it's built, and puts feeder details on the feeder lines", async () => {
    const { collection } = await values("100 Research Dr, Worcester, MA", massachusetts);
    const segments = collection.features.filter((feature) => feature.attributes?.line_class?.type === "text" && feature.attributes.line_class.value === "distribution segment");
    expect(segments.length).toBeGreaterThan(0);
    expect(new Set(segments.map((segment) => (segment.attributes!.construction as { value: string }).value))).toEqual(new Set(["overhead", "underground"]));
    const feederLine = collection.features.find((feature) => feature.label === "Nearby line: 05_01_27W2")!;
    expect(feederLine.attributes).toMatchObject({ peak_loading: { type: "quantity", value: 54.3, unit: "percent" }, rating: { value: 11.8, unit: "MVA" }, construction: { value: "Mixed: 57% underground by mapped length" } });
  });

  it("draws every substation within 3 km, proposed substations, and transmission lines with their voltage", async () => {
    const { collection, value } = await values("100 Research Dr, Worcester, MA", massachusetts);
    const existing = collection.features.filter((feature) => feature.field === "substations_nearby");
    expect(existing).toHaveLength(11);
    expect((value("substations_nearby").current as { value: string }).value).toMatch(/^11 mapped substations within 3000 m/);
    expect(collection.features.some((feature) => feature.field === "proposed_substations_nearby" && feature.label?.startsWith("Proposed substation #"))).toBe(true);
    const transmission = collection.features.filter((feature) => feature.field === "transmission_nearby");
    expect(transmission).toHaveLength(9);
    expect(transmission.every((line) => line.label?.startsWith("Transmission line from "))).toBe(true);
    expect(transmission.some((line) => line.attributes?.line_voltage?.type === "quantity" && line.attributes.line_voltage.value === 345)).toBe(true);
  });
});
