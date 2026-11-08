import { describe, expect, it } from "vitest";
import type { LidarPoint } from "../ept.ts";
import { followsStreet } from "./lidar-collect.ts";
import { detectEquipment } from "./lidar-equipment.ts";

// A synthetic scene in metres, flat ground at z = 100, a road along y = 0, and a building from y = 30 to 55.
type Add = (x: number, y: number, h: number, classification?: number, returns?: number) => void;
function scene(build: (add: Add) => void): LidarPoint[] {
  const points: LidarPoint[] = [];
  const add: Add = (x, y, h, classification = 1, returns = 1) => points.push({ x, y, z: 100 + h, classification, returns });
  for (let x = -20; x <= 200; x += 0.5) for (let y = -15; y <= 75; y += 0.5) add(x, y, 0, 2);
  for (let x = 30; x <= 110; x += 0.5) for (let y = 30; y <= 55; y += 0.5) add(x, y, 8, 6);
  build(add);
  return points;
}
// A pole: a thin column of returns from 1 m to 11 m, with a crossarm at the top. The returns a classifier
// would label as vegetation, as 3DEP often does beside trees, so classes don't decide.
const pole = (add: Add, x: number, y: number) => {
  for (let h = 1; h <= 11; h += 0.25) add(x + ((h * 7) % 3) * 0.05, y, h, 5, 2);
  for (let dx = -1.2; dx <= 1.2; dx += 0.3) add(x + dx, y, 10.6, 5, 2);
};
const wire = (add: Add, x0: number, x1: number, y: number) => {
  for (let x = x0 + 1; x < x1; x += 0.5) add(x, y, 9 - 1.5 * Math.sin((Math.PI * (x - x0)) / (x1 - x0)), 1, 1);
};
const crown = (add: Add, x: number, y: number, top: number, radius = 3.5) => {
  for (let a = 0; a < 360; a += 6) for (let r = 0; r <= radius; r += 0.4) for (let h = 3.5; h <= top; h += 0.7) add(x + r * Math.cos((a * Math.PI) / 180), y + r * Math.sin((a * Math.PI) / 180), h - (r / radius) * 1.5, 5, 3);
};
const building: [number, number][] = [[30, 30], [110, 30], [110, 55], [30, 55], [30, 30]];
const road = { name: "Test St", line: [[-20, 0], [200, 0]] as [number, number][], onAddress: true };
const rounded = (p: [number, number]) => p.map(Math.round);

describe("finding grid equipment in lidar by shape", () => {
  // Poles every 40 m along the road; the one at x = 120 stands inside a tree's crown.
  const found = detectEquipment(
    scene((add) => {
      for (const x of [0, 40, 80, 160]) pole(add, x, 6);
      wire(add, 0, 40, 6); wire(add, 40, 80, 6); wire(add, 80, 120, 6); wire(add, 120, 160, 6);
      crown(add, 120, 6, 10.5);
      for (let h = 1; h <= 11.5; h += 0.25) add(120, 6, h, 5, 2);
      crown(add, 20, 14, 11); // a roadside tree with no pole in it
      for (let x = 50; x <= 54.5; x += 0.25) for (let y = 1; y <= 2.8; y += 0.25) add(x, y, 1.5); // a car on the road
      for (let x = 60; x <= 61.5; x += 0.25) for (let y = 31; y <= 32.5; y += 0.25) add(x, y, 1.4, 4, 3); // a bush by the wall
      for (let x = 70; x <= 71.5; x += 0.25) for (let y = 40; y <= 41.5; y += 0.25) add(x, y, 9.5); // a rooftop unit
      for (let x = 135; x <= 136.75; x += 0.25) for (let y = 38; y <= 39.5; y += 0.25) add(x, y, 1.6); // a solid box in the open
    }),
    [building],
    [road],
  );

  it("finds the poles in the open, and the one hidden in a crown between them, and not the roadside tree", () => {
    expect(found.poles.map((p) => rounded(p.at)).sort((a, b) => a[0]! - b[0]!)).toEqual([[0, 6], [40, 6], [80, 6], [120, 6], [160, 6]]);
    expect(found.poles.find((p) => Math.round(p.at[0]) === 120)!.inCanopy).toBe(true);
    expect(found.poles.filter((p) => !p.inCanopy).every((p) => p.road === "Test St" && p.heightM >= 10.5)).toBe(true);
  });

  it("strings conductors pole to pole along the road", () => {
    const spans = found.conductors.map((span) => [Math.round(Math.min(span.from[0], span.to[0])), Math.round(Math.max(span.from[0], span.to[0]))]).sort((a, b) => a[0]! - b[0]!);
    expect(spans).toEqual([[0, 40], [40, 80], [80, 120], [120, 160]]);
  });

  it("reports the solid box in the open, and not the bush, the car, or the rooftop unit", () => {
    expect(found.padMounts.map((pad) => rounded(pad.at))).toEqual([[136, 39]]);
    expect(found.padMounts[0]!.heightM).toBeCloseTo(1.6, 1);
  });

  it("reports no service drop where no wire runs to the building", () => {
    expect(found.drop).toBeNull();
  });

  it("finds a narrow drop from a pole to the wall below the roof, with the roof height", () => {
    const withDrop = detectEquipment(
      scene((add) => {
        for (const x of [0, 40, 80]) pole(add, x, 6);
        wire(add, 0, 40, 6); wire(add, 40, 80, 6);
        for (let t = 0.02; t < 1; t += 0.015) add(40 + (60 - 40) * t, 6 + (30 - 6) * t, 9.5 - 3 * t);
      }),
      [building],
      [road],
    );
    expect(rounded(withDrop.drop!.pole.at)).toEqual([40, 6]);
    expect(withDrop.drop!.wall[1]).toBeCloseTo(30, 0);
    expect(withDrop.drop!.roofM).toBeCloseTo(8, 0);
  });

  it("finds nothing in an empty cloud", () => {
    expect(detectEquipment([], [building], [road])).toEqual({ poles: [], conductors: [], drop: null, padMounts: [], lightPoles: [], hydrants: [] });
  });

  it("reports the pole in the crown as inferred and the poles in the open as measured", () => {
    expect(found.poles.find((p) => Math.round(p.at[0]) === 120)!.detection).toBe("inferred");
    expect(found.poles.filter((p) => !p.inCanopy).every((p) => p.detection === "measured")).toBe(true);
  });
});

