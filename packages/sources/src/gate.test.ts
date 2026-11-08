// The collection path, held to the same admission control the agent path faces.
//
// This lives in packages/sources because it is about guarding what this package
// produces. The gate itself has no dependency on this package — it takes the field
// mapping as an argument.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gateObservations } from "@eqore/gatekeeper";
import type { Observation } from "@eqore/contract";
import { CATALOG_ROUTES } from "./catalog-map.ts";
import { collectSite } from "./collect.ts";
import { fixtureFetch } from "./fixtures.ts";
import { massachusetts } from "../config/massachusetts.ts";
import { resolveSite } from "./resolve-site.ts";
import type { CollectContext, FetchLike } from "./arcgis.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir("arcgis"), dir("geocoder"));
const context = (fetch: FetchLike = recorded): CollectContext => ({
  siteId: "gate-test",
  fetch,
  now: () => "2026-11-07T20:00:00.000Z",
});

/** Contract field name -> catalog key, inverted from the route table. */
const KEY_FOR_FIELD = new Map(CATALOG_ROUTES.map((route) => [route.field, route.key]));
const keyForField = (field: string) => KEY_FOR_FIELD.get(field);

async function collected(address: string): Promise<Observation[]> {
  const ctx = context();
  const resolved = await resolveSite(address, massachusetts, ctx);
  if (resolved.status !== "resolved") throw new Error(`no single match for ${address}`);
  return (await collectSite(address, massachusetts, resolved.anchor, ctx)).observations;
}

const HOLLISTON = "11 Bartzak Dr, Holliston, MA";

describe("the gate on the collection path", () => {
  it("admits what the collectors legitimately produce", async () => {
    const result = gateObservations(await collected(HOLLISTON), { keyForField });
    expect(result.admitted.length).toBeGreaterThan(0);

    const detail = result.rejected.map((v) => `${v.key}: ${v.rejection?.reasons.join("; ")}`);
    expect(detail, "real collected data was refused").toEqual([]);
  });

  it("reports fields outside the plan-set catalog rather than refusing them", async () => {
    // The collectors answer questions the catalog does not ask — wetlands, road surface,
    // roofprint coverage. Refusing those would be the gate overreaching; it is not its job
    // to decide what else is worth collecting.
    const result = gateObservations(await collected(HOLLISTON), { keyForField });
    for (const v of result.unmapped) expect(v.status).toBe("unmapped");
    expect(result.rejected.every((v) => v.key !== undefined)).toBe(true);
  });

  it("refuses a bus rating no switchgear ships in, whichever path it arrives by", async () => {
    // The point of this whole file. Before the gate was on this path, an agent proposing
    // 1750 A was refused and a collector producing it was accepted.
    const fake: Observation = {
      id: "o1",
      siteId: "gate-test",
      field: "bus_rating",
      kind: "reading",
      value: { type: "quantity", value: 1750, unit: "A" },
      source: { id: "massgis", name: "A public layer", kind: "arcgis_rest", dataOrigin: "real" },
      retrievedAt: "2026-11-07T20:00:00.000Z",
      sourceDate: null,
      method: "source_read",
      locator: {},
      identity: { sourceId: "massgis", query: "q", contentHash: "h" },
      grade: "reference",
      synthetic: false,
    };
    const result = gateObservations([fake], { keyForField });
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.rejection?.codes).toContain("not_standard_value");
  });

  it("refuses a peak demand the service cannot deliver", async () => {
    const observation = (field: string, value: number, unit: string): Observation => ({
      id: `o-${field}`,
      siteId: "gate-test",
      field,
      kind: "reading",
      value: { type: "quantity", value, unit },
      source: { id: "bill", name: "A bill", kind: "arcgis_rest", dataOrigin: "real" },
      retrievedAt: "2026-11-07T20:00:00.000Z",
      sourceDate: null,
      method: "source_read",
      locator: {},
      identity: { sourceId: "bill", query: "q", contentHash: "h" },
      grade: "reference",
      synthetic: false,
    });

    // Peak demand comes off a bill, so the collector identity is rightly refused it —
    // that is the scope check doing its job. Run as `intake`, the identity that would
    // legitimately carry a bill-derived value, to show the physics check also runs here:
    // 480 V behind a 1600 A main cannot deliver 9,500 kW, whatever a document says.
    const result = gateObservations(
      [observation("service_voltage", 480, "V"), observation("main_device_rating", 1600, "A"), observation("peak_demand_kw", 9500, "kW")],
      { keyForField, agentId: "intake" },
    );
    const peak = result.rejected.find((v) => v.key === "load.peak_kw");
    expect(peak?.rejection?.codes).toContain("cross_field_implausible");
  });

  it("chains admitted values, so later checks see earlier ones", async () => {
    const result = gateObservations(await collected(HOLLISTON), { keyForField });
    // Several sources can answer one field, as the serving utility's candidates do, so
    // compare distinct fields rather than observations.
    expect(Object.keys(result.known).sort()).toEqual([...new Set(result.admitted.map((a) => a.key))].sort());
  });

  it("refuses the collector a field only a bill or a nameplate can answer", async () => {
    // The check that stops this being theatre: first-party code reading a public layer
    // still cannot write the numbers that decide the project.
    const fromBill: Observation = {
      id: "o3",
      siteId: "gate-test",
      field: "peak_demand_kw",
      kind: "reading",
      value: { type: "quantity", value: 400, unit: "kW" },
      source: { id: "massgis", name: "A public layer", kind: "arcgis_rest", dataOrigin: "real" },
      retrievedAt: "2026-11-07T20:00:00.000Z",
      sourceDate: null,
      method: "source_read",
      locator: {},
      identity: { sourceId: "massgis", query: "q", contentHash: "h" },
      grade: "reference",
      synthetic: false,
    };
    const result = gateObservations([fromBill], { keyForField });
    expect(result.rejected[0]!.rejection?.codes).toContain("agent_not_permitted");
  });

  it("keeps a no-value observation as a finding, not a rejection", async () => {
    const asked: Observation = {
      id: "o2",
      siteId: "gate-test",
      field: "bus_rating",
      kind: "no_value",
      value: null,
      source: { id: "massgis", name: "A public layer", kind: "arcgis_rest", dataOrigin: "real" },
      retrievedAt: "2026-11-07T20:00:00.000Z",
      sourceDate: null,
      method: "source_read",
      locator: {},
      identity: { sourceId: "massgis", query: "q", contentHash: "h" },
      reason: "No public layer carries a switchgear bus rating.",
      synthetic: false,
    };
    const result = gateObservations([asked], { keyForField });
    expect(result.rejected).toHaveLength(0);
    expect(result.verdicts[0]!.status).toBe("no_value");
  });
});
