import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONCEPT_GRADE_NOTE, RecordVersionSchema, routes } from "@eqore/contract";
import { fixtureFetch } from "@eqore/sources";
import type { CaptureDeps } from "./capture.ts";
import { createEngineerApp } from "./routes.ts";
import { Store } from "./store.ts";

const dir = (name: string) => fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
const SITE = "100-research-dr-worcester-ma";

async function exported() {
  const deps: CaptureDeps = {
    store: new Store(),
    fetch: fixtureFetch(dir("arcgis"), dir("geocoder")),
    now: () => "2026-11-07T20:00:00.000Z",
    uploadDir: join(tmpdir(), "export-files-test-uploads"),
    capturePublicUrl: "https://tunnel.invalid",
    extractor: async () => ({ kind: "failed", reason: "No model call in this test" }),
  };
  const app = createEngineerApp(deps);
  await app.request(routes.runSite.path, { method: "POST", body: JSON.stringify({ address: "100 Research Dr, Worcester, MA" }) });
  const record = RecordVersionSchema.parse(await (await app.request(`/api/sites/${SITE}/versions/latest`)).json());
  const dxf = await app.request(`/api/sites/${SITE}/versions/1/site.dxf`);
  const kml = await app.request(`/api/sites/${SITE}/versions/1/site.kml`);
  return { record, dxf, kml, dxfText: await dxf.text(), kmlText: await kml.text() };
}

// The vertices of every polyline on one layer, read back from the group codes.
function polylineVertices(dxf: string, layer: string): [number, number][][] {
  const pairs = dxf.trim().split("\n");
  const shapes: [number, number][][] = [];
  let current: [number, number][] | null = null;
  for (let index = 0; index < pairs.length - 1; index += 2) {
    const code = pairs[index]!.trim();
    const value = pairs[index + 1]!.trim();
    if (code === "0" && value === "POLYLINE") current = [];
    if (code === "0" && value === "SEQEND") {
      if (current) shapes.push(current);
      current = null;
    }
    if (code === "8" && current && value !== layer) current = null;
    if (code === "10" && current) current.push([Number(value), 0]);
    if (code === "20" && current && current.length) current[current.length - 1]![1] = Number(value);
  }
  return shapes.filter((shape) => shape.length > 0);
}

describe("site geometry as files", () => {
  it("exports a DXF whose parcel layer measures the record's lot dimensions", async () => {
    const { record, dxf, dxfText } = await exported();
    expect(dxf.headers.get("content-disposition")).toBe(`attachment; filename="${SITE}-v1.dxf"`);
    const [parcel] = polylineVertices(dxfText, "PARCEL");
    const xs = parcel!.map(([x]) => x);
    const ys = parcel!.map(([, y]) => y);
    const value = (field: string) => (record.values.find((entry) => entry.field === field)!.current as { value: number }).value;
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(value("lot_width_ft"), -1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(value("lot_depth_ft"), -1);
    expect(dxfText).toContain(`Origin (0,0) is longitude ${record.site.location![0]}, latitude ${record.site.location![1]}`);
    expect(polylineVertices(dxfText, "BUILDINGS").length).toBeGreaterThan(0);
  });

  it("places the parcel in the KML at the record's coordinates", async () => {
    const { record, kml, kmlText } = await exported();
    expect(kml.headers.get("content-type")).toBe("application/vnd.google-earth.kml+xml");
    const parcel = record.features.find((feature) => feature.kind === "property_line")!;
    const [lon, lat] = (parcel.geometry.coordinates as number[][][])[0]![0]!;
    expect(kmlText).toContain("<Folder><name>PARCEL</name>");
    expect(kmlText).toContain(`${lon},${lat},0`);
  });

  it("carries the concept-grade note and version in both files, and no owner names", async () => {
    const { dxfText, kmlText } = await exported();
    for (const text of [dxfText, kmlText]) {
      expect(text).toContain(CONCEPT_GRADE_NOTE);
      expect(text).toContain("version 1, exported 2026-11-07T20:00:00.000Z");
      expect(text).not.toMatch(/OWNER|OWN_ADDR/);
    }
  });
});
