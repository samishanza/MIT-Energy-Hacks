import type { SpecsPrefill } from "../panels/ElectricalSpecsForm";
import sites from "../../../../fixtures/demo-electrical-specs.json";

// Massachusetts sites whose electrical service is stated in a public document: permits,
// energy audits, bid sets. Each value carries its source, so filling the form records where it came from.

type DemoSite = {
  address: string;
  values: Record<string, string | number | null>;
  sources?: { field: string; url: string; date?: string; note?: string }[];
};

const key = (address: string) => {
  const [street = "", city = ""] = address
    .toLowerCase()
    .replace(/\b\d{5}(-\d{4})?\b/g, "")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/[.#]/g, "")
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, " "));
  return `${street}|${city.split(" (")[0]}`;
};

export function demoSpecsFor(address: string): SpecsPrefill | null {
  const site = (sites as DemoSite[]).find((s) => key(s.address) === key(address));
  if (!site) return null;
  const v = site.values;
  const voltage = typeof v.service_voltage === "string" && /^\d+$/.test(v.service_voltage) ? `${v.service_voltage} V (phase not stated in the source)` : (v.service_voltage as string | null);
  const where = (site.sources ?? []).map((s) => `${s.field}: ${s.url}${s.date ? ` (${s.date})` : ""}`).join("; ");
  const service = v.service_rating_a ? ` Service rating ${v.service_rating_a} A in the source, not the main breaker nameplate.` : "";
  return {
    service_voltage: voltage,
    main_breaker_a: (v.main_breaker_a as number | null) ?? null,
    bus_rating_a: (v.bus_rating_a as number | null) ?? null,
    fault_current_a: (v.fault_current_a as number | null) ?? null,
    meter_number: (v.meter_number as string | null) ?? null,
    source: `Public document: ${where}.${service}`.slice(0, 900),
  };
}