// A thin column of returns from 1 m to `top`, labelled vegetation as 3DEP often labels a pole.
const column = (add: Add, x: number, y: number, top: number) => {
  for (let h = 1; h <= top; h += 0.25) add(x + ((h * 7) % 3) * 0.05, y, h, 5, 2);
};
// A wire as QL1 lidar often samples one: a pair of returns every 10 m, labelled high noise.
const sparseWire = (add: Add, x0: number, x1: number, y: number) => {
  for (let x = x0 + 10; x < x1 - 1; x += 10) { add(x, y, 9.5, 18); add(x + 0.3, y - 0.2, 10.2, 18); }
};
const near = <T extends { at: [number, number] }>(poles: T[], x: number, y: number, radius = 2) => poles.filter((p) => Math.hypot(p.at[0] - x, p.at[1] - y) < radius);

describe("placing poles and rejecting what isn't one", () => {
  it("places a pole at the centre of its column, not at the tip of a crossarm on one side, and keeps the top height", () => {
    const poles = detectEquipment(
      scene((add) => {
        for (const x of [0, 40]) pole(add, x, 6);
        // A pole at x = 80 whose one-sided arm reaches 1.8 m toward the building; an insulator at its tip is the top.
        column(add, 80, 6, 10.8);
        for (let d = 0; d <= 1.8; d += 0.2) add(80, 6 + d, 11, 5, 2);
        add(80, 7.8, 11.2, 5, 2);
        wire(add, 0, 40, 6); wire(add, 40, 80, 6);
      }),
      [building],
      [road],
    ).poles;
    const placed = near(poles, 80, 7);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.at[0]).toBeCloseTo(80, 0);
    expect(Math.abs(placed[0]!.at[1] - 6)).toBeLessThan(0.3);
    expect(placed[0]!.heightM).toBeCloseTo(11.2, 1);
  });

  it("rejects a pole-shaped tree joined to a pole only through canopy", () => {
    const poles = detectEquipment(
      scene((add) => {
        for (const x of [0, 40]) pole(add, x, 6);
        wire(add, 0, 40, 6);
        // A bare trunk with a small head at x = 75, and a row of small trees between it and the pole at x = 40.
        column(add, 75, 6, 10.5);
        for (let a = 0; a < 360; a += 45) add(75 + 0.4 * Math.cos((a * Math.PI) / 180), 6 + 0.4 * Math.sin((a * Math.PI) / 180), 10.8, 5, 2);
        for (const x of [50, 58, 66]) crown(add, x, 6, 8, 2.5);
      }),
      [building],
      [road],
    ).poles;
    expect(near(poles, 75, 6)).toHaveLength(0);
    expect(poles.map((p) => Math.round(p.at[0])).sort((a, b) => a - b)).toEqual([0, 40]);
  });

  it("rejects a 7 m light and an 18 m mast, even with a wire to the mast", () => {
    const poles = detectEquipment(
      scene((add) => {
        for (const x of [0, 40, 80]) pole(add, x, 6);
        wire(add, 0, 40, 6); wire(add, 40, 80, 6);
        column(add, 20, 3, 7); // a street light with its arm over the road
        for (let d = 0; d <= 1.5; d += 0.25) add(20, 3 - d, 7, 1, 1);
        column(add, 120, 6, 18); // a mast on the line, with a wire strung to it at pole height
        wire(add, 80, 120, 6);
      }),
      [building],
      [road],
    ).poles;
    expect(near(poles, 20, 3)).toHaveLength(0);
    expect(near(poles, 120, 6)).toHaveLength(0);
    expect(poles.map((p) => Math.round(p.at[0])).sort((a, b) => a - b)).toEqual([0, 40, 80]);
  });

  it("accepts poles wired only by a few high-noise returns per span, as 3DEP samples a wire", () => {
    const found = detectEquipment(
      scene((add) => {
        for (const x of [0, 40, 80]) pole(add, x, 6);
        sparseWire(add, 0, 40, 6); sparseWire(add, 40, 80, 6);
      }),
      [building],
      [road],
    );
    expect(found.poles.map((p) => Math.round(p.at[0])).sort((a, b) => a - b)).toEqual([0, 40, 80]);
    expect(found.conductors).toHaveLength(2);
    expect(found.conductors.every((span) => span.heightM > 9 && span.heightM < 10.5)).toBe(true);
  });

  it("rejects a pole-shaped object with building returns within 2 m, even when the footprint isn't the site's", () => {
    const poles = detectEquipment(
      scene((add) => {
        for (const x of [0, 40]) pole(add, x, 6);
        wire(add, 0, 40, 6);
        // A neighbor's roof from y = 9.5, beside a mast at x = 80 that a wire reaches.
        for (let x = 74; x <= 90; x += 0.5) for (let y = 9.5; y <= 20; y += 0.5) add(x, y, 6, 6);
        pole(add, 80, 8);
        wire(add, 40, 80, 8);
      }),
      [building],
      [road],
    ).poles;
    expect(near(poles, 80, 8)).toHaveLength(0);
  });

  it("doesn't infer a pole in a crown, or accept the far pole, without wire running to the far pole", () => {
    const poles = detectEquipment(
      scene((add) => {
        for (const x of [0, 40, 80, 160]) pole(add, x, 6);
        wire(add, 0, 40, 6); wire(add, 40, 80, 6); wire(add, 80, 120, 6);
        crown(add, 120, 6, 10.5);
        for (let h = 1; h <= 11.5; h += 0.25) add(120, 6, h, 5, 2);
      }),
      [building],
      [road],
    ).poles;
    expect(poles.map((p) => Math.round(p.at[0])).sort((a, b) => a - b)).toEqual([0, 40, 80]);
  });

  it("looks for poles only along streets, not along a parking-lot aisle", () => {
    const aisle = { ...road, name: "parking aisle", street: false };
    const build = (add: Add) => {
      for (const x of [0, 40, 80]) pole(add, x, 6);
      wire(add, 0, 40, 6); wire(add, 40, 80, 6);
    };
    expect(detectEquipment(scene(build), [building], [aisle]).poles).toHaveLength(0);
    expect(detectEquipment(scene(build), [building], [road]).poles).toHaveLength(3);
  });

  it("treats only primary, secondary, and local streets as streets, by TIGER feature class", () => {
    expect(["S1100", "S1200", "S1400", undefined].map(followsStreet)).toEqual([true, true, true, true]);
    expect(["S1780", "S1730", "S1740", "S1640", "S1710"].map(followsStreet)).toEqual([false, false, false, false, false]);
  });
});

