import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { californiaPge, massachusetts, type CollectContext, type FetchLike, type RegionConfig } from "../index.ts";
import { collectSite } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";
import type { TerritorySource } from "../registry.ts";
import { likelyServing } from "./energy.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));

async function collect(address: string, fetch: FetchLike = recorded, region: RegionConfig = massachusetts) {
  const ctx: CollectContext = { siteId: "test-site", fetch, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0 };
  const resolved = await resolveSite(address, region, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, region, resolved.anchor, ctx);
  const values = deriveValues(collection.observations);
  return { collection, value: (field: string): Value => values.find((entry) => entry.field === field)! };
}

const names = (value: Value) => value.candidates?.map((candidate) => (candidate.value?.type === "text" ? candidate.value.value : "")).sort();

describe("the serving utility", () => {
  it("settles Worcester on National Grid, through its territory and the feeder its map returned", async () => {
    const { value } = await collect("100 Research Dr, Worcester, MA");
    expect(value("serving_utility")).toMatchObject({ state: "inferred", current: { type: "text", value: "National Grid" } });
    expect(value("serving_utility").flags.join(" ")).toContain("MASSACHUSETTS ELECTRIC CO");
    expect(value("utility_territories").current).toMatchObject({ type: "text", value: expect.stringContaining("Unitil") });
  });

  it("names Eversource at Holliston, and lists the sparse overlapping territories as unlikely", async () => {
    const { value } = await collect("11 Bartzak Dr, Holliston, MA");
    expect(value("serving_utility")).toMatchObject({ state: "inferred", current: { type: "text", value: "Eversource" } });
    expect(value("serving_utility").flags.join(" ")).toContain("unlikely here: MASSACHUSETTS BAY TRANS AUTHORITY, Unitil (FITCHBURG GAS & ELEC LIGHT CO)");
    expect(value("utility_territories").current).toEqual({ type: "text", value: "Eversource (NSTAR ELECTRIC COMPANY); MASSACHUSETTS BAY TRANS AUTHORITY; Unitil (FITCHBURG GAS & ELEC LIGHT CO)" });
  });

  it("names Eversource in Hyannis, and says why it has no feeder, with no request to Eversource", async () => {
    const urls: string[] = [];
    const watched: FetchLike = (url, init) => {
      urls.push(url);
      return recorded(url, init);
    };
    const { value } = await collect("367 Main St, Hyannis, MA", watched);
    expect(value("serving_utility")).toMatchObject({ state: "inferred", current: { type: "text", value: "Eversource" } });
    expect(value("feeder").state).toBe("missing");
    expect(value("feeder").reason).toContain("its terms bar reuse");
    expect(urls.some((url) => /eversource|envelio/i.test(url))).toBe(false);
  });

  it("settles Fremont on PG&E, whose legal name carries a trailing period", async () => {
    const { value } = await collect("47200 Bayside Pkwy, Fremont, CA", recorded, californiaPge);
    expect(value("serving_utility")).toMatchObject({ state: "inferred", current: { type: "text", value: "PG&E" } });
  });

  it("leaves territories missing with the reason when that service fails, and still names the utility from the feeder", async () => {
    const down: FetchLike = async (url, init) => (url.includes("Electric_Retail_Service_Territories") ? new Response("{}", { status: 503 }) : recorded(url, init));
    const { value } = await collect("100 Research Dr, Worcester, MA", down);
    expect(value("utility_territories").state).toBe("missing");
    expect(value("serving_utility").current).toEqual({ type: "text", value: "National Grid" });
  });
});

describe("the feeder search", () => {
  it("widens downtown, where nothing is mapped within 30 m, and says so on the feeder", async () => {
    const { value } = await collect("455 Main St, Worcester, MA");
    expect(value("feeder")).toMatchObject({ state: "inferred", current: { type: "text", value: "05_01_3J341" } });
    expect(value("feeder").flags.join(" ")).toContain("Nothing is mapped within 30 m of the site, so the search reached 150 m");
    // A line that far off doesn't settle the utility; the territories' customer density does.
    expect(value("serving_utility")).toMatchObject({ state: "inferred", current: { type: "text", value: "National Grid" } });
    expect(value("serving_utility").flags.join(" ")).toContain("The main service territory mapped here");
  });

  it("names the searched distance when even the wider search finds nothing", async () => {
    const empty: FetchLike = async (url, init) => (url.includes("nationalgrid") ? new Response(JSON.stringify({ features: [] })) : recorded(url, init));
    const { value } = await collect("100 Research Dr, Worcester, MA", empty);
    expect(value("feeder").state).toBe("missing");
    expect(value("feeder").reason).toContain("National Grid's map shows no feeder within 150 m of this site.");
    expect(value("serving_utility")).toMatchObject({ state: "inferred", current: { type: "text", value: "National Grid" } });
  });
});

describe("ranking overlapping territories", () => {
  const territory = (utility: string, customers: number, area: number) => ({ legalName: utility, utility, feature: { objectId: utility, attributes: { CUSTOMERS: customers, AREA: area }, geometry: null } });
  const source = { customersAttribute: "CUSTOMERS", areaAttribute: "AREA" } as unknown as TerritorySource;

  it("keeps territories within a tenth of the densest, and drops a sparse oversized polygon", () => {
    const kept = likelyServing(source, [territory("Big", 1_500_000, 9_000), territory("Muni", 9_000, 60), territory("Oversized", 30_000, 6_000)] as never);
    expect(kept.map((entry) => entry.utility)).toEqual(["Big", "Muni"]);
  });

  it("keeps every territory when none has a customer count", () => {
    expect(likelyServing({} as TerritorySource, [territory("A", 1, 1), territory("B", 1, 1000)] as never)).toHaveLength(2);
  });
});
