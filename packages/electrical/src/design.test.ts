import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MapFeature, ObservedValue, RecordVersion, Value } from "@eqore/contract";
import { CONCEPT_NOTE, designFromRecord } from "./design.ts";
import { conceptSiteLayout } from "./layout.ts";
import { singleLineSvg } from "./single-line.ts";

// A labeled synthetic record: only the parts the design reads.
function value(field: string, current: ObservedValue | null, state: Value["state"] = current ? "inferred" : "missing", reason?: string): Value {
  return { field, label: field, state, current, flags: [], observationIds: [], owner: "engineer", grade: "reference", synthetic: true, reason } as unknown as Value;
}

const square = (lon: number, lat: number, size: number): MapFeature["geometry"] => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
});

function record(values: Value[], features: MapFeature[] = []): RecordVersion {
  return {
    id: "synthetic-site-v1",
    version: 1,
    site: { id: "synthetic-site", address: "SYNTHETIC TEST SITE, ANYTOWN, MA", region: "massachusetts", location: [-71.5, 42.2], locationMethod: "hand_placed" },
    values,
    features,
    synthetic: true,
  } as unknown as RecordVersion;
}

const site = [
  { id: "pad", kind: "candidate_area", field: "pad_zone_x_ft", geometry: square(-71.5, 42.2, 0.0002) },
  { id: "service-entrance", kind: "existing_equipment", field: "grid_service_path", geometry: { type: "Point", coordinates: [-71.5, 42.2006] }, attributes: { equipment_type: { type: "text", value: "service_entrance" }, basis: { type: "text", value: "inferred" } } },
] as MapFeature[];

const unknownService = record([value("serving_utility", { type: "text", value: "National Grid" }), value("feeder", { type: "text", value: "SYNTHETIC-FEEDER" })], site);

describe("the concept electrical design", () => {
  it("computes both standard services when the record doesn't say which, each saying it's assumed", () => {
    const design = designFromRecord(unknownService);
    expect(design.note).toBe(CONCEPT_NOTE);
    expect(design.designs.map((entry) => entry.serviceVoltage)).toEqual([480, 208]);
    expect(design.inputs.serviceVoltage).toMatchObject({ state: "missing", value: null });
    expect(design.configuration.provenance).toBe("Taken from one supplied engineered plan set; not confirmed as EQORE's standard.");
  });

  it("sizes a 480 V connection as the source plan set does: 400 A, two sets of 250 kcmil aluminum", () => {
    const [at480] = designFromRecord(unknownService).designs;
    const calc = (id: string) => at480!.calculations.find((entry) => entry.id === id)!;
    expect(calc("disc-cb")).toMatchObject({ status: "passes", result: "2 × 250 kcmil Al per phase, 410 A ≥ 375 A" });
    expect(calc("inverter-ac")).toMatchObject({ status: "passes", result: "2/0 AWG Cu, 195 A ≥ 187.5 A" });
    expect(calc("dc")).toMatchObject({ status: "passes" });
    expect(at480!.items.find((item) => item.id === "breaker")!.lines).toEqual(["EATON (CUTLER-HAMMER) HKD3400F", "400 A, 3-POLE"]);
    expect(at480!.schedule.find((row) => row.tag === 4)).toMatchObject({ conductors: "2 × 250 kcmil AL 75 °C PER PHASE", ground: "1 AWG AL PER CONDUIT" });
  });

  it("sizes a 208 V connection larger, and leaves the equipment model to the engineer", () => {
    const at208 = designFromRecord(unknownService).designs[1]!;
    const calc = at208.calculations.find((entry) => entry.id === "disc-cb")!;
    expect(calc.steps[1]).toContain("next standard overcurrent device 1000 A");
    expect(calc.result).toBe("3 × 600 kcmil Al per phase, 1020 A ≥ 1000 A");
    expect(at208.items.find((item) => item.id === "breaker")!.lines).toEqual(["1000 A, 3-POLE", "MODEL BY ENGINEER"]);
  });

  it("asks for the panel's ratings instead of guessing them, and names the bus the load-side breaker needs", () => {
    const busbar = designFromRecord(unknownService).designs[0]!.calculations.find((entry) => entry.id === "busbar")!;
    expect(busbar.status).toBe("needs_input");
    expect(busbar.steps).toContain("With a main breaker equal to the bus, the bus must be at least 1875 A.");
    expect(busbar.note).toContain("705.11");
  });

  it("checks the 120% rule from nameplate ratings, and offers a supply-side connection when the bus fails", () => {
    const known = (main: number, bus: number) =>
      designFromRecord(record([value("service_voltage", { type: "text", value: "480Y/277 V" }, "verified"), value("main_device_rating", { type: "quantity", value: main, unit: "A" }), value("bus_rating", { type: "quantity", value: bus, unit: "A" })], site));
    const fails = known(1600, 1600).designs;
    expect(fails).toHaveLength(1);
    expect(fails[0]!.calculations.find((entry) => entry.id === "busbar")).toMatchObject({ status: "fails", result: "1975 A > 1920 A", note: expect.stringContaining("supply-side connection under 2023 NEC 705.11") });
    expect(known(800, 1600).designs[0]!.calculations.find((entry) => entry.id === "busbar")).toMatchObject({ status: "passes", result: "1175 A ≤ 1920 A" });
  });

  it("labels the run length and its voltage drop as estimates", () => {
    const design = designFromRecord(unknownService);
    expect(design.inputs.runLengthFt).toMatchObject({ state: "estimate", source: "shortest plausible run, straight line, open ground to the inferred service entrance" });
    // From the synthetic pad's north edge, 0.0004 degrees of latitude (about 146 ft) south of the entrance, not from its center.
    expect(design.inputs.runLengthFt.value).toBe(146);
    const drop = design.designs[0]!.calculations.find((entry) => entry.id === "voltage-drop")!;
    expect(drop.title).toContain("(ESTIMATE)");
    expect(drop.note).toContain("Estimate");
  });

  it("needs input for the run and the fault current when the record has neither", () => {
    const bare = designFromRecord(record([]));
    const calc = (id: string) => bare.designs[0]!.calculations.find((entry) => entry.id === id)!;
    expect(calc("voltage-drop").status).toBe("needs_input");
    expect(calc("fault-current").status).toBe("needs_input");
    expect(bare.inputs.utility).toMatchObject({ state: "missing", value: null });
  });
});

