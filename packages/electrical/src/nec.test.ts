import { describe, expect, it } from "vitest";
import { ampacity, groundingConductor, nextStandardOcpd, resistancePerKft } from "./nec.ts";

// Each value checked against the 2023 NEC (NFPA 70).
describe("2023 NEC Table 310.16, ampacity", () => {
  it.each([
    ["Cu", 75, "2/0", 175],
    ["Cu", 75, "4/0", 230],
    ["Cu", 75, "500", 380],
    ["Cu", 90, "2/0", 195],
    ["Cu", 90, "4/0", 260],
    ["Al", 75, "250", 205],
    ["Al", 75, "4/0", 180],
    ["Al", 75, "500", 310],
    ["Al", 75, "600", 340],
  ] as const)("%s at %d C, %s: %d A", (material, temperature, size, amps) => {
    expect(ampacity(material, temperature, size)).toBe(amps);
  });
});

describe("2023 NEC Table 250.122, equipment grounding conductor", () => {
  it.each([
    [100, "Cu", "8"],
    [100, "Al", "6"],
    [400, "Cu", "3"],
    [400, "Al", "1"],
    [1000, "Cu", "2/0"],
    [1000, "Al", "4/0"],
  ] as const)("%d A, %s: %s", (ocpd, material, size) => {
    expect(groundingConductor(ocpd, material)).toBe(size);
  });
});

describe("2023 NEC 240.6(A), standard ratings", () => {
  it.each([
    [301, 350],
    [375, 400],
    [400, 400],
    [865.4, 1000],
  ])("%d A rounds up to %d A", (amps, rating) => {
    expect(nextStandardOcpd(amps)).toBe(rating);
  });
});

describe("2023 NEC Chapter 9 Table 8, DC resistance at 75 C", () => {
  it.each([
    ["Al", "250", 0.0847],
    ["Cu", "2/0", 0.0967],
    ["Cu", "4/0", 0.0608],
    ["Al", "500", 0.0424],
  ] as const)("%s %s: %d ohm per 1000 ft", (material, size, ohms) => {
    expect(resistancePerKft(material, size)).toBe(ohms);
  });
});
