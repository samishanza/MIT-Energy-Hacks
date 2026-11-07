import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { massachusetts, type CollectContext, type FetchLike } from "../index.ts";
import { collectSite } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";
import { crossCheck, crossCheckCounts } from "./cross-checks.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));

async function checked(address: string, fetch: FetchLike = recorded) {
  const ctx: CollectContext = { siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0 };
  const resolved = await resolveSite(address, massachusetts, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, massachusetts, resolved.anchor, ctx);
  const plain = deriveValues(collection.observations);
  const values = crossCheck({ address, values: plain, observations: collection.observations, features: collection.features });
  return { plain, values, value: (field: string): Value => values.find((entry) => entry.field === field)! };
}

describe("cross-checks between independent sources", () => {
  it("records Worcester's stated lot size against its polygon as a 3.3% disagreement", async () => {
    const { value } = await checked("100 Research Dr, Worcester, MA");
    expect(value("lot_size_acres").crossChecks).toEqual([
      { label: "Stated lot size against the parcel polygon", result: "disagrees", detail: "Stated 29.92 acres, polygon 30.931 acres: 3.3% apart, against a 3% tolerance." },
    ]);
  });

  it("flags a disagreement and changes neither the value's state nor its reading", async () => {
    const { plain, value } = await checked("100 Research Dr, Worcester, MA");
    const before = plain.find((entry) => entry.field === "lot_size_acres")!;
    const after = value("lot_size_acres");
    expect(after.state).toBe(before.state);
    expect(after.current).toEqual(before.current);
    expect(after.flags).toEqual([...before.flags, expect.stringContaining("Cross-check disagrees: Stated lot size against the parcel polygon.")]);
  });

  it("agrees across sources that match, giving both values", async () => {
    const { value } = await checked("100 Research Dr, Worcester, MA");
    expect(value("building_area_sqft").crossChecks![0]).toMatchObject({ result: "agrees", detail: expect.stringContaining("471,558 sq ft over 4 stories") });
    expect(value("feeder").crossChecks!.find((check) => check.label.startsWith("05_01_27W2"))).toMatchObject({ result: "agrees", detail: expect.stringContaining("13.8 kV across 3 layers") });
    expect(value("road_side").crossChecks![0]!.result).toBe("agrees");
  });

  it("matches a hand count of agreed, disagreed, and unchecked on recorded data", async () => {
    // Worcester: lot size disagrees; building area, roofprint age, road side, the utility, and four feeders agree;
    // elevation has no second source.
    expect(crossCheckCounts((await checked("100 Research Dr, Worcester, MA")).values)).toEqual({ agrees: 8, disagrees: 1, not_checked: 1 });
  });

  it("records a failed source as not checked, never as agreeing", async () => {
    const utilityDown: FetchLike = async (url, init) => (url.includes("nationalgrid") ? new Response("down", { status: 503 }) : recorded(url, init));
    const { value } = await checked("100 Research Dr, Worcester, MA", utilityDown);
    expect(value("serving_utility").crossChecks!.map((check) => check.result)).toEqual(["not_checked"]);
    expect(value("feeder").crossChecks!.map((check) => check.result)).toEqual(["not_checked"]);
    expect(value("ground_elevation_ft").crossChecks![0]!.result).toBe("not_checked");
  });

  it("calls out old roofprints against newer imagery", async () => {
    const { value } = await checked("11 Bartzak Dr, Holliston, MA");
    expect(value("building_outline").crossChecks![0]).toMatchObject({ result: "disagrees", detail: expect.stringContaining("Roofprints from 2011, imagery from 2025") });
  });
});