describe("the single-line drawing", () => {
  const svg = singleLineSvg(designFromRecord(unknownService));

  it("follows the sheet conventions and says it's concept-grade and not for construction", () => {
    expect(svg).toContain('font-family="Arial, Helvetica, sans-serif"');
    expect(svg).toContain("NOT FOR CONSTRUCTION");
    expect(svg).toContain(CONCEPT_NOTE);
    expect(svg).toContain("(E) MAIN DISTRIBUTION PANEL");
    expect(svg).toContain("(N) BATTERY ENERGY STORAGE SYSTEM");
    expect(svg).toContain("SERVICE VOLTAGE NOT CONFIRMED: THIS SHEET ASSUMES 480Y/277 V");
    expect(svg).toContain('stroke-dasharray="10 6"');
  });

  it("never claims approval or compliance", () => {
    expect(svg).not.toMatch(/approved|compliant/i);
  });
});

describe("the package", () => {
  it("imports no Node built-in in code the browser loads", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))) {
      expect(readFileSync(`${dir}/${name}`, "utf8"), name).not.toMatch(/from "node:/);
    }
  });
});

describe("the concept site layout", () => {
  it("places the pad, disconnect, trench route, and new breaker as concept features for the site plan to draw", () => {
    const features = conceptSiteLayout(unknownService);
    expect(features.map((feature) => (feature.attributes!.equipment_type as { value: string }).value)).toEqual(["bess_pad", "ac_disconnect", "trench_route", "new_breaker"]);
    for (const feature of features) {
      expect(feature.label).toContain("CONCEPT LOCATION, NOT A DESIGN");
      expect(feature.attributes!.basis).toEqual({ type: "text", value: "concept" });
    }
    const trench = features.find((feature) => feature.id === "concept-trench-route")!;
    expect(trench).toMatchObject({ kind: "utility_line", attributes: { line_class: { value: "proposed trench route, concept" }, distance_ft: { value: 146, unit: "ft" } } });
  });

  it("draws nothing when the record has no open ground", () => {
    expect(conceptSiteLayout(record([]))).toEqual([]);
  });
});

describe("single-line boxes", () => {
  it("size to their lines, so the main panel's three lines stay inside it", () => {
    const svg = singleLineSvg(designFromRecord(unknownService));
    const panel = /<rect x="70" y="(\d+)" width="500" height="(\d+)"[^>]*\/><text[^>]*>\(E\) MAIN DISTRIBUTION PANEL/.exec(svg)!;
    expect(Number(panel[2])).toBe(36 + 3 * 15 + 8);
    const top = Number(panel[1]);
    const lastLine = [...svg.slice(panel.index).matchAll(/<text x="84" y="(\d+)"/g)].map((match) => Number(match[1]))[3]!;
    expect(lastLine).toBeLessThan(top + Number(panel[2]));
  });

  it("calls voltage drop over 3% a recommendation exceeded, not a failure", () => {
    const far = record([], [
      { id: "pad", kind: "candidate_area", field: "pad_zone_x_ft", geometry: square(-71.5, 42.2, 0.0002) },
      { id: "b", kind: "building_outline", field: "building_outline", geometry: square(-71.5, 42.21, 0.0002) },
    ] as MapFeature[]);
    const drop = designFromRecord(far).designs[1]!.calculations.find((entry) => entry.id === "voltage-drop")!;
    expect(drop.status).toBe("over_recommendation");
    expect(drop.result).toContain("exceeds the 3% recommendation (informational, not a code requirement)");
    expect(singleLineSvg(designFromRecord(far), 1)).toContain("OVER 3% RECOMMENDATION");
  });
});
