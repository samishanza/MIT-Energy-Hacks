import { californiaPge } from "../config/california-pge.ts";
import { massachusetts } from "../config/massachusetts.ts";
import type { RegionConfig } from "./registry.ts";

export const REGIONS: RegionConfig[] = [massachusetts, californiaPge];

export * from "./arcgis.ts";
export * from "./collect.ts";
export * from "./derive.ts";
export * from "./fields.ts";
export * from "./fixtures.ts";
export * from "./geocode.ts";
export * from "./registry.ts";
export * from "./resolve-site.ts";
export * from "./units.ts";
export { massachusetts, californiaPge };
