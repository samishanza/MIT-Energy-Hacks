import { area } from "@turf/turf";
import type { CrossCheck, MapFeature, Observation, Value } from "@eqore/contract";
import { LOT_SIZE_TOLERANCE } from "../fields.ts";
import { normalizeStreet, streetNameOf } from "../resolve-site.ts";
import { convertUnit } from "../units.ts";

// Assessor floor area divided by stories against the mapped roofprints. Floors differ in size, so this is loose.
export const BUILDING_AREA_TOLERANCE = 0.25;
// Roofprints older than the imagery by more than this may miss a building added since.
export const ROOFPRINT_AGE_YEARS = 5;

type Input = { address: string; values: Value[]; observations: Observation[]; features: MapFeature[] };
type Found = { field: string; check: CrossCheck };

const percentApart = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
const shown = (number: number, digits = 0) => number.toLocaleString("en-US", { maximumFractionDigits: digits });
const yearOf = (date: string | null | undefined) => (date ? Number(/\d{4}/.exec(date)?.[0]) || null : null);
const sameName = (a: string, b: string) => a.toUpperCase().replace(/[^A-Z0-9]/g, "") === b.toUpperCase().replace(/[^A-Z0-9]/g, "");

function readings(observations: Observation[], field: string, where: (observation: Observation) => boolean = () => true): Observation[] {
  return observations.filter((observation) => observation.field === field && observation.kind === "reading" && observation.value && where(observation));
}

// The newest reading wins, as the record keeps every older one.
function latest(observations: Observation[], field: string, where?: (observation: Observation) => boolean): Observation | undefined {
  return readings(observations, field, where).at(-1);
}

function quantity(observation: Observation | undefined): number | null {
  return observation?.value?.type === "quantity" ? observation.value.value : null;
}

function text(observation: Observation | undefined): string | null {
  return observation?.value?.type === "text" ? observation.value.value : null;
}

const notChecked = (field: string, label: string, detail: string): Found => ({ field, check: { label, result: "not_checked", detail } });

function lotSize({ observations }: Input): Found {
  const label = "Stated lot size against the parcel polygon";
  const stated = quantity(latest(observations, "lot_size_acres", (observation) => observation.method !== "computed"));
  const drawn = quantity(latest(observations, "lot_size_acres", (observation) => observation.method === "computed"));
  if (stated === null && drawn === null) return notChecked("lot_size_acres", label, "No lot size is recorded here.");
  if (stated === null || drawn === null) return notChecked("lot_size_acres", label, `${stated === null ? "The stated size" : "The polygon"} is missing.`);
  const apart = percentApart(stated, drawn);
  return {
    field: "lot_size_acres",
    check: {
      label,
      result: apart <= LOT_SIZE_TOLERANCE ? "agrees" : "disagrees",
      detail: `Stated ${shown(stated, 3)} acres, polygon ${shown(drawn, 3)} acres: ${shown(apart * 100, 1)}% apart, against a ${LOT_SIZE_TOLERANCE * 100}% tolerance.`,
    },
  };
}

function buildingArea({ observations, features }: Input): Found {
  const label = "Assessor floor area per story against the mapped roofprints";
  const floorArea = quantity(latest(observations, "building_area_sqft"));
  const stories = quantity(latest(observations, "building_stories"));
  const roofprints = features.filter((feature) => feature.kind === "building_outline");
  if (floorArea === null || stories === null || roofprints.length === 0) {
    const missing = [floorArea === null && "the assessor's floor area", stories === null && "the number of stories", roofprints.length === 0 && "roofprints"].filter(Boolean).join(" and ");
    return notChecked("building_area_sqft", label, `Missing ${missing}.`);
  }
  const roofprintArea = roofprints.reduce((sum, feature) => sum + convertUnit(area(feature.geometry), "sqm", "sqft"), 0);
  const perStory = floorArea / stories;
  const apart = percentApart(perStory, roofprintArea);
  return {
    field: "building_area_sqft",
    check: {
      label,
      result: apart <= BUILDING_AREA_TOLERANCE ? "agrees" : "disagrees",
      detail: `${shown(floorArea)} sq ft over ${stories} stories is about ${shown(perStory)} sq ft a story. The ${roofprints.length} mapped roofprints total ${shown(roofprintArea)} sq ft: ${shown(apart * 100)}% apart, against a ${BUILDING_AREA_TOLERANCE * 100}% tolerance, because floors differ in size.`,
    },
  };
}

// A point within the range a 10 m grid finds across the site, give or take this much.
export const ELEVATION_TOLERANCE_FT = 5;

function elevation({ observations }: Input): Found {
  const label = "USGS point elevation against the 3DEP range across the site";
  const point = quantity(latest(observations, "ground_elevation_ft", (observation) => observation.source.kind === "json_api"));
  const low = quantity(latest(observations, "site_elevation_min_ft"));
  const high = quantity(latest(observations, "site_elevation_max_ft"));
  if (point === null || low === null || high === null) return notChecked("ground_elevation_ft", label, `${point === null ? "The USGS point elevation" : "The 3DEP range across the site"} is missing.`);
  const within = point >= low - ELEVATION_TOLERANCE_FT && point <= high + ELEVATION_TOLERANCE_FT;
  return {
    field: "ground_elevation_ft",
    check: {
      label,
      result: within ? "agrees" : "disagrees",
      detail: `The point reads ${shown(point, 1)} ft, and the 10 m grid ranges ${shown(low, 1)} to ${shown(high, 1)} ft across the site, with ${ELEVATION_TOLERANCE_FT} ft of tolerance. Both come from USGS 3DEP, at different resolutions, so this catches a misplaced point more than an error in the data.`,
    },
  };
}

