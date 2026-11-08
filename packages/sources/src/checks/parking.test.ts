import { describe, expect, it } from "vitest";
import { detectStallRows } from "./parking.ts";
import { regularizeArea } from "./paved.ts";

// A labeled synthetic image: grey asphalt, a row of 12 stalls striped 2.75 m apart and 5.5 m deep, with a white
// car and a dark car parked in it, at 0.11 m per pixel.
const MPP = 0.11;
function lot() {
  const width = 600, height = 300;
  const gray = new Float32Array(width * height).fill(110), saturation = new Float32Array(width * height).fill(8), mask = new Uint8Array(width * height).fill(1);
  const spacing = 2.75 / MPP, depth = 5.5 / MPP, x0 = 80, y0 = 100;
  for (let k = 0; k <= 12; k++) {
    const x = Math.round(x0 + k * spacing);
    for (let y = y0; y < y0 + depth; y++) gray[y * width + x] = 225;
  }
  const car = (stall: number, shade: number) => {
    const left = Math.round(x0 + stall * spacing + 4), right = Math.round(x0 + (stall + 1) * spacing - 4);
    for (let y = y0 + 6; y < y0 + depth - 4; y++) for (let x = left; x < right; x++) gray[y * width + x] = shade;
  };
  car(3, 235);
  car(7, 40);
  return { gray, saturation, mask, width, height };
}

describe("parking stalls from imagery", () => {
  it("finds the row of 12 stalls at the striped spacing, with cars parked in it", () => {
    const { gray, saturation, mask, width, height } = lot();
    const rows = detectStallRows(gray, saturation, mask, width, height, MPP);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.stalls).toBeGreaterThanOrEqual(11);
    expect(rows[0]!.stalls).toBeLessThanOrEqual(12);
    expect(rows[0]!.spacingM).toBeCloseTo(2.75, 1);
  });

  it("finds nothing on bare asphalt or outside the paved mask", () => {
    const { gray, saturation, width, height } = lot();
    expect(detectStallRows(gray, saturation, new Uint8Array(width * height), width, height, MPP)).toEqual([]);
    expect(detectStallRows(new Float32Array(width * height).fill(110), saturation, new Uint8Array(width * height).fill(1), width, height, MPP)).toEqual([]);
  });
});

describe("straightening a traced area", () => {
  it("turns a jagged 40 x 20 m rectangle into a clean one of the same size", () => {
    const ring: [number, number][] = [];
    for (let x = 0; x <= 40; x += 1) ring.push([x, (x % 2) * 0.4]);
    for (let y = 0; y <= 20; y += 1) ring.push([40 + (y % 2) * 0.4, y]);
    for (let x = 40; x >= 0; x -= 1) ring.push([x, 20 - (x % 2) * 0.4]);
    for (let y = 20; y >= 0; y -= 1) ring.push([-(y % 2) * 0.4, y]);
    const [polygon] = regularizeArea([[ring]], 0);
    const outer = polygon![0]!;
    expect(outer.length).toBeLessThanOrEqual(9);
    const area = Math.abs(outer.reduce((sum, p, i) => (i === 0 ? 0 : sum + outer[i - 1]![0] * p[1] - p[0] * outer[i - 1]![1]), 0)) / 2;
    expect(Math.abs(area - 800) / 800).toBeLessThan(0.05);
  });
});
