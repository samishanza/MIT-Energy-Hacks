import type { RegionConfig } from "../src/registry.ts";
import { californiaPge } from "./california-pge.ts";
import { massachusetts } from "./massachusetts.ts";

export const REGIONS: RegionConfig[] = [massachusetts, californiaPge];

export { californiaPge, massachusetts };
