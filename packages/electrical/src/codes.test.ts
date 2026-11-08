import { describe, expect, it } from "vitest";
import type { RecordVersion } from "@eqore/contract";
import { jurisdictionFor } from "./codes.ts";

const record = (region: string, town: string | null) =>
  ({ site: { region }, values: town ? [{ field: "municipality", state: "inferred", current: { type: "text", value: town } }] : [], synthetic: true }) as unknown as RecordVersion;

describe("jurisdiction and codes", () => {
  it("names the town as the AHJ and lists Massachusetts' adopted codes", () => {
    const found = jurisdictionFor(record("massachusetts", "WEST BOYLSTON"));
    expect(found.ahj).toBe("West Boylston, MA: building department, wiring inspector, and fire department");
    expect(found.codes.map((entry) => entry.short)).toEqual(["527 CMR 12.00 (NFPA 70, 2026)", "527 CMR 1.00 (NFPA 1, 2021; ch. 52 from NFPA 855, 2020)", "780 CMR, 10th edition (IBC 2021)"]);
  });

  it("says when the calculations' code edition differs from the adopted one", () => {
    expect(jurisdictionFor(record("massachusetts", null))).toMatchObject({ ahj: null, calculationNote: "Concept calculations use NFPA 70, 2023 edition tables; the adopted code is NFPA 70, 2026 edition." });
  });

  it("leaves a region with no codes configured empty", () => {
    expect(jurisdictionFor(record("california-pge", "FREMONT"))).toEqual({ ahj: null, codes: [], checked: null, calculationNote: null });
  });
});
