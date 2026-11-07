import { describe, expect, it } from "vitest";
import { sampleRecord, worcesterRecord, worcesterReport } from "../test/fixtures";
import { attentionItems, conflictCounts, factsFound, familyOf, gridRequestLine, isPublicFact, notPublicCounts } from "./facts";
import { googleEarthUrl, streetViewUrl } from "./siteLinks";

describe("facts on Worcester", () => {
  it("counts the public facts found, not what's missing or not public", () => {
    expect(factsFound(worcesterRecord())).toBe(33);
  });

  it("counts the facts that aren't public by family", () => {
    expect(notPublicCounts(worcesterRecord())).toEqual({ customer: 37, decision: 41 });
  });

  it("counts each kind of conflict apart", () => {
    expect(conflictCounts(worcesterRecord())).toEqual({ source: 1, feeder: 1, listed: 0 });
  });

  it("asks for attention on the lot-size conflict, the feeders, and the layers not checked, and nothing else one by one", () => {
    const items = attentionItems(worcesterRecord());
    expect(items.map((item) => item.id)).toEqual([
      "conflict-lot_size_acres",
      "conflict-feeder",
      "layer-earth-engine",
      "layer-fema-flood-map",
      "low-grade",
    ]);
    expect(items[0]!.reason).toMatch(/Sources disagree: 29\.92 acre .* vs\. 30\.931 acre/);
    expect(items[1]!.reason).toMatch(/4 nearby feeders.*Pre-Application Report/);
    expect(items[2]!.reason).toMatch(/^Failed or not run\. The Earth Engine adapter isn't built yet/);
    expect(items[3]!.reason).toMatch(/^Not checked by the tool\./);
  });

  it("groups values below layout grade into one item instead of listing each", () => {
    const low = attentionItems(worcesterRecord()).find((item) => item.kind === "low_grade")!;
    expect(low.title).toBe("31 public facts are reference grade, below layout grade");
    expect(low.fields).not.toContain("lot_size_acres");
  });

  it("lists a cross-check that couldn't run, and one that disagrees, but not one that agrees", () => {
    const record = worcesterRecord();
    const elevation = record.values.find((v) => v.field === "ground_elevation_ft")!;
    elevation.crossChecks = [
      { label: "USGS against Earth Engine", result: "not_checked", detail: "Earth Engine didn't answer" },
      { label: "USGS against lidar", result: "agrees" },
    ];
    record.values.find((v) => v.field === "site_slope_pct")!.crossChecks = [{ label: "Lidar against USGS", result: "disagrees" }];
    const checks = attentionItems(record).filter((item) => item.kind === "cross_check");
    expect(checks.map((item) => [item.title, item.reason])).toEqual([
      ["Ground elevation: USGS against Earth Engine", "Not checked. Earth Engine didn't answer"],
      ["Ground slope across the parcel: Lidar against USGS", "Disagrees."],
    ]);
  });

  it("names listed candidates apart from feeders", () => {
    const record = worcesterRecord();
    const utility = record.values.find((v) => v.field === "serving_utility")!;
    Object.assign(utility, { state: "conflicting", current: null, conflictKind: "listed_candidates" });
    utility.candidates = [
      { id: "a", value: { type: "text", value: "National Grid" }, observationId: "o1", sourceName: "HIFLD" },
      { id: "b", value: { type: "text", value: "Shrewsbury Electric" }, observationId: "o2", sourceName: "HIFLD" },
    ];
    expect(conflictCounts(record)).toEqual({ source: 1, feeder: 1, listed: 1 });
    expect(attentionItems(record).find((item) => item.field === "serving_utility")!.reason).toBe(
      "2 candidates, not settled. Choose one only with evidence.",
    );
  });

  it("says what public data covers on the grid connection request", () => {
    expect(gridRequestLine(worcesterReport())).toBe(
      "Grid connection request: 2 of 21 items, and 3 of 10 drawing inputs, from public data. The rest wait on your decisions or customer documents.",
    );
  });
});

describe("families", () => {
  it("reads a family from the owner on a record that names none", () => {
    const record = sampleRecord();
    const family = (field: string) => familyOf(record.values.find((v) => v.field === field)!);
    expect(family("parcel_id")).toBe("physical");
    expect(family("feeder")).toBe("utility");
    expect(family("bus_rating")).toBe("customer");
    expect(family("system_capacity_kw")).toBe("decision");
  });

  it("treats energy as public, even when a customer would supply it", () => {
    const value = worcesterRecord().values.find((v) => v.field === "peak_demand_kw")!;
    expect(isPublicFact(value)).toBe(true);
  });
});

describe("site links", () => {
  it("carries the site's coordinates, latitude first", () => {
    expect(googleEarthUrl([-71.7694444626631, 42.27614096601859])).toBe(
      "https://earth.google.com/web/@42.276141,-71.769444,0a,300d,35y,0h,45t,0r",
    );
    expect(streetViewUrl([-71.7694444626631, 42.27614096601859])).toBe(
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=42.276141,-71.769444",
    );
  });
});
