import type { BaseMap, MapFeature, Observation, Site, SourceRun } from "@eqore/contract";
import { observe, type CollectContext } from "./arcgis.ts";
import { collectGrid } from "./checks/grid.ts";
import { collectPhysical } from "./checks/physical.ts";
import type { NamedRoute, RegionConfig } from "./registry.ts";
import type { SiteAnchor } from "./resolve-site.ts";

export type SiteCollection = {
  site: Site;
  observations: Observation[];
  features: MapFeature[];
  baseMap: BaseMap | null;
  sourceRuns: SourceRun[];
};

export function siteIdFor(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function routeObservations(route: NamedRoute, kind: "earth_engine" | "human_evidence", ctx: CollectContext): Observation[] {
  const origin = {
    source: { id: route.sourceId, name: route.name, kind, dataOrigin: "real" as const },
    query: `route ${route.sourceId}`,
    retrievedAt: ctx.now(),
  };
  return route.fields.map((field) => observe(origin, ctx, { field, kind: "no_value", value: null, reason: route.reason }));
}

// Runs every source configured for the region. A failed source reports its reason, and the rest still run.
export async function collectSite(address: string, region: RegionConfig, anchor: SiteAnchor, ctx: CollectContext): Promise<SiteCollection> {
  const physical = await collectPhysical(region, anchor, ctx);
  const grid = await collectGrid(
    region,
    physical.parcelGeometry ? { parcel: physical.parcelGeometry } : { longitude: physical.location[0], latitude: physical.location[1] },
    ctx,
  );
  const unavailable = region.unavailable.flatMap((route) => routeObservations(route, "earth_engine", ctx));
  const personRoutes = region.personRoutes.flatMap((route) => routeObservations(route, "human_evidence", ctx));

  return {
    site: {
      id: ctx.siteId,
      address,
      region: region.id,
      location: physical.location,
      locationMethod: physical.locationMethod,
    },
    observations: [...physical.observations, ...grid.observations, ...unavailable, ...personRoutes],
    features: [...physical.features, ...grid.features],
    baseMap: physical.baseMap,
    sourceRuns: [
      ...physical.runs,
      ...grid.runs,
      ...region.unavailable.map((route): SourceRun => ({ sourceId: route.sourceId, name: route.name, status: "missing", reason: route.reason })),
      ...region.personRoutes.map((route): SourceRun => ({ sourceId: route.sourceId, name: route.name, status: "person_only", reason: route.reason })),
    ],
  };
}