function servingUtility({ observations }: Input): Found[] {
  const label = (utility: string) => `${utility}'s feeder against the mapped service territories`;
  const feederUtilities = [...new Set(readings(observations, "serving_utility", (observation) => observation.locator.attribute === "configured service that returned a feeder").map((observation) => text(observation)!))];
  const territories = text(latest(observations, "utility_territories"));
  if (feederUtilities.length === 0) return [notChecked("serving_utility", "A utility's feeder against the mapped service territories", "No utility's map returned a feeder within its first search distance.")];
  if (territories === null) return feederUtilities.map((utility) => notChecked("serving_utility", label(utility), "No service territory is mapped here."));
  return feederUtilities.map((utility) => ({
    field: "serving_utility",
    check: {
      label: label(utility),
      result: territories.includes(utility) ? "agrees" : "disagrees",
      detail: territories.includes(utility) ? `${utility}'s map returned a feeder, and its territory is mapped here: ${territories}.` : `${utility}'s map returned a feeder, but the territories mapped here are ${territories}.`,
    },
  }));
}

// The same feeder is described by several of its utility's layers. Their voltage and substation should match.
function feederAcrossLayers({ observations }: Input): Found[] {
  const feeders = readings(observations, "feeder");
  if (feeders.length === 0) return [notChecked("feeder", "Feeder voltage and substation across the utility's layers", "No feeder candidate to compare.")];
  return [...new Set(feeders.map((feeder) => feeder.locator.objectId!))].map((id) => {
    const label = `${text(feeders.find((feeder) => feeder.locator.objectId === id))}: voltage and substation across the utility's layers`;
    const of = (field: string) => readings(observations, field, (observation) => observation.locator.objectId === id);
    const voltages = [...of("feeder_voltage"), ...of("feeder_layer_voltage"), ...of("feeder_nodal_voltage")].map(quantity).filter((voltage): voltage is number => voltage !== null);
    const substations = [...of("feeder_substation"), ...of("feeder_layer_substation"), ...of("feeder_nodal_substation")].map(text).filter((name): name is string => name !== null);
    if (voltages.length < 2 && substations.length < 2) return notChecked("feeder", label, "Only one layer describes this feeder.");
    const voltageAgrees = voltages.every((voltage) => voltage === voltages[0]);
    const substationAgrees = substations.every((name) => sameName(name, substations[0]!));
    return {
      field: "feeder",
      check: {
        label,
        result: voltageAgrees && substationAgrees ? "agrees" : "disagrees",
        detail: `Voltages ${[...new Set(voltages)].join(", ")} kV across ${voltages.length} layers; substations ${[...new Set(substations)].join(", ")} across ${substations.length}.`,
      },
    };
  });
}

function roofprintAge({ observations }: Input): Found {
  const label = "Roofprint date against the imagery date";
  const outline = latest(observations, "building_outline");
  const roofprint = yearOf(outline?.sourceDate);
  const imagery = yearOf(latest(observations, "aerial_image")?.sourceDate);
  if (!outline) return notChecked("building_outline", label, "No roofprint is recorded here.");
  if (roofprint === null || imagery === null) return notChecked("building_outline", label, `${roofprint === null ? "The roofprint" : "The imagery"} has no stated date.`);
  const gap = imagery - roofprint;
  return {
    field: "building_outline",
    check: {
      label,
      result: gap <= ROOFPRINT_AGE_YEARS ? "agrees" : "disagrees",
      detail: `Roofprints from ${roofprint}, imagery from ${imagery}. ${gap > ROOFPRINT_AGE_YEARS ? `More than ${ROOFPRINT_AGE_YEARS} years apart, so a building added since may be missing from the outlines.` : `Within ${ROOFPRINT_AGE_YEARS} years.`}`,
    },
  };
}

function roadSide({ address, observations }: Input): Found {
  const label = "Road side against the fronting road mapped nearest";
  const side = latest(observations, "road_side");
  const road = latest(observations, "road_name");
  const street = streetNameOf(address);
  if (!side || !road || !street) return notChecked("road_side", label, `${!side ? "The road side" : !road ? "The fronting road" : "The address's street"} is missing.`);
  const agrees = normalizeStreet(text(road)!) === street;
  return {
    field: "road_side",
    check: {
      label,
      result: agrees ? "agrees" : "disagrees",
      detail: agrees ? `Both name ${street}, the street in the address.` : `The road side is measured from ${street}, but the road mapped nearest is ${text(road)}.`,
    },
  };
}

// Tests independent sources against each other. A check only flags: it changes neither a value's state nor its reading.
export function crossCheck(input: Input): Value[] {
  const found = [lotSize(input), buildingArea(input), elevation(input), ...servingUtility(input), ...feederAcrossLayers(input), roofprintAge(input), roadSide(input)];
  return input.values.map((value) => {
    const checks = found.filter((entry) => entry.field === value.field).map((entry) => entry.check);
    if (checks.length === 0) return value;
    const disagreements = checks.filter((check) => check.result === "disagrees").map((check) => `Cross-check disagrees: ${check.label}. ${check.detail ?? ""}`.trim());
    return { ...value, crossChecks: checks, flags: [...value.flags, ...disagreements] };
  });
}

export function crossCheckCounts(values: Value[]) {
  const counts = { agrees: 0, disagrees: 0, not_checked: 0 };
  for (const value of values) for (const check of value.crossChecks ?? []) counts[check.result] += 1;
  return counts;
}
