import { describe, expect, it } from "vitest";
import { placeLabels } from "./labelPlacement";

const size = { width: 640, height: 400 };
const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("placing labels on a street photo", () => {
  it("keeps every label apart and on the picture, even with anchors bunched together", () => {
    const requests = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, anchor: { x: 300 + (i % 4) * 12, y: 180 + Math.floor(i / 4) * 10 }, width: 150, height: 18 }));
    const placed = placeLabels(requests, size);
    expect(placed.length).toBeGreaterThanOrEqual(6);
    for (const a of placed) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(size.width);
      expect(a.y + a.height).toBeLessThanOrEqual(size.height);
      for (const b of placed) if (a !== b) expect(intersects(a, b)).toBe(false);
    }
  });

  it("never covers another object's anchor", () => {
    const requests = [
      { id: "a", anchor: { x: 200, y: 200 }, width: 120, height: 18 },
      { id: "b", anchor: { x: 200, y: 160 }, width: 120, height: 18 },
    ];
    const placed = placeLabels(requests, size);
    for (const p of placed) for (const r of requests) {
      const inside = r.anchor.x > p.x && r.anchor.x < p.x + p.width && r.anchor.y > p.y && r.anchor.y < p.y + p.height;
      expect(inside).toBe(false);
    }
  });

  it("puts a lone label just above its object, on a short leader", () => {
    const [p] = placeLabels([{ id: "a", anchor: { x: 320, y: 200 }, width: 100, height: 18 }], size);
    expect(p!.y + p!.height).toBeLessThanOrEqual(200);
    expect(Math.hypot(p!.leader.x2 - p!.leader.x1, p!.leader.y2 - p!.leader.y1)).toBeLessThan(60);
  });
});
