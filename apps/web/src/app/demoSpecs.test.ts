import { describe, expect, it } from "vitest";
import { demoSpecsFor } from "./demoSpecs";

describe("public electrical specs for demo sites", () => {
  it("matches an address however it's written, and keeps the main breaker the source states", () => {
    const kent = demoSpecsFor("22 Kent Street, Somerville, MA");
    expect(kent?.main_breaker_a).toBe(2500);
    expect(kent?.service_voltage).toBe("480Y/277");
    expect(kent?.source).toMatch(/^Public document: /);
  });

  it("doesn't guess wye or delta from a bare voltage, and doesn't call a service rating a main breaker", () => {
    const police = demoSpecsFor("125 Sixth St, Cambridge, MA 02142");
    expect(police?.service_voltage).toBe("480 V (phase not stated in the source)");
    expect(police?.main_breaker_a).toBeNull();
    expect(police?.source).toMatch(/not the main breaker nameplate/);
  });

  it("returns nothing for a site without a public document", () => {
    expect(demoSpecsFor("100 Research Dr, Worcester, MA")).toBeNull();
  });
});
