import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { californiaPge, massachusetts, type CollectContext, type FetchLike, type RegionConfig } from "../index.ts";
import { collectSite } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";

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

  it("lists every overlapping territory at Holliston and asserts none", async () => {
    const { value } = await collect("11 Bartzak Dr, Holliston, MA");
    expect(value("serving_utility")).toMatchObject({ state: "conflicting", conflictKind: "listed_candidates", current: null });
    expect(names(value("serving_utility"))).toEqual(["Eversource", "MASSACHUSETTS BAY TRANS AUTHORITY", "Unitil"]);
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
    // A line that far off doesn't settle which utility serves the site.
    expect(value("serving_utility")).toMatchObject({ state: "conflicting", current: null });
    expect(names(value("serving_utility"))).toEqual(["National Grid", "Unitil"]);
  });

  it("names the searched distance when even the wider search finds nothing", async () => {
    const empty: FetchLike = async (url, init) => (url.includes("nationalgrid") ? new Response(JSON.stringify({ features: [] })) : recorded(url, init));
    const { value } = await collect("100 Research Dr, Worcester, MA", empty);
    expect(value("feeder").state).toBe("missing");
    expect(value("feeder").reason).toContain("National Grid's map shows no feeder within 150 m of this site.");
    expect(value("serving_utility").state).toBe("conflicting");
  });
});
