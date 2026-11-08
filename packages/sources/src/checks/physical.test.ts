import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { californiaPge, massachusetts, type CollectContext, type FetchLike } from "../index.ts";
import { collectSite, siteIdFor } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (fetch: FetchLike = recorded): CollectContext => ({ siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z" });

async function physicalValues(address: string, region = massachusetts, fetch: FetchLike = recorded) {
  const ctx = context(fetch);
  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, region, resolved.anchor, ctx);
  const values = deriveValues(collection.observations);
  const value = (field: string): Value => values.find((entry) => entry.field === field)!;
  return { collection, value };
}

// A stand-in parcel service, for lot sizes and addresses no recording covers.
function parcelService(features: unknown[]): FetchLike {
  return async (url, init) =>
    url.includes("Massachusetts_Property_Tax_Parcels") ? new Response(JSON.stringify({ features })) : recorded(url, init);
}

// About 7.0 acres: a square of 168.3 m on each side, near latitude 42.
const SQUARE = [[[-71.8, 42.26], [-71.8, 42.261516], [-71.797962, 42.261516], [-71.797962, 42.26], [-71.8, 42.26]]];
const parcel = (attributes: Record<string, unknown>) => ({
  attributes: { LOC_ID: "P-1", SITE_ADDR: "1 TEST WAY", CITY: "WORCESTER", USE_DESC: "Test parcel", LOT_UNITS: "Acres", BLD_AREA: 1000, ...attributes },
  geometry: { rings: SQUARE },
});

describe("site resolution when a lookup can't anchor the site", () => {
  const census = (matches: { x: number; y: number; matchedAddress: string }[]) =>
    new Response(JSON.stringify({ result: { addressMatches: matches.map(({ x, y, matchedAddress }) => ({ matchedAddress, coordinates: { x, y } })) } }));
  const parcelsDown: (geocoder: () => Response | Promise<Response>) => FetchLike = (geocoder) => async (url) =>
    url.includes("geocoding.geo.census.gov") ? geocoder() : new Response(JSON.stringify({ error: { message: "Invalid query parameters." } }));
  const fast = (fetch: FetchLike): CollectContext => ({ ...context(fetch), retryDelayMs: 0 });

  it("falls back to a labeled Census point when the parcel service fails, and keeps the failure", async () => {
    const resolved = await resolveSite("1 Test Way, Worcester, MA", massachusetts, fast(parcelsDown(() => census([{ x: -71.8, y: 42.26, matchedAddress: "1 TEST WAY" }]))));
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "point") throw new Error("Expected a point anchor");
    expect(resolved.anchor.method).toBe("geocoded_interpolated");
    expect(resolved.anchor.parcelLookup?.failure).toContain("Invalid query parameters");
  });

  it("lists several geocoder matches, then settles on the chosen one", async () => {
    const two = () => census([{ x: -122, y: 37, matchedAddress: "A" }, { x: -122.1, y: 37.1, matchedAddress: "B" }]);
    const fetch: FetchLike = async () => two();
    const listed = await resolveSite("1 Test Way, Fremont, CA", californiaPge, context(fetch));
    if (listed.status !== "needs_choice") throw new Error("Expected a choice");
    expect(listed.candidates.map((candidate) => candidate.id)).toEqual(["geocoder:-122,37", "geocoder:-122.1,37.1"]);

    const chosen = await resolveSite("1 Test Way, Fremont, CA", californiaPge, context(fetch), { kind: "candidate", candidateId: "geocoder:-122.1,37.1" });
    expect(chosen).toMatchObject({ status: "resolved", anchor: { kind: "point", longitude: -122.1, latitude: 37.1 } });
  });

  it("offers a pin when the geocoder fails too", async () => {
    const httpError = await resolveSite("1 Test Way, Worcester, MA", massachusetts, fast(parcelsDown(() => new Response("down", { status: 503 }))));
    expect(httpError).toEqual({ status: "needs_choice", candidates: [] });
    const unreachable = await resolveSite("1 Test Way, Worcester, MA", massachusetts, fast(parcelsDown(() => { throw new Error("offline"); })));
    expect(unreachable).toEqual({ status: "needs_choice", candidates: [] });
  });

  it("anchors on the parcel under a pin, keeping the pin as the location", async () => {
    const ctx = context(parcelService([parcel({ LOT_SIZE: 7.1 })]));
    const pinned = await resolveSite("1 Test Way, Worcester, MA", massachusetts, ctx, { kind: "pin", latitude: 42.2605, longitude: -71.799 });
    if (pinned.status !== "resolved") throw new Error("A pin always resolves");
    const collection = await collectSite("1 Test Way, Worcester, MA", massachusetts, pinned.anchor, ctx);
    expect(pinned.anchor.kind).toBe("parcel");
    expect(collection.site).toMatchObject({ location: [-71.799, 42.2605], locationMethod: "hand_placed" });
    expect(collection.features.some((feature) => feature.kind === "property_line")).toBe(true);
  });

  it("uses a Census point rather than an invented location when a parcel has no polygon", async () => {
    const noShape: FetchLike = async (url) =>
      url.includes("geocoding.geo.census.gov")
        ? census([{ x: -71.8, y: 42.26, matchedAddress: "1 TEST WAY" }])
        : url.includes("Massachusetts_Property_Tax_Parcels")
          ? new Response(JSON.stringify({ features: [{ attributes: { LOC_ID: "P-1", SITE_ADDR: "1 TEST WAY", CITY: "WORCESTER" } }] }))
          : new Response(JSON.stringify({ features: [] }));
    const ctx = context(noShape);
    const resolved = await resolveSite("1 Test Way, Worcester, MA", massachusetts, ctx);
    if (resolved.status !== "resolved") throw new Error("Expected a Census point");
    const collection = await collectSite("1 Test Way, Worcester, MA", massachusetts, resolved.anchor, ctx);
    expect(collection.site).toMatchObject({ location: [-71.8, 42.26], locationMethod: "geocoded_interpolated" });
    expect(collection.sourceRuns.find((run) => run.sourceId === "massgis-l3-parcels")!.reason).toContain("no polygon");
    expect(deriveValues(collection.observations).find((value) => value.field === "parcel_id")!.reason).toContain("no polygon");
  });
});

