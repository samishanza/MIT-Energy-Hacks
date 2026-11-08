import { describe, expect, it } from "vitest";
import { planMapFeatures, shortLabel } from "./planFeatures";

describe("features traced from a drawing", () => {
  it("shortens the drawing's own wording for a callout and keeps new or existing", () => {
    expect(shortLabel("(N) 60 kW diesel generator, 60 kW/75 kVA, 208/120 V", "(E) GENERATOR")).toBe("(N) 60 KW DIESEL GENERATOR");
    expect(shortLabel("(E) Panel EP (emergency)", "(E) PANEL")).toBe("(E) PANEL EP");
    expect(shortLabel(undefined, "(E) GENERATOR")).toBe("(E) GENERATOR");
  });

  it("keeps the full note and the sheet on each feature", () => {
    const [f] = planMapFeatures({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-71.8, 42.26] }, properties: { type: "transfer_switch", label: "(N) ATS-1, 4-pole automatic transfer switch", sheet: "E311" } }],
    });
    expect(f!.label).toBe("(N) ATS-1");
    expect((f!.attributes!["drawing_note"] as { value: string }).value).toContain("automatic transfer switch");
    expect((f!.attributes!["confidence_reason"] as { value: string }).value).toContain("E311");
  });

  it("labels an existing conduit as existing, not as a new run to the battery", () => {
    const [f] = planMapFeatures({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[-71.8, 42.26], [-71.8001, 42.2601]] }, properties: { type: "conduit", label: "(E) Feeder conduit, reworked" } }],
    });
    expect(f!.label).toBe("(E) FEEDER CONDUIT");
  });
});
