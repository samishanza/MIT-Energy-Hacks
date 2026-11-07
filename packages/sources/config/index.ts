import type { RegionConfig } from "../src/registry.ts";
import { californiaPge } from "./california-pge.ts";
import { massachusetts } from "./massachusetts.ts";

// Adding a region means adding its file here.
export const REGIONS: RegionConfig[] = [massachusetts, californiaPge];

export { californiaPge, massachusetts };
