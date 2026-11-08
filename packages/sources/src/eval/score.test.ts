import { describe, expect, it } from "vitest";
import { covers, convexHull, match, scoreSite, type Point } from "./score.ts";

describe("scoring detections against a drawing", () => {
  it("matches one to one, nearest first, within the radius", () => {
    // Two detections near one drawn pole: only the nearer matches.
    expect(match([[0, 0], [10, 0]], [[1, 0], [0.5, 0], [30, 0]], 2.5)).toEqual([0.5]);
    expect(match([[0, 0], [10, 0]], [[0.5, 0], [11, 0]], 2.5)).toEqual([0.5, 1]);
  });

  it("counts a detection as false only inside the drawing's area", () => {
    const hull = convexHull([[0, 0], [50, 0], [50, 50], [0, 50], [25, 25]]);
    expect(covers(hull, [25, 25])).toBe(true);
    expect(covers(hull, [58, 25])).toBe(true); // within the 10 m margin
    expect(covers(hull, [80, 25])).toBe(false);
  });

  it("scores each drawn kind, ignores kinds the drawing doesn't mark, and ranks the transformer", () => {
    const coverage: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const score = scoreSite({
      truth: { light_pole: [[10, 10], [50, 50]], transformer: [[70, 70]] },
      found: { light_pole: [[11, 10], [90, 90], [300, 300]], hydrant: [[20, 20]] },
      drawn: ["light_pole", "transformer"],
      coverage,
      boxes: [[20, 80], [71, 70]],
    });
    expect(score.classes).toHaveLength(1);
    // 3 found, 1 outside the area: 2 counted, 1 matched; 2 drawn.
    expect(score.classes[0]).toMatchObject({ found: 2, matched: 1, falsePositives: 1, precision: 0.5, recall: 0.5, f1: 0.5 });
    expect(score.transformerRank).toBe(2);
    expect(score.objective).toBeCloseTo((0.5 + 0.5) / 2);
  });

  it("scores a missed transformer as zero", () => {
    const score = scoreSite({ truth: { transformer: [[0, 0]] }, found: {}, drawn: ["transformer"], coverage: [[0, 0]], boxes: [[50, 50]] });
    expect(score.transformerRank).toBeNull();
    expect(score.objective).toBe(0);
  });
});
