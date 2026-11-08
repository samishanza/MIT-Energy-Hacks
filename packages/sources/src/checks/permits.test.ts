import { describe, expect, it } from "vitest";
import { cambridgeElectricalPermits, parsePermitText, somervilleElectricalPermits } from "./permits.ts";

const request = (address: string) => ({ location: [-71.1, 42.37] as [number, number], address });

describe("reading service values from permit text", () => {
  it("reads amps, voltage, and phases from a service clause", () => {
    expect(parsePermitText("Upgrade electrical service to 1200 amp 277/480 volt 3 phase")).toEqual({ amps: 1200, volts: "277/480 V", phase: 3 });
    expect(parsePermitText("New 400A 120/208V three-phase service")).toEqual({ amps: 400, volts: "120/208 V", phase: 3 });
  });

  it("ignores a sub panel, a feeder, or temporary power", () => {
    expect(parsePermitText("Install new 100 amp sub panel and power walk in freezer")).toEqual({});
    expect(parsePermitText("Run 225 amp feeder to new panel in the service room")).toEqual({});
    expect(parsePermitText("Temporary service 200 amp for construction")).toEqual({});
  });

  it("reads a transformer only when it's on a pad, a pole, or the utility's", () => {
    expect(parsePermitText("Set 500 kVA pad mount transformer")).toEqual({ transformerKva: 500 });
    expect(parsePermitText("Install 75 kVA transformer, 120/208 volt panelboard for EV chargers")).toEqual({});
  });
});

describe("the city permit sources", () => {
  it("reads Cambridge's structured service fields, citing the permit and its date", () => {
    const rows = [
      { id: "2", issue_date: "2025-03-01T00:00:00.000", description: "Street light repair" , amps_existing_service: "50" },
      { id: "1", issue_date: "2024-05-01T00:00:00.000", description: "EV chargers", amps_existing_service: "1200", volts_existing_service: "480", underground_existing: "true" },
    ];
    const readings = cambridgeElectricalPermits.read(rows);
    expect(readings.map((reading) => [reading.field, reading.value])).toEqual([
      ["electrical_permit_history", { type: "text", value: "2 electrical permits on file, the latest issued 2025-03-01" }],
      ["service_size_a", { type: "quantity", value: 1200, unit: "A" }],
      ["service_voltage", { type: "text", value: "480 V" }],
      ["service_construction", { type: "text", value: "underground" }],
    ]);
    expect(readings[1]!.reason).toContain("permit 1, issued 2024-05-01");
    expect(readings[1]!.reason).toContain("existing service fields record 1200 A, 480 V, underground");
  });

  it("reads Somerville's permit text, citing the open database license", () => {
    const rows = [{ application_number: "E1", issue_date: "2023-01-02T00:00:00.000", project_description_or_business_name: "Replace 800 amp 120/208 volt 3 phase service" }];
    const readings = somervilleElectricalPermits.read(rows);
    expect(readings.map((reading) => reading.field)).toEqual(["electrical_permit_history", "service_size_a", "service_voltage", "service_phase"]);
    expect(readings[0]!.reason).toContain("ODbL");
  });

  it("only applies to its own city, and sends a quoted-safe address prefix", () => {
    expect(cambridgeElectricalPermits.cities).toEqual(["CAMBRIDGE"]);
    const params = cambridgeElectricalPermits.params(request("12 O'Brien Hwy, Cambridge, MA")) as Record<string, string>;
    expect(params.$where).toBe("upper(full_address) like '12 OBRIEN%'");
  });
});
