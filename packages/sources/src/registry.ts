import type { FitnessGrade, MapFeature, ObservedValue, Source } from "@eqore/contract";
import type { LidarConfig } from "./checks/lidar-collect.ts";
import type { EarthEngineConfig } from "./earthengine.ts";
import type { JsonSource } from "./json-api.ts";
import type { Transform } from "./transforms.ts";
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
  // Numbers a source uses to mean it has no value, such as -99.99.
  sentinels?: number[];
  transform?: Transform;
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
  // Asks for attributes only, for layers whose shapes are too large to keep, such as service territories.
  attributesOnly?: boolean;
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
  // How far from a geocoded point to look for the parcel when the address doesn't match as written.
  nearbyMeters?: number;
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
  // A wider search when nothing is mapped within the entry's radius, as downtown, where lines are drawn along streets.
  widenToMeters?: number;
  // Other layers of the same utility, joined to each feeder candidate by the feeder's id.
  details?: FeederDetail[];
  // Line segments near the site, drawn as mapped, with how each is built. They also show how the building is likely fed.
  segments?: LineSegments;
};

export type LineSegments = {
  entries: ArcgisEntry[];
  // The search reaches at least this far, so a line just beyond the feeder search still shows.
  searchMeters: number;
  feederAttribute: string;
  constructionAttribute: string;
  phasesAttribute: string;
  // Construction codes to words, such as OH to overhead.
  construction: Record<string, string>;
};

export type FeederDetail =
  // One row per feeder, found by its id.
  | { kind: "by_feeder"; entry: ArcgisEntry; joinAttribute: string }
  // Rows along the feeder, of which the one nearest the site is kept.
  | { kind: "nearest"; entry: ArcgisEntry; joinAttribute: string }
  // Overhead and underground segments across several layers, read as the share underground by mapped length.
  | { kind: "construction"; entries: ArcgisEntry[]; joinAttribute: string; constructionAttribute: string; lengthAttribute: string; underground: string; field: string };

export type TerritorySource = {
  entry: ArcgisEntry;
  nameAttribute: string;
  // Legal names to the names people use, such as MASSACHUSETTS ELECTRIC CO to National Grid.
  commonNames: Record<string, string>;
  // Why a utility with no map this tool reads has no feeder, by its common name.
  withoutMap: Record<string, string>;
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

export type LayerSource = {
  entry: ArcgisEntry;
  mode:
    | {
        // One answer for the site, read through the entry's field table.
        kind: "one";
        pick: "first" | "address_street";
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
        // Words before each item's name on the map, such as "Transmission line ".
        labelPrefix?: string;
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
  // Villages that assessors file under their town, such as Hyannis under Barnstable.
  villages?: Record<string, string>;
  territories?: TerritorySource;
  parcels?: ParcelLookup;
  buildings?: BuildingOutlines;
  grid: GridSource[];
  roads?: RoadSource;
  layers?: LayerSource[];
  jsonSources?: JsonSource[];
  lidarSlope?: LidarSlope;
  earthEngine?: EarthEngineConfig;
  lidarPoints?: LidarConfig;
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
