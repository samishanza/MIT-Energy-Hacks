import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ObservationSchema } from "@eqore/contract";
import { REGIONS, massachusetts, californiaPge } from "./index.ts";
import { queryArcgis, toObservations, type CollectContext, type FetchLike } from "./arcgis.ts";
import { collectSite } from "./collect.ts";
import { deriveValues } from "./derive.ts";
import { fixtureFetch } from "./fixtures.ts";
import type { ArcgisEntry } from "./registry.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (fetch: FetchLike = recorded): CollectContext => ({ siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z" });

const parcels = massachusetts.parcels!.entry;
// The stored time of the recording this test replays.
const recordedAt = JSON.parse(readFileSync(join(dir("arcgis"), "worcester-100-research-dr-71d700b1bd868958.json"), "utf8")).retrievedAt as string;
const grid = massachusetts.grid[0]!.entry;
const WORCESTER = "SITE_ADDR='100 RESEARCH DR' AND CITY='WORCESTER'";

async function worcesterParcel() {
  const result = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, context());
  return result.features[0]!.geometry as Extract<NonNullable<(typeof result.features)[0]["geometry"]>, { type: "Polygon" | "MultiPolygon" }>;
}

describe("the ArcGIS REST adapter", () => {
  it("reads a parcel from a recorded point query, with source, retrieval date, and source date", async () => {
    const result = await queryArcgis(parcels, { kind: "point", longitude: -71.7694444626631, latitude: 42.27614096601859 }, context());
    const observations = toObservations(result, context());
    const parcelId = observations.find((observation) => observation.field === "parcel_id")!;

    expect(parcelId.value).toEqual({ type: "text", value: "F_583026_2925576" });
    expect(parcelId.source.name).toBe("MassGIS L3 property tax parcels");
    expect(parcelId.sourceDate).toBe("FY2026");
    // The recording's own date, not the time of this replay.
    expect(parcelId.retrievedAt).toBe(recordedAt);
    expect(result.features[0]!.geometry?.type).toMatch(/Polygon/);
    for (const observation of observations) expect(() => ObservationSchema.parse(observation)).not.toThrow();
  });

  it("runs an attribute filter and a polygon query through the same adapter", async () => {
    const byAttribute = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, context());
    expect(byAttribute.features).toHaveLength(1);

    const byPolygon = await queryArcgis(massachusetts.buildings!.entry, { kind: "polygon", geometry: await worcesterParcel() }, context());
    expect(byPolygon.features).toHaveLength(6);
    expect(byPolygon.query).toMatch(/^polygon [0-9a-f]{16}, buffer 0 m$/);
  });

  it("normalizes recorded MassGIS, National Grid, and PG&E responses the same way", async () => {
    const national = await queryArcgis(grid, { kind: "polygon", geometry: await worcesterParcel(), bufferMeters: 30 }, context());
    const pge = await queryArcgis(californiaPge.grid[0]!.entry, { kind: "point", longitude: -121.937034213974, latitude: 37.475654718793, bufferMeters: 100 }, context());
    for (const result of [national, pge]) {
      expect(result.run.status).toBe("done");
      const observations = toObservations(result, context());
      expect(observations.some((observation) => observation.field === "feeder" && observation.kind === "reading")).toBe(true);
      expect(observations[0]!.locator.query).toContain("buffer");
    }
  });

  it("never queries a barred entry and offers it only as a route for a person", async () => {
    const barred: ArcgisEntry = { ...parcels, barred: { reason: "robots.txt bars automated access", personRoute: "A person searches the portal" } };
    let requests = 0;
    const counting: FetchLike = async () => {
      requests += 1;
      return new Response("{}");
    };
    const result = await queryArcgis(barred, { kind: "attribute", where: WORCESTER }, context(counting));
    expect(requests).toBe(0);
    expect(result.run).toMatchObject({ status: "person_only", reason: "robots.txt bars automated access" });
  });

  it("stores an empty result as missing with the query recorded, not as none", async () => {
    const empty: FetchLike = async () => new Response(JSON.stringify({ features: [] }));
    const result = await queryArcgis(grid, { kind: "point", longitude: -71, latitude: 42, bufferMeters: 30 }, context(empty));
    const observations = toObservations(result, context(empty));
    const feeder = observations.find((observation) => observation.field === "feeder")!;

    expect(feeder.kind).toBe("no_value");
    expect(feeder.value).toBeNull();
    expect(feeder.locator.query).toBe("point -71,42, buffer 30 m");
    const value = deriveValues(observations).find((entry) => entry.field === "feeder")!;
    expect(value.state).toBe("missing");
    expect(value.current).toBeNull();
  });

  it("records a service error as missing with the reason, and the other sources still run", async () => {
    const utilityDown: FetchLike = async (url, init) =>
      url.includes("systemdataportal") ? new Response("down", { status: 503 }) : recorded(url, init);
    const ctx = context(utilityDown);
    const lookup = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, ctx);
    const collection = await collectSite("100 Research Dr, Worcester, MA", massachusetts, { kind: "parcel", parcel: lookup.features[0]!, lookup }, ctx);

    const utility = collection.sourceRuns.find((run) => run.sourceId === grid.id)!;
    expect(utility.status).toBe("missing");
    expect(utility.reason).toContain("HTTP 503");
    expect(collection.sourceRuns.find((run) => run.sourceId === "massgis-roofprints")!.status).toBe("done");
    const values = deriveValues(collection.observations);
    expect(values.find((value) => value.field === "feeder")!.reason).toContain("HTTP 503");
    expect(values.find((value) => value.field === "parcel_id")!.state).toBe("inferred");
  });

  it("retries an error body, then succeeds, and reports it with the reason if it never clears", async () => {
    let calls = 0;
    const flaky: FetchLike = async () => {
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? { error: { message: "Invalid query parameters." } } : { features: [{ attributes: { LOC_ID: "P-1" } }] }));
    };
    const recovered = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, { ...context(flaky), retryDelayMs: 0 });
    expect(recovered.features).toHaveLength(1);

    const down: FetchLike = async () => new Response(JSON.stringify({ error: { message: "Invalid query parameters." } }));
    const failed = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, { ...context(down), retryDelayMs: 0 });
    expect(failed.run).toMatchObject({ status: "missing", reason: "The service returned an error: Invalid query parameters." });
  });

  it("retries a timeout, then reports it with the reason if it never clears", async () => {
    const timeout = () => Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    let calls = 0;
    const slowOnce: FetchLike = async () => {
      calls += 1;
      if (calls === 1) throw timeout();
      return new Response(JSON.stringify({ features: [{ attributes: { LOC_ID: "P-1" } }] }));
    };
    const recovered = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, { ...context(slowOnce), retryDelayMs: 0 });
    expect(recovered.features).toHaveLength(1);

    const alwaysSlow: FetchLike = async () => {
      throw timeout();
    };
    const failed = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, { ...context(alwaysSlow), retryDelayMs: 0 });
    expect(failed.run).toMatchObject({ status: "missing", reason: "The service didn't answer within 70 seconds" });

    // A network failure isn't a slow answer, so it reports at once.
    let networkCalls = 0;
    const offline: FetchLike = async () => {
      networkCalls += 1;
      throw new Error("getaddrinfo ENOTFOUND");
    };
    const unreachable = await queryArcgis(parcels, { kind: "attribute", where: WORCESTER }, { ...context(offline), retryDelayMs: 0 });
    expect(networkCalls).toBe(1);
    expect(unreachable.run.reason).toContain("could not be reached");
  });

  it("works with a new entry that uses the same adapter, with no code change", async () => {
    const entry: ArcgisEntry = {
      kind: "arcgis_rest",
      id: "test-county-parcels",
      name: "SYNTHETIC TEST county parcels",
      serviceUrl: "https://example.invalid/arcgis/rest/services/Parcels/FeatureServer",
      layer: 7,
      searchRadiusMeters: 0,
      licenseNote: "Test entry",
      robotsChecked: "2026-11-07",
      objectIdAttribute: "APN",
      sourceDate: { fixed: "2026" },
      outFields: ["APN", "ACRES"],
      fields: [
        { field: "parcel_id", attribute: "APN", type: "text", grade: "reference" },
        { field: "lot_size_acres", attribute: "ACRES", type: "quantity", unit: "acre", grade: "reference" },
      ],
    };
    let requested = "";
    const stub: FetchLike = async (url) => {
      requested = url;
      return new Response(JSON.stringify({ features: [{ attributes: { APN: "A-1", ACRES: 2 } }] }));
    };
    const result = await queryArcgis(entry, { kind: "point", longitude: -122, latitude: 37 }, context(stub));
    const [parcelId, lotSize] = toObservations(result, context(stub));

    expect(requested).toBe("https://example.invalid/arcgis/rest/services/Parcels/FeatureServer/7/query");
    expect(parcelId!.value).toEqual({ type: "text", value: "A-1" });
    expect(lotSize!.value).toEqual({ type: "quantity", value: 2, unit: "acre" });
    expect(lotSize!.sourceDate).toBe("2026");
  });

  it("lists the regions it was configured with", () => {
    expect(REGIONS.map((region) => region.id)).toEqual(["massachusetts", "california-pge"]);
  });
});