describe("site identity", () => {
  it("gives spellings of one address the same site", () => {
    expect(siteIdFor("100 Research Drive, Worcester, MA 01605")).toBe("100-research-dr-worcester-ma");
    expect(siteIdFor("100 research dr., worcester, ma")).toBe("100-research-dr-worcester-ma");
    // Only the street type is shortened, so a street named Court keeps its name.
    expect(siteIdFor("12 Court St, Worcester, MA")).toBe("12-court-st-worcester-ma");
  });
});

describe("physical collection", () => {
  it("shows 11 Bartzak Dr's zero building area as missing and its lot size as conflicting with both values", async () => {
    const { value } = await physicalValues("11 Bartzak Dr, Holliston, MA");

    expect(value("building_area_sqft").state).toBe("missing");
    expect(value("building_area_sqft").reason).toContain("BLD_AREA is 0");

    const lotSize = value("lot_size_acres");
    expect(lotSize.state).toBe("conflicting");
    expect(lotSize.conflictKind).toBe("source_disagreement");
    const sizes = lotSize.candidates.map((candidate) => (candidate.value.type === "quantity" ? candidate.value.value : null));
    expect(sizes[0]).toBe(7.339);
    expect(sizes[1]).toBeCloseTo(6.96, 1);
  });

  it("keeps a single inferred lot size when the two are within tolerance", async () => {
    const { value } = await physicalValues("1 Test Way, Worcester, MA", massachusetts, parcelService([parcel({ LOT_SIZE: 7.1 })]));
    const lotSize = value("lot_size_acres");
    expect(lotSize.state).toBe("inferred");
    expect(lotSize.current).toEqual({ type: "quantity", value: 7.1, unit: "acre" });
  });

  it("gives a 2011 roofprint that source date and reference grade", async () => {
    const { collection, value } = await physicalValues("11 Bartzak Dr, Holliston, MA");
    const outline = collection.observations.find((observation) => observation.field === "building_outline")!;
    expect(outline.sourceDate).toBe("2011");
    expect(outline.grade).toBe("reference");
    expect(value("building_outline").grade).toBe("reference");
    expect(collection.features.some((feature) => feature.kind === "building_outline")).toBe(true);
  });

  it("flags a roofprint older than the building it outlines", async () => {
    const roofprints: FetchLike = async (url, init) => {
      if (url.includes("Massachusetts_Property_Tax_Parcels")) return new Response(JSON.stringify({ features: [parcel({ LOT_SIZE: 7.1, YEAR_BUILT: 2020 })] }));
      if (url.includes("Building_Structures")) {
        const small = [[[-71.7995, 42.2605], [-71.7995, 42.2607], [-71.7992, 42.2607], [-71.7992, 42.2605], [-71.7995, 42.2605]]];
        return new Response(JSON.stringify({ features: [{ attributes: { STRUCT_ID: "S-1", SOURCEDATE: 20110000 }, geometry: { rings: small } }] }));
      }
      return recorded(url, init);
    };
    const { value } = await physicalValues("1 Test Way, Worcester, MA", massachusetts, roofprints);
    expect(value("building_outline").flags.join(" ")).toContain("before the 2020 year built");
  });

  it("anchors on the parcel found by address, because the Census point misses it", async () => {
    let geocoderCalls = 0;
    const counting: FetchLike = async (url, init) => {
      if (url.includes("geocoding.geo.census.gov")) geocoderCalls += 1;
      return recorded(url, init);
    };
    const resolved = await resolveSite("11 Bartzak Drive, Holliston, MA", massachusetts, context(counting));

    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "parcel") throw new Error("Expected a parcel anchor");
    expect(resolved.anchor.parcel.objectId).toBe("M_206064_886636");
    // One geocode for the fast location search, which misses here, so the address search decides.
    expect(geocoderCalls).toBe(1);
  });

  it("lists every candidate and stores no site values when an address matches several parcels", async () => {
    const two = parcelService([parcel({ LOC_ID: "P-1" }), parcel({ LOC_ID: "P-2" })]);
    const resolved = await resolveSite("1 Test Way, Worcester, MA", massachusetts, context(two));
    expect(resolved).toMatchObject({ status: "needs_choice" });
    if (resolved.status === "needs_choice") expect(resolved.candidates.map((candidate) => candidate.id)).toEqual(["P-1", "P-2"]);
  });

  it("settles on the chosen candidate once the engineer picks one", async () => {
    // The stand-in answers like the real service: a filter on one parcel ID returns only that parcel.
    const byId: FetchLike = async (url, init) => {
      const where = new URLSearchParams(String(init?.body)).get("where");
      const features = [parcel({ LOC_ID: "P-1" }), parcel({ LOC_ID: "P-2" })].filter((feature) => where === `LOC_ID='${feature.attributes.LOC_ID}'`);
      return parcelService(features)(url, init);
    };
    const resolved = await resolveSite("1 Test Way, Worcester, MA", massachusetts, context(byId), { kind: "candidate", candidateId: "P-2" });
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "parcel") throw new Error("Expected a parcel anchor");
    expect(resolved.anchor.parcel.objectId).toBe("P-2");
  });

  it("offers a map pin when an address has no match, and records that method", async () => {
    const none = parcelService([]);
    const unmatched = await resolveSite("999 Nowhere Rd, Worcester, MA", massachusetts, context(none));
    expect(unmatched).toEqual({ status: "needs_choice", candidates: [] });

    const ctx = context(none);
    const pinned = await resolveSite("999 Nowhere Rd, Worcester, MA", massachusetts, ctx, { kind: "pin", latitude: 42.27, longitude: -71.8 });
    if (pinned.status !== "resolved") throw new Error("A pin always resolves");
    const collection = await collectSite("999 Nowhere Rd, Worcester, MA", massachusetts, pinned.anchor, ctx);
    expect(collection.site.locationMethod).toBe("hand_placed");
    const location = deriveValues(collection.observations).find((value) => value.field === "site_location")!;
    expect(location).toMatchObject({ state: "inferred", method: "hand_placed" });
  });

  it("records a Fremont site's parcel and outline as missing, with a person route", async () => {
    const { collection, value } = await physicalValues("47200 Bayside Pkwy, Fremont, CA", californiaPge);
    expect(value("parcel_id").state).toBe("missing");
    expect(value("building_outline").state).toBe("missing");
    expect(value("parcel_id").reason).toContain("A person looks this up");
    expect(collection.sourceRuns.find((run) => run.sourceId === "alameda-county-assessor")!.status).toBe("person_only");
    expect(collection.site.locationMethod).toBe("geocoded_interpolated");
    expect(value("site_location").flags.join(" ")).toContain("interpolated");
  });
});

describe("finding the parcel quickly", () => {
  it("takes the parcel around the geocoded point whose assessor address matches, without the slow address search", async () => {
    const searched: string[] = [];
    const fetch: FetchLike = async (url, init) => {
      if (url.includes("geocoding.geo.census.gov")) {
        return new Response(JSON.stringify({ result: { addressMatches: [{ matchedAddress: "1 TEST WAY, WORCESTER, MA, 01605", coordinates: { x: -71.8, y: 42.27 } }] } }), { status: 200 });
      }
      const body = new URLSearchParams(String(init?.body ?? new URL(url).search));
      searched.push(body.get("geometry") ? "location" : "address");
      return parcelService([parcel({ LOC_ID: "P-NEXT", SITE_ADDR: "3 TEST WAY" }), parcel({ LOC_ID: "P-1", SITE_ADDR: "1 TEST WAY" })])(url, init);
    };
    const resolved = await resolveSite("1 Test Way, Worcester, MA", massachusetts, context(fetch));
    if (resolved.status !== "resolved" || resolved.anchor.kind !== "parcel") throw new Error("Expected a parcel anchor");
    expect(resolved.anchor.parcel.objectId).toBe("P-1");
    expect(searched).toEqual(["location"]);
  });
});
