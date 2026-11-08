import { describe, expect, it } from "vitest";
import type { MapFeature, Observation } from "@eqore/contract";
import { shapesOfFailedSources } from "./run.ts";

const shape = (id: string, field: string) => ({ id, kind: "constraint", field, geometry: { type: "Point", coordinates: [0, 0] }, label: id }) as MapFeature;
const noValue = (field: string, sourceId: string) => ({ field, kind: "no_value", source: { id: sourceId } }) as unknown as Observation;

describe("a re-run where a source doesn't answer", () => {
  const previous = [shape("paved-1", "paved_area_sqft"), shape("wet-1", "wetlands_nearby")];

  it("keeps that source's shapes from the last run", () => {
    const kept = shapesOfFailedSources([previous], {
      sourceRuns: [{ sourceId: "land-cover", status: "missing" }, { sourceId: "wetlands", status: "done" }],
      observations: [noValue("paved_area_sqft", "land-cover")],
      features: [shape("wet-2", "wetlands_nearby")],
    });
    expect(kept.map((f) => f.id)).toEqual(["paved-1"]);
  });

  it("looks back past runs where the source also failed, to the last one that drew its shapes", () => {
    const kept = shapesOfFailedSources([[shape("wet-1", "wetlands_nearby")], previous], {
      sourceRuns: [{ sourceId: "land-cover", status: "missing" }],
      observations: [noValue("paved_area_sqft", "land-cover")],
      features: [],
    });
    expect(kept.map((f) => f.id)).toEqual(["paved-1"]);
  });

  it("keeps nothing when every source answered, so a shape that's gone stays gone", () => {
    const kept = shapesOfFailedSources([previous], { sourceRuns: [{ sourceId: "land-cover", status: "done" }], observations: [noValue("paved_area_sqft", "land-cover")], features: [] });
    expect(kept).toEqual([]);
  });
});
