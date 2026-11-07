import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONCEPT_GRADE_NOTE, CONTRACT_VERSION, SiteMapExportSchema, routes } from "@eqore/contract";
import { fixtureFetch } from "@eqore/sources";
import { createCaptureApp } from "./capture-server.ts";
import type { CaptureDeps } from "./capture.ts";
import { createEngineerApp } from "./routes.ts";
import { Store } from "./store.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const SITE = "100-research-dr-worcester-ma";

async function setup() {
  const deps: CaptureDeps = {
    store: new Store(),
    fetch: fixtureFetch(dir("arcgis"), dir("geocoder")),
    now: () => "2026-11-07T20:00:00.000Z",
    uploadDir: join(tmpdir(), "site-map-test-uploads"),
    capturePublicUrl: "https://tunnel.invalid",
    extractor: async () => ({ kind: "failed", reason: "No model call in this test" }),
  };
  const app = createEngineerApp(deps);
  await app.request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "100 Research Dr, Worcester, MA" }) });
  const siteMap = async (version: number | "latest" = "latest") => SiteMapExportSchema.parse(await (await app.request(`/api/sites/${SITE}/versions/${version}/site-map`)).json());
  return { deps, app, siteMap };
}

describe("the site map export", () => {
  it("exports the record as GeoJSON with the concept-grade note, on the current contract", async () => {
    const { siteMap } = await setup();
    const map = await siteMap();

    expect(map).toMatchObject({ contractVersion: CONTRACT_VERSION, recordVersionId: `${SITE}-v1`, version: 1, generatedAt: "2026-11-07T20:00:00.000Z", note: CONCEPT_GRADE_NOTE, synthetic: false, snapshot: false });
    expect(map.features.type).toBe("FeatureCollection");
    expect(map.site.address).toBe("100 Research Dr, Worcester, MA");
    expect(map.baseMap?.sourceId).toBe("massgis-imagery-2025");
    const kinds = new Set(map.features.features.map((feature) => feature.properties.kind));
    expect([...kinds].sort()).toEqual(["building_outline", "candidate_area", "constraint", "dimension_line", "property_line", "substation", "utility_line"]);
    expect(map.coverage?.filled).toBeGreaterThan(10);
  });

  it("gives every feature the state, grade, and owner of the value behind it, and includes what's missing", async () => {
    const { siteMap } = await setup();
    const map = await siteMap();
    const values = new Map(map.values.map((value) => [value.field, value]));
    for (const feature of map.features.features) {
      const value = values.get(feature.properties.field)!;
      expect(feature.properties).toMatchObject({ state: value.state, grade: value.grade, owner: value.owner });
    }
    expect(map.features.features.find((feature) => feature.properties.kind === "utility_line")!.properties.state).toBe("conflicting");
    expect(values.get("meter_number")!.state).toBe("missing");
    expect(values.get("lot_width_ft")).toMatchObject({ state: "inferred", method: "computed" });
  });

  it("shows a person's verification in the next version, and leaves the older export as it was", async () => {
    const { app, siteMap } = await setup();
    const reading = (await siteMap()).values.find((value) => value.field === "property_line")!.currentObservationId;
    await app.request(`/api/sites/${SITE}/values/property_line/confirm`, {
      method: "POST",
      body: JSON.stringify({ verifierName: "A. Engineer", evidence: [{ kind: "document", description: "Plot plan on file" }], expectedObservationId: reading }),
    });
    const stateOf = (map: Awaited<ReturnType<typeof siteMap>>) => map.features.features.find((feature) => feature.properties.kind === "property_line")!.properties.state;
    expect(stateOf(await siteMap())).toBe("verified");
    expect(stateOf(await siteMap(1))).toBe("inferred");
  });

  it("returns 404 for an unknown version, and isn't reachable on the capture listener", async () => {
    const { deps, app } = await setup();
    expect((await app.request(`/api/sites/${SITE}/versions/99/site-map`)).status).toBe(404);
    expect((await createCaptureApp(deps).request(`/api/sites/${SITE}/versions/latest/site-map`)).status).toBe(404);
  });
});
