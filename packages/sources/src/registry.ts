import type { FitnessGrade, MapFeature, ObservedValue, Source } from "@eqore/contract";
import type { JsonSource } from "./json-api.ts";
import { parseAddress } from "./resolve-site.ts";

// How a date in a source's attributes is written.
export type SourceDateFormat = "fiscal_year" | "yyyymmdd" | "epoch_ms" | "text";

export type FieldMapping = {
  field: string;
  grade: FitnessGrade;
  // Exactly one of these supplies the value.
  attribute?: string;
  constant?: ObservedValue;
  type?: "text" | "quantity";
  unit?: string;
  // The unit the service publishes, when it differs from the record's unit.
  sourceUnit?: string;
  // For quantities that can't truly be zero, such as a building's area.
  zeroIsMissing?: boolean;
  // Text a source uses to mean it has no value, such as a surface type of 0.
  blankValues?: string[];
};

export type ArcgisEntry = {
  kind: "arcgis_rest";
  id: string;
  name: string;
  serviceUrl: string;
  layer: number;
  // Applied to every geometry query from this entry and stored on each observation.
  searchRadiusMeters: number;
  licenseNote: string;
  robotsChecked: string;
  // When set, the entry is never queried and appears only as a route for a person.
  barred?: { reason: string; personRoute: string };
  fields: FieldMapping[];
  outFields: string[];
  // Identifies one feature across reads.
  objectIdAttribute: string;
  sourceDate?: { attribute: string; format: SourceDateFormat } | { fixed: string };
  // Line sections of one feeder arrive as many features; keep the nearest section of each.
  groupByAttribute?: string;
};

export type ParcelLookup = {
  entry: ArcgisEntry;
  addressAttribute: string;
  cityAttribute: string;
  idAttribute: string;
  useAttribute: string;
  lotSizeAttribute: string;
  lotUnitsAttribute: string;
  yearBuiltAttribute: string;
  storiesAttribute?: string;
};

export type BuildingOutlines = {
  entry: ArcgisEntry;
  idAttribute: string;
  sourceDateAttribute: string;
};

export type RoadSource = {
  entry: ArcgisEntry;
  nameAttribute: string;
};

export type GridSource = {
  entry: ArcgisEntry;
  utilityName: string;
  // For a service whose capacity layer returns attributes only, the layer that draws the same feeders.
  lineGeometry?: ArcgisEntry;
};

export type ImageryConfig = {
  id: string;
  name: string;
  serviceUrl: string;
  tileUrlTemplate: string;
  attribution: string;
  sourceDate: string;
  maxZoom: number;
  licenseNote: string;
  description: string;
};

// A source nobody can query automatically, or one not available in this build.
export type NamedRoute = {
  sourceId: string;
  name: string;
  fields: string[];
  reason: string;
};

// One layer a region collects, which needs no code to add.
export type LayerSource = {
  entry: ArcgisEntry;
  mode:
    | {
        // One answer for the site, read through the entry's field table.
        kind: "one";
        pick: "first" | "address_street" | "all_distinct";
        streetAttribute?: string;
        emptyReason?: string;
      }
    | {
        // Many nearby items, stored as one summary reading plus a map feature for each item.
        kind: "items";
        field: string;
        noun: string;
        plural: string;
        nameAttribute: string;
        feature: MapFeature["kind"];
        limit: number;
        // Whether an empty search means none are mapped here, or says nothing either way.
        absent: "none_mapped" | "unknown";
        note?: string;
      };
};

export type LidarSlope = { source: Source; sourceDate: string };

export type RegionConfig = {
  id: string;
  name: string;
  states: string[];
  // A region naming cities wins over one covering its whole state.
  cities?: string[];
  parcels?: ParcelLookup;
  buildings?: BuildingOutlines;
  grid: GridSource[];
  roads?: RoadSource;
  layers?: LayerSource[];
  jsonSources?: JsonSource[];
  lidarSlope?: LidarSlope;
  imagery?: ImageryConfig;
  // Sources with no working adapter yet. They report missing with the reason.
  unavailable: NamedRoute[];
  personRoutes: NamedRoute[];
};

export function selectRegion(address: string, regions: RegionConfig[]): RegionConfig | null {
  const parsed = parseAddress(address);
  if (!parsed?.state) return null;
  const inState = regions.filter((region) => region.states.includes(parsed.state!));
  const inCity = inState.find((region) => region.cities?.some((city) => city.toUpperCase() === parsed.city));
  return inCity ?? inState.find((region) => !region.cities) ?? null;
}

export function sourceOf(entry: ArcgisEntry): Source {
  return {
    id: entry.id,
    name: entry.name,
    kind: "arcgis_rest",
    dataOrigin: "real",
    url: entry.serviceUrl,
    layer: String(entry.layer),
    licenseNote: entry.licenseNote,
  };
}
