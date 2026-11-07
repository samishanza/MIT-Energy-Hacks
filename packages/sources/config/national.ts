import type { JsonSource } from "../src/json-api.ts";

const ELEVATION_FIELD = "ground_elevation_ft";

// The service marks a point with no data using a large negative number.
const usable = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > -1000;

export const usgsPointElevation: JsonSource = {
  id: "usgs-epqs",
  name: "USGS Elevation Point Query Service",
  url: "https://epqs.nationalmap.gov/v1/json",
  licenseNote: "USGS-produced data is public domain, with credit requested. Its robots.txt request returned 403, so no rule was read. Answers can be intermittent.",
  robotsChecked: "2026-11-07",
  fields: [ELEVATION_FIELD],
  params: ({ location: [longitude, latitude] }) => ({ x: String(longitude), y: String(latitude), wkid: "4326", units: "Feet", includeDate: "false" }),
  read: (body) => {
    const raw = (body as { value?: unknown }).value;
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (!usable(value)) return [];
    return [{ field: ELEVATION_FIELD, value: { type: "quantity", value: Math.round(value * 10) / 10, unit: "ft" }, attribute: "value", grade: "reference" }];
  },
  emptyReason: "The elevation service holds no value at this point.",
};
