import type { Observation } from "@eqore/contract";
import { observe, queryArcgis, sourceDateOf, type ArcgisFeature, type ArcgisResult, type CollectContext } from "../arcgis.ts";
import type { TerritorySource } from "../registry.ts";

// What each configured grid source found, so the territory can be settled and a missing feeder explained.
export type GridOutcome = { utilityName: string; feederFound: boolean; widened: boolean; searchedMeters: number; failure?: string; barredReason?: string };

export type Territory = { legalName: string; utility: string; feature: ArcgisFeature };

export function queryTerritories(source: TerritorySource, [longitude, latitude]: [number, number], ctx: CollectContext): Promise<ArcgisResult> {
  return queryArcgis(source.entry, { kind: "point", longitude, latitude }, ctx);
}

// One territory per utility, named the way people know it: MASSACHUSETTS ELECTRIC CO is National Grid.
function territoriesOf(source: TerritorySource, result: ArcgisResult): Territory[] {
  const byUtility = new Map<string, Territory>();
  for (const feature of result.features) {
    const legalName = String(feature.attributes[source.nameAttribute] ?? "").trim();
    if (!legalName) continue;
    const utility = source.commonNames[legalName.toUpperCase().replace(/[.,]/g, "").trim()] ?? legalName;
    if (!byUtility.has(utility)) byUtility.set(utility, { legalName, utility, feature });
  }
  return [...byUtility.values()].sort((a, b) => a.utility.localeCompare(b.utility));
}

// Overlapping territories unlikely to serve the site: those with under a tenth of the customers per area of the
// densest territory here. That catches a polygon drawn far larger than the area a utility serves, and a transit
// authority's traction power. They stay listed as mapped here but aren't offered as the serving utility.
export const SPARSE_SHARE = 0.1;

export function likelyServing(source: TerritorySource, territories: Territory[]): Territory[] {
  const density = (territory: Territory) => {
    if (!source.customersAttribute || !source.areaAttribute) return NaN;
    const customers = Number(territory.feature.attributes[source.customersAttribute]);
    const area = Number(territory.feature.attributes[source.areaAttribute]);
    return customers >= 0 && area > 0 ? customers / area : NaN;
  };
  const densest = Math.max(0, ...territories.map(density).filter(Number.isFinite));
  if (densest === 0) return territories;
  return territories.filter((territory) => !(density(territory) < densest * SPARSE_SHARE));
}

const described = (territory: Territory) => (territory.utility === territory.legalName ? territory.legalName : `${territory.utility} (${territory.legalName})`);

function whyNoFeeder(source: TerritorySource, utilities: string[], grid: GridOutcome[]): string {
  return utilities
    .map((utility) => {
      const outcome = grid.find((entry) => entry.utilityName === utility);
      if (outcome?.barredReason) return outcome.barredReason;
      if (outcome?.failure) return `${utility}'s map couldn't be read: ${outcome.failure}.`;
      if (outcome) return `${utility}'s map shows no feeder within ${outcome.searchedMeters} m of this site.`;
      return source.withoutMap[utility] ?? `${utility} publishes no hosting capacity map this tool reads, so ask ${utility} for the feeder.`;
    })
    .join(" ");
}

// Names the utility at any address. Overlapping territories stay candidates, unless one utility's
// own map returned a feeder here, which settles it. The bill confirms either way.
export function servingUtility(source: TerritorySource, result: ArcgisResult, grid: GridOutcome[], ctx: CollectContext): Observation[] {
  if (result.failure) return [observe(result, ctx, { field: "utility_territories", kind: "no_value", value: null, reason: result.failure })];
  const territories = territoriesOf(source, result);
  if (territories.length === 0) {
    return [observe(result, ctx, { field: "utility_territories", kind: "no_value", value: null, reason: "No electric service territory is mapped at this point." })];
  }

  const shared = (territory: Territory) => ({ attribute: source.nameAttribute, objectId: territory.feature.objectId, sourceDate: sourceDateOf(source.entry, territory.feature.attributes), grade: "reference" as const });
  const observations = [
    observe(result, ctx, {
      field: "utility_territories",
      kind: "reading",
      value: { type: "text", value: territories.map(described).join("; ") },
      ...shared(territories[0]!),
      objectId: territories.map((territory) => territory.feature.objectId).sort().join(","),
      reason: "From a coarse national territory map, whose boundaries overlap, so a listed utility may not serve this site. The bill names the utility.",
    }),
  ];

  const withFeeder = new Set(grid.filter((outcome) => outcome.feederFound && !outcome.widened).map((outcome) => outcome.utilityName));
  const settled = territories.filter((territory) => withFeeder.has(territory.utility));
  const likely = likelyServing(source, territories);
  const named = settled.length > 0 ? settled : likely;
  for (const territory of named) {
    const others = territories.filter((other) => !named.includes(other)).map(described);
    const reason =
      settled.length > 0
        ? `${described(territory)} territory, and ${territory.utility}'s map returned a feeder here.${others.length ? ` Also mapped here: ${others.join(", ")}.` : ""}`
        : named.length === 1
          ? `${territories.length === 1 ? "The only service territory mapped here." : `The main service territory mapped here. Also mapped, with far fewer customers for their area, so unlikely here: ${others.join(", ")}.`} The bill confirms the utility.`
          : `One of ${named.length} overlapping service territories mapped here. The territory map is coarse, so some of these utilities may not serve this site. The bill names the utility.${others.length ? ` Also mapped, with far fewer customers for their area, so unlikely here: ${others.join(", ")}.` : ""}`;
    observations.push(observe(result, ctx, { field: "serving_utility", kind: "reading", value: { type: "text", value: territory.utility }, ...shared(territory), reason }));
  }

  if (!grid.some((outcome) => outcome.feederFound)) {
    observations.push(observe(result, ctx, { field: "feeder", kind: "no_value", value: null, reason: whyNoFeeder(source, territories.map((territory) => territory.utility), grid) }));
  }
  return observations;
}
