import { describe, expect, it } from "vitest";
import { projectPoint } from "./streetProjection";

const camera = { lat: 42.2, lng: -71.4, heading: 0, pitch: 0, fov: 90, width: 640, height: 400 };
const north = (m: number): [number, number] => [-71.4, 42.2 + m / 111_320];

describe("placing equipment in a street photo", () => {
  it("puts a point ahead at camera height on the horizon, at the center column", () => {
    const p = projectPoint(camera, north(20), 2.5);
    expect(Math.round(p.x)).toBe(320);
    expect(Math.round(p.y)).toBe(200);
    expect(p.depth).toBeCloseTo(20, 0);
  });

  it("puts the base of a pole below the horizon and its top above, on one column", () => {
    const base = projectPoint(camera, north(20), 0);
    const top = projectPoint(camera, north(20), 11);
    expect(base.y).toBeGreaterThan(200);
    expect(top.y).toBeLessThan(200);
    expect(Math.round(base.x)).toBe(Math.round(top.x));
  });

  it("knows what's behind the camera", () => {
    expect(projectPoint(camera, north(-20), 0).depth).toBeLessThan(0);
  });

  it("follows the heading: something due east is centered when facing east", () => {
    const east: [number, number] = [-71.4 + 20 / (111_320 * Math.cos((42.2 * Math.PI) / 180)), 42.2];
    expect(Math.round(projectPoint({ ...camera, heading: 90 }, east, 2.5).x)).toBe(320);
  });
});