describe("equipment boxes by shape", () => {
  it("finds a solid flat cabinet labelled low vegetation beside a taller generator, and not a bush", () => {
    const found = detectEquipment(
      scene((add) => {
        // A 2 x 2 m cabinet 1.4 m tall, which 3DEP labels low vegetation, single returns.
        for (let x = 120; x <= 122; x += 0.25) for (let y = 40; y <= 42; y += 0.25) add(x, y, 1.4, 3, 1);
        // A generator 2.3 m tall right beside it, which shouldn't merge with it.
        for (let x = 122.5; x <= 125.5; x += 0.25) for (let y = 40; y <= 41.5; y += 0.25) add(x, y, 2.3, 4, 1);
        // A bush: uneven top, several returns per pulse.
        for (let x = 140; x <= 142; x += 0.25) for (let y = 40; y <= 42; y += 0.25) add(x, y, 1 + 0.8 * Math.abs(Math.sin(x * 3 + y * 5)), 4, 3);
      }),
      [building],
      [road],
    );
    const cabinet = found.padMounts.find((pad) => Math.abs(pad.at[0] - 121) < 1);
    expect(cabinet).toMatchObject({ labelledVegetation: true });
    expect(cabinet!.heightM).toBeCloseTo(1.4, 1);
    expect(found.padMounts.some((pad) => pad.at[0] > 139)).toBe(false);
  });

  it("keeps a cabinet apart from the taller fence around it, and drops a parked car and a box well inside a paved lot", () => {
    const lot: [number, number][] = [[150, 5], [195, 5], [195, 28], [150, 28], [150, 5]];
    const found = detectEquipment(
      scene((add) => {
        // A 2 x 2 m cabinet 1.6 m tall with a few multiple returns at its edge, inside a 2.4 m fence 0.5 m out.
        for (let x = 120; x <= 122; x += 0.25) for (let y = 40; y <= 42; y += 0.25) add(x, y, 1.5 + ((x * 4 + y) % 3) * 0.05, 3, x === 122 ? 2 : 1);
        for (let x = 119; x <= 123; x += 0.25) { add(x, 39.5, 2.4, 4); add(x, 42.5, 2.4, 4); }
        for (let y = 39.5; y <= 42.5; y += 0.25) { add(119.5, y, 2.4, 4); add(122.5, y, 2.4, 4); }
        // A parked car on open ground: a 1.4 m roof over a 1.0 m hood and trunk, 4.6 by 1.8 m.
        for (let x = 140; x <= 144.6; x += 0.25) for (let y = 40; y <= 41.8; y += 0.25) add(x, y, x > 141.2 && x < 143.4 ? 1.4 : 1.0);
        // A 1.5 m box in the middle of a paved lot.
        for (let x = 170; x <= 171.5; x += 0.25) for (let y = 15; y <= 16.5; y += 0.25) add(x, y, 1.5);
      }),
      [building],
      [road],
      [lot],
    );
    expect(found.padMounts.map((pad) => rounded(pad.at))).toEqual([[121, 41]]);
    expect(found.padMounts[0]!.heightM).toBeCloseTo(1.6, 0);
  });
});

