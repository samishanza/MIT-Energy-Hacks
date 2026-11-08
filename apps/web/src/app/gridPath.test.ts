import type { MapFeature } from "@eqore/contract";
import { describe, expect, it } from "vitest";
import { gridPath } from "./gridPath";

// Synthetic test geometry near 42.3 N: 0.0001 deg of longitude is about 8 m, of latitude about 11 m.
type LonLat = [number, number];
const text = (value: string) => ({ type: "text" as const, value });
const building: MapFeature = {
  id: "b",
  kind: "building_outline",
  field: "building_footprint",
  geometry: { type: "Polygon", coordinates: [[[-71.0, 42.3], [-70.9995, 42.3], [-70.9995, 42.3004], [-71.0, 42.3004], [-71.0, 42.3]]] },
};
const pole = (id: string, at: LonLat): MapFeature => ({ id, kind: "existing_equipment", field: "detected_grid_equipment", geometry: { type: "Point", coordinates: at }, attributes: { equipment_type: text("utility_pole"), height_ft: { type: "quantity", value: 35, unit: "ft" } } });
const wire = (id: string, line: LonLat[], cls: string, field = "detected_grid_equipment"): MapFeature => ({ id, kind: "utility_line", field, geometry: { type: "LineString", coordinates: line }, attributes: { line_class: text(cls) } });
const record = (features: MapFeature[], values: { field: string; current: unknown }[] = []) => ({ features: [building, ...features], values: values as never });

describe("grid path", () => {
  it("follows a detected drop to the pole it hangs from, then along the wires", () => {
    const steps = gridPath(
      record([
        wire("drop", [[-71.0, 42.3002], [-71.0003, 42.3002]], "detected service drop"),
        pole("p1", [-71.0003, 42.3002]),
        pole("p2", [-71.0003, 42.3006]),
        wire("c1", [[-71.0003, 42.3002], [-71.0003, 42.3006]], "detected overhead conductor"),
      ]),
    );
    expect(steps.map((s) => s.role)).toEqual(["building", "service_entrance", "service_drop", "pole", "distribution"]);
    expect(steps[1]!.at).toEqual([-71.0, 42.3002]);
    expect(steps[3]!.title).toBe("Utility pole the drop hangs from");
    expect(steps[3]!.link).toBeNull();
    expect(steps[4]!.basis).toBe("detected");
    expect(steps[4]!.detail).toMatch(/doesn't publish which feeder/);
  });

  it("marks a gap as not public instead of drawing a route through it", () => {
    const steps = gridPath(record([pole("p1", [-71.0008, 42.3002])]));
    expect(steps.map((s) => s.role)).toEqual(["building", "pole"]);
    expect(steps[1]!.title).toBe("Nearest utility pole");
    expect(steps[1]!.link?.basis).toBe("not_public");
    // Measured from the nearest wall (about 66 m), not the building's centre (about 87 m).
    expect(steps[1]!.link?.distanceFt).toBeGreaterThan(200);
    expect(steps[1]!.link?.distanceFt).toBeLessThan(230);
  });

  it("takes the substation the utility names for the feeder over a nearer one", () => {
    const sub = (id: string, label: string, at: LonLat): MapFeature => ({ id, kind: "substation", field: "substations_nearby", geometry: { type: "Point", coordinates: at }, label });
    const steps = gridPath(
      record(
        [sub("near", "RENA ST.", [-71.001, 42.3]), sub("far", "BLOOMINGDALE", [-71.01, 42.3]), sub("proposed", "Proposed substation #1", [-71.0002, 42.3])],
        [{ field: "feeder_substation", current: text("Bloomingdale") }],
      ),
    );
    const step = steps.find((s) => s.role === "substation")!;
    expect(step.featureId).toBe("far");
    expect(step.title).toMatch(/^Feeder's substation: BLOOMINGDALE/);
    expect(step.link?.basis).toBe("not_public");
  });

  it("calls the nearest substation only the nearest when the utility names none, and skips proposed ones", () => {
    const steps = gridPath(record([{ id: "proposed", kind: "substation", field: "proposed_substations_nearby", geometry: { type: "Point", coordinates: [-71.0002, 42.3] }, label: "Proposed substation #1" }, { id: "s", kind: "substation", field: "substations_nearby", geometry: { type: "Point", coordinates: [-71.002, 42.3] }, label: "RENA ST." }]));
    const step = steps.find((s) => s.role === "substation")!;
    expect(step.featureId).toBe("s");
    expect(step.detail).toMatch(/doesn't show which substation serves the site/);
  });

  it("says a transmission line feeds substations, not the building", () => {
    const tx: MapFeature = {
      ...wire("tx", [[-71.003, 42.29], [-71.003, 42.31]], "", "transmission_nearby"),
      attributes: { line_voltage: { type: "quantity", value: 115, unit: "kV" }, line_from: text("NEEDHAM"), line_to: text("BAKER STREET") },
    };
    const step = gridPath(record([tx])).at(-1)!;
    expect(step.role).toBe("transmission");
    expect(step.title).toBe("115 kV transmission line, NEEDHAM to BAKER STREET");
    expect(step.detail).toMatch(/not the building directly/);
  });

  it("has nothing to trace without a building", () => {
    expect(gridPath({ features: [], values: [] })).toEqual([]);
  });
});
