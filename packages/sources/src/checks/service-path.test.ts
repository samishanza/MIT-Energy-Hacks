import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Value } from "@eqore/contract";
import { massachusetts, type CollectContext } from "../index.ts";
import { collectSite } from "../collect.ts";
import { deriveValues } from "../derive.ts";
import { fixtureFetch } from "../fixtures.ts";
import { resolveSite } from "../resolve-site.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));

async function collect(address: string) {
  const ctx: CollectContext = { siteId: "test-site", fetch: recorded, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0 };
  const resolved = await resolveSite(address, massachusetts, ctx);
  if (resolved.status !== "resolved") throw new Error(`Expected one match for ${address}`);
  const collection = await collectSite(address, massachusetts, resolved.anchor, ctx);
  const values = deriveValues(collection.observations);
  return { collection, value: (field: string): Value => values.find((entry) => entry.field === field)! };
}

describe("how the building is likely fed", () => {
  it("traces Worcester's service from the nearest mapped line to the nearest wall, labeled as inferred", async () => {
    const { collection, value } = await collect("100 Research Dr, Worcester, MA");
    expect(value("grid_service_path")).toMatchObject({
      state: "inferred",
      method: "computed",
      current: { type: "text", value: "Likely fed from 05_01_27W3 (3-phase underground), the nearest mapped line, about 93 ft from the building's south side" },
    });
    expect(value("grid_service_path").flags.join(" ")).toContain("not field verified");
    const inferred = collection.features.filter((feature) => feature.attributes?.basis);
    expect(inferred.map((feature) => (feature.attributes!.equipment_type as { value: string }).value).sort()).toEqual(["service_entrance", "service_path", "service_tap"]);
    for (const feature of inferred) {
      expect(feature.label).toMatch(/^\(E\) SERVICE (FROM|TAP ON|ENTRANCE)/);
      expect(feature.label).not.toMatch(/LIKELY|INFERRED|VERIFIED/);
      expect(feature.attributes).toMatchObject({ basis: { value: "inferred" }, confidence_reason: { type: "text" } });
    }
    expect((inferred.find((feature) => feature.id === "service-tap")!.attributes!.confidence_reason as { value: string }).value).toContain("pad-mounted transformer");
  });

  it("says why when no mapped line is near, as at an Eversource site", async () => {
    const { collection, value } = await collect("11 Bartzak Dr, Holliston, MA");
    expect(value("grid_service_path")).toMatchObject({ state: "missing", reason: expect.stringContaining("No mapped distribution line was found near the building") });
    expect(collection.features.filter((feature) => feature.attributes?.basis)).toEqual([]);
  });
});