describe("light poles and hydrants by shape", () => {
  // A lamp head: a small cluster at the top of a thin pole.
  const light = (add: Add, x: number, y: number, top: number) => {
    for (let h = 0.5; h < top - 0.5; h += 1.5) add(x, y, h, 1, 1);
    for (let dx = -0.3; dx <= 0.9; dx += 0.3) for (let dy = -0.2; dy <= 0.2; dy += 0.2) add(x + dx, y + dy, top - 0.1, 1, 1);
  };
  const found = detectEquipment(
    scene((add) => {
      light(add, 130, 20, 9);
      light(add, 160, 25, 5);
      crown(add, 180, 20, 8, 3); // a small tree: a crown fills its depth
      add(140, 3, 0.85, 3, 1); // a hydrant at the curb: a single return 0.85 m up
      add(170, 3, 0.85, 3, 1); for (let a = 0; a < 6; a++) add(170 + Math.cos(a), 3 + Math.sin(a), 0.6, 3, 2); // a shrub's twig
      add(190, 3, 0.8, 1, 1); add(190.2, 3, 2.2, 1, 1); // a sign post
    }),
    [building],
    [road],
  );

  it("finds lamp heads on thin poles over open ground, and not a small tree", () => {
    expect(found.lightPoles.map((p) => rounded(p.at)).sort((a, b) => a[0]! - b[0]!)).toEqual([[130, 20], [160, 25]]);
    expect(found.lightPoles.map((p) => Math.round(p.heightM)).sort()).toEqual([5, 9]);
  });

  it("marks a lone low object at the curb as a possible hydrant, and not a shrub or a sign post", () => {
    expect(found.hydrants.map((p) => rounded(p.at))).toEqual([[140, 3]]);
    expect(found.hydrants[0]!.roadM).toBeCloseTo(3, 0);
  });
});
