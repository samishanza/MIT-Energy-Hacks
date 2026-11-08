import { describe, expect, it } from "vitest";
import { bearingDeg, project, streetView } from "./street-view.ts";

const camera = { at: [-71.4, 42.2] as [number, number], heading: 0, pitch: 0, fov: 90, width: 640, height: 400 };
// About 30 m north of the camera.
const north: [number, number] = [-71.4, 42.2 + 30 / 111_320];

describe("placing equipment in the street photo", () => {
  it("puts a point straight ahead at the center column, and a ground point below the horizon", () => {
    const p = project(camera, north, 0);
    expect(Math.round(p.x)).toBe(320);
    expect(p.y).toBeGreaterThan(200);
    expect(p.inFrame).toBe(true);
  });

  it("puts something above camera height above the horizon", () => {
    expect(project(camera, north, 10).y).toBeLessThan(200);
  });

  it("puts a point 45 degrees right at the frame's right edge, and one behind out of frame", () => {
    const right: [number, number] = [-71.4 + 30 / (111_320 * Math.cos((42.2 * Math.PI) / 180)), 42.2 + 30 / 111_320];
    expect(Math.round(bearingDeg(camera.at, right))).toBe(45);
    expect(Math.round(project(camera, right, 0).x)).toBe(640);
    const behind: [number, number] = [-71.4, 42.2 - 30 / 111_320];
    expect(project(camera, behind, 0).inFrame).toBe(false);
  });

  it("says why when there is no key, without calling Google", async () => {
    const record = {
      site: { id: "s", address: "a", region: "massachusetts", location: null, locationMethod: null },
      version: 1,
      features: [
        { id: "e", kind: "existing_equipment", field: "grid_service_path", label: "(E) LIKELY SERVICE ENTRANCE", geometry: { type: "Point", coordinates: [-71.4, 42.2] }, attributes: { equipment_type: { type: "text", value: "service_entrance" }, basis: { type: "text", value: "inferred" } } },
      ],
      values: [],
      observations: [],
    } as never;
    const result = await streetView(record, () => Promise.reject(new Error("must not fetch")), null);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/No Google Maps key/);
  });
});
