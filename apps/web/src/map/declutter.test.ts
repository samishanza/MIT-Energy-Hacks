// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { declutter, priorityOf } from "./declutter";

const label = (left: number, top: number, width: number, height: number, className: string) => {
  const element = document.createElement("div");
  element.className = className;
  element.getBoundingClientRect = () => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  return { element, priority: priorityOf(className) };
};

describe("map labels never overlap", () => {
  it("hides the less important of two overlapping labels and keeps both when they're apart", () => {
    const dim = label(100, 100, 80, 18, "callout callout-dimension");
    const wet = label(150, 105, 120, 18, "callout callout-drafting callout-wetlands");
    const road = label(400, 100, 90, 18, "callout callout-drafting callout-roads");
    expect(declutter([wet, dim, road])).toBe(1);
    expect(dim.element.style.visibility).toBe("visible");
    expect(wet.element.style.visibility).toBe("hidden");
    expect(road.element.style.visibility).toBe("visible");
  });

  it("shows a hidden label again once there's room", () => {
    const a = label(100, 100, 80, 18, "callout callout-dimension");
    const b = label(150, 105, 80, 18, "callout callout-drafting callout-wetlands");
    declutter([a, b]);
    expect(b.element.style.visibility).toBe("hidden");
    b.element.getBoundingClientRect = () => ({ left: 300, top: 100, right: 380, bottom: 118, width: 80, height: 18, x: 300, y: 100, toJSON: () => ({}) }) as DOMRect;
    declutter([a, b]);
    expect(b.element.style.visibility).toBe("visible");
  });
});

describe("map labels at the edge", () => {
  it("hides a label that would be cut off by the map's edge", () => {
    const edge = label(-30, 100, 80, 18, "callout callout-drafting callout-wetlands");
    const inside = label(100, 100, 80, 18, "callout callout-drafting callout-wetlands");
    declutter([edge, inside], { left: 0, top: 0, right: 800, bottom: 600 });
    expect(edge.element.style.visibility).toBe("hidden");
    expect(inside.element.style.visibility).toBe("visible");
  });
});
