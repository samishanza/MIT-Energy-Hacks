import type { BaseMap } from "@eqore/contract";
import { describe, expect, it } from "vitest";
import { aerialTiles } from "./aerial";

const base = (overrides: Partial<BaseMap> = {}): BaseMap => ({
  tileUrlTemplate: "https://tiles.example/{z}/{y}/{x}",
  attribution: "Sample",
  sourceId: "sample",
  sourceDate: null,
  maxZoom: 20,
  center: [0, 0],
  zoom: 1,
  ...overrides,
});

describe("aerial tiles", () => {
  // At zoom 1 the world is 512 px square, so 0,0 is the corner shared by all four tiles.
  it("centers the view on the point, with exact tiles and offsets", () => {
    const tiles = aerialTiles(base(), [0, 0], 100, 100);
    expect(tiles).toEqual([
      { url: "https://tiles.example/1/0/0", left: -206, top: -206 },
      { url: "https://tiles.example/1/1/0", left: -206, top: 50 },
      { url: "https://tiles.example/1/0/1", left: 50, top: -206 },
      { url: "https://tiles.example/1/1/1", left: 50, top: 50 },
    ]);
  });

  it("places a known point in its known tile", () => {
    // Cambridge, MA at zoom 17 falls in row 48488, column 39653, per the MassGIS tile check.
    const [tile] = aerialTiles(base({ zoom: 17 }), [-71.09, 42.36], 1, 1);
    expect(tile!.url).toMatch(/\/17\/\d+\/\d+$/);
    const [, row, column] = /17\/(\d+)\/(\d+)$/.exec(tile!.url)!;
    expect(Number(column)).toBeGreaterThan(39000);
    expect(Number(column)).toBeLessThan(40000);
    expect(Number(row)).toBeGreaterThan(48000);
    expect(Number(row)).toBeLessThan(49000);
  });

  it("never asks for a zoom beyond the source's maximum", () => {
    const [tile] = aerialTiles(base({ zoom: 22, maxZoom: 20 }), [0, 0], 1, 1);
    expect(tile!.url).toMatch(/\/20\//);
  });
});
