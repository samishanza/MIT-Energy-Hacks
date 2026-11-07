import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { massachusetts, type CollectContext, type FetchLike } from "./index.ts";
import { fixtureFetch } from "./fixtures.ts";
import { resolveSite } from "./resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (fetch: FetchLike = recorded): CollectContext => ({ siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0 });

describe("resolving an address the assessor wrote differently", () => {
  it("finds a Hyannis address among its town's parcels, filed under Barnstable", async () => {
    const resolved = await resolveSite("367 Main St, Hyannis, MA", massachusetts, context());
    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "parcel") throw new Error("Expected a parcel");
    expect(resolved.anchor.parcel.attributes).toMatchObject({ CITY: "BARNSTABLE", SITE_ADDR: "367 MAIN STREET (HYANNIS), HYANNIS" });
  });

  it("offers the parcels near the geocoded point and the point itself when no parcel carries the house number", async () => {
    const resolved = await resolveSite("36 Court St, Springfield, MA", massachusetts, context());
    if (resolved.status !== "needs_choice") throw new Error("Expected a choice");
    expect(resolved.candidates.map((candidate) => candidate.id)).toEqual(["F_360412_2863477", "F_360324_2863780", "geocoder:-72.589724213405,42.100909903336"]);
    expect(resolved.candidates.at(-1)!.label).toContain("with no parcel");
  });

  it("offers a parcel by house number and street when the geocoder has no match", async () => {
    const resolved = await resolveSite("1 Government Ctr, Fall River, MA", massachusetts, context());
    expect(resolved).toEqual({
      status: "needs_choice",
      candidates: [{ id: "F_750479_2716232", label: expect.stringContaining("1 GOVERNMENT CEN TER, FALL RIVER"), source: "MassGIS L3 property tax parcels" }],
    });
  });

  it("returns an empty choice only when nothing matches anywhere, which the app answers with a pin", async () => {
    const nothing: FetchLike = async (url) => new Response(JSON.stringify(url.includes("geocoder") ? { result: { addressMatches: [] } } : { features: [] }));
    expect(await resolveSite("999 Nowhere Rd, Worcester, MA", massachusetts, context(nothing))).toEqual({ status: "needs_choice", candidates: [] });
  });

  it("anchors a pin on the parcel under it", async () => {
    const resolved = await resolveSite("100 Research Dr, Worcester, MA", massachusetts, context(), { kind: "pin", longitude: -71.7694444626631, latitude: 42.27614096601859 });
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "parcel") throw new Error("Expected a parcel");
    expect(resolved.anchor.parcel.attributes.SITE_ADDR).toBe("100 RESEARCH DR");
    expect(resolved.anchor.pin).toEqual({ longitude: -71.7694444626631, latitude: 42.27614096601859 });
  });
});
