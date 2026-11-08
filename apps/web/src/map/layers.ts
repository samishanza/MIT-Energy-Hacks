import type { BaseMap, Geometry, MapFeature, ObservedValue, Value } from "@eqore/contract";
import type { AddLayerObject } from "maplibre-gl";

export const FEATURE_SOURCE = "features";
export const BASE_SOURCE = "base";

const selected = ["boolean", ["feature-state", "selected"], false];
const SELECTION_COLOR = "#f05a00";

export const ZONE_TIERS = ["remote", "near_exposure", "exception", "excluded", "unknown"] as const;
export type ZoneTier = (typeof ZONE_TIERS)[number];

export type LayerKey =
  | "equipment"
  | "dimensions"
  | "buildings"
  | "lot"
  | `zone_${ZoneTier}`
  | "utility"
  | "substations"
  | "fire_stations"
  | "wetlands"
  | "paved"
  | "constraints"
  | "roads"
  | "feasible"
  | "feasible_outer";

// Legend order, which is also the order things are picked from the top.
export const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "feasible", label: "Battery zone" },
  { key: "feasible_outer", label: "Battery zone, longer runs" },
  { key: "equipment", label: "Electrical equipment" },
  { key: "dimensions", label: "Dimension lines" },
  { key: "buildings", label: "Buildings" },
  { key: "lot", label: "Lot" },
  { key: "zone_remote", label: "Zone: remote" },
  { key: "zone_near_exposure", label: "Zone: near exposures" },
  { key: "zone_exception", label: "Zone: only with an exception" },
  { key: "zone_excluded", label: "Zone: excluded" },
  { key: "zone_unknown", label: "Open ground" },
  { key: "utility", label: "Utility lines" },
  { key: "substations", label: "Substations" },
  { key: "fire_stations", label: "Fire stations" },
  { key: "wetlands", label: "Wetlands" },
  { key: "paved", label: "Paved parking and drives" },
  { key: "constraints", label: "Other mapped constraints" },
  { key: "roads", label: "Roads" },
];

export const ZONE_WORDS: Record<ZoneTier, string> = {
  remote: "Remote: more than 100 ft from buildings, buildable lot lines, and public ways",
  near_exposure: "Near exposures: at least 10 ft from them",
  exception: "Eligible only with an exception, such as a fire barrier or a tested enclosure",
  excluded: "Excluded",
  unknown: "Tier not given",
};

const textOf = (value: ObservedValue) => (value.type === "text" ? value.value : "");

// Tier names aren't fixed in the contract, so common spellings are read loosely.
export function zoneTier(feature: MapFeature): ZoneTier {
  const raw = feature.attributes?.tier;
  const tier = raw ? textOf(raw).toLowerCase() : "";
  if (tier.includes("remote")) return "remote";
  if (tier.includes("exception")) return "exception";
  if (tier.includes("near") || tier.includes("exposure")) return "near_exposure";
  if (tier.includes("exclu")) return "excluded";
  return "unknown";
}

export function layerOf(feature: MapFeature): LayerKey {
  switch (feature.kind) {
    case "existing_equipment":
    case "capture_pin":
      return "equipment";
    case "dimension_line":
      return "dimensions";
    case "building_outline":
      return "buildings";
    case "property_line":
      return "lot";
    case "candidate_area":
      {
        const kind = String((feature.attributes?.["zone_kind"] as { value?: unknown } | undefined)?.value ?? "");
        if (kind === "feasible_bess_recommended") return "feasible";
        if (kind.startsWith("feasible_bess")) return "feasible_outer";
      }
      return `zone_${zoneTier(feature)}`;
    case "utility_line":
      return "utility";
    case "substation":
      return "substations";
    case "road":
      return "roads";
    case "constraint":
      if (/fire_station/.test(feature.field)) return "fire_stations";
      if (/wetland/.test(feature.field)) return "wetlands";
      if (/paved/.test(feature.field)) return "paved";
      return "constraints";
  }
}

export const isPoint = (feature: MapFeature) => feature.geometry.type === "Point";

export const isEquipmentPoint = (feature: MapFeature) =>
  feature.kind === "existing_equipment" || feature.kind === "capture_pin";

export const pointFeatures = (features: MapFeature[]) => features.filter(isPoint);

type Position = [number, number];

function positionsOf(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "LineString":
      return geometry.coordinates;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
  }
}

export function boundsOf(features: MapFeature[]): [Position, Position] | null {
  const all = features.flatMap((feature) => positionsOf(feature.geometry));
  if (all.length === 0) return null;
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

export function centerOf(feature: MapFeature): Position {
  if (feature.geometry.type === "Point") return feature.geometry.coordinates;
  if (feature.geometry.type === "LineString") {
    const line = feature.geometry.coordinates;
    const [a, b] = [line[0]!, line[line.length - 1]!];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  const [[west, south], [east, north]] = boundsOf([feature])!;
  return [(west + east) / 2, (south + north) / 2];
}

// Shoelace on the outer ring, scaled for latitude. Only used to compare buildings on one site.
function relativeArea(feature: MapFeature): number {
  const rings =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates[0] ?? []]
      : feature.geometry.type === "MultiPolygon"
        ? feature.geometry.coordinates.map((polygon) => polygon[0] ?? [])
        : [];
  const scale = Math.cos(((rings[0]?.[0]?.[1] ?? 0) * Math.PI) / 180);
  return rings.reduce((total, ring) => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i]![0] * scale * ring[i + 1]![1] - ring[i + 1]![0] * scale * ring[i]![1];
    return total + Math.abs(sum) / 2;
  }, 0);
}

const FEET_PER_METER = 3.28084;

function feetOf(value: ObservedValue | null | undefined): number | null {
  if (value?.type !== "quantity") return null;
  if (value.unit === "ft") return value.value;
  if (value.unit === "m") return value.value * FEET_PER_METER;
  return null;
}

// A building is raised only from a height on record: its own, or the site's estimate for the main building,
// which the record takes to be the largest roofprint. Others stay flat rather than get an invented height.
export function buildingHeights(features: MapFeature[], values: Value[]): Map<string, number> {
  const heights = new Map<string, number>();
  const buildings = features.filter((feature) => feature.kind === "building_outline");
  for (const building of buildings) {
    const own = feetOf(building.attributes?.height_ft ?? building.attributes?.height);
    if (own) heights.set(building.id, own);
  }
  const siteHeight = feetOf(values.find((value) => value.field === "building_height_ft")?.current);
  const main = [...buildings].sort((a, b) => relativeArea(b) - relativeArea(a))[0];
  if (siteHeight && main && !heights.has(main.id)) heights.set(main.id, siteHeight);
  return heights;
}

export function toFeatureCollection(features: MapFeature[], heights = new Map<string, number>()) {
  return {
    type: "FeatureCollection" as const,
    features: features
      .filter((feature) => !isPoint(feature))
      .map((feature) => ({
        type: "Feature" as const,
        geometry: feature.geometry as Geometry,
        properties: {
          id: feature.id,
          kind: feature.kind,
          field: feature.field,
          layer: layerOf(feature),
          tier: feature.kind === "candidate_area" ? zoneTier(feature) : null,
          heightM: (heights.get(feature.id) ?? 0) / FEET_PER_METER,
        },
      })),
  };
}

export const baseSource = (base: BaseMap) => ({
  type: "raster" as const,
  tiles: [base.tileUrlTemplate],
  tileSize: 256,
  maxzoom: base.maxZoom,
  attribution: base.attribution,
});

const onLayer = (...keys: LayerKey[]): unknown[] =>
  keys.length === 1 ? ["==", ["get", "layer"], keys[0]] : ["in", ["get", "layer"], ["literal", keys]];

const ZONE_COLOR = ["match", ["get", "tier"], "remote", "#2e8540", "near_exposure", "#c98a00", "exception", "#d0661f", "excluded", "#8a8f94", "#5c6b73"];

export const BASE_LAYER: AddLayerObject = {
  id: "base",
  type: "raster",
  source: BASE_SOURCE,
  paint: { "raster-opacity": 0.72, "raster-saturation": -0.35 },
};

// Drawn bottom to top. Every polygon has a fill, even an invisible one, so a click inside it can pick it.
export const FEATURE_LAYERS = [
  {
    id: "property-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: onLayer("lot"),
    paint: { "fill-color": SELECTION_COLOR, "fill-opacity": ["case", selected, 0.12, 0] },
  },
  {
    id: "road-line",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("roads"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#ffffff"], "line-width": 2, "line-opacity": 0.9, "line-dasharray": [6, 1.5, 1.5, 1.5] },
  },
  {
    id: "paved-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: onLayer("paved"),
    paint: { "fill-color": ["case", selected, SELECTION_COLOR, "#6b6b6b"], "fill-opacity": 0.35 },
  },
  {
    id: "paved-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("paved"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#3d3d3d"], "line-width": 1.2 },
  },
  {
    id: "constraint-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: onLayer("constraints"),
    paint: { "fill-color": ["case", selected, SELECTION_COLOR, "#a8473b"], "fill-opacity": 0.18 },
  },
  {
    id: "wetland-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: onLayer("wetlands"),
    paint: { "fill-color": ["case", selected, SELECTION_COLOR, "#2f7d8c"], "fill-opacity": 0.3 },
  },
  {
    id: "constraint-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("constraints", "wetlands"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#1f5a66"], "line-width": 1.2 },
  },
  {
    id: "feasible-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: ["==", ["get", "layer"], "feasible"],
    paint: { "fill-color": ["case", selected, SELECTION_COLOR, "#0b5cad"], "fill-opacity": 0.2 },
  },
  {
    id: "feasible-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ["==", ["get", "layer"], "feasible"],
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#0b5cad"], "line-width": 2.5 },
  },
  {
    id: "feasible-outer-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ["==", ["get", "layer"], "feasible_outer"],
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#0b5cad"], "line-width": 1.5, "line-dasharray": [4, 3] },
  },
  {
    id: "zone-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: ["all", ["==", ["get", "kind"], "candidate_area"], ["!=", ["get", "layer"], "feasible"], ["!=", ["get", "layer"], "feasible_outer"]],
    paint: { "fill-color": ["case", selected, SELECTION_COLOR, ZONE_COLOR], "fill-opacity": 0.22 },
  },
  {
    id: "zone-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ["all", ["==", ["get", "kind"], "candidate_area"], ["!=", ["get", "layer"], "feasible"], ["!=", ["get", "layer"], "feasible_outer"]],
    paint: { "line-color": ["case", selected, SELECTION_COLOR, ZONE_COLOR], "line-width": 1.5, "line-dasharray": [3, 2] },
  },
  {
    id: "property-casing",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("lot"),
    paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.8 },
  },
  {
    id: "property-line",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("lot"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#1c2326"], "line-width": 2.5, "line-dasharray": [8, 1.5, 1.5, 1.5, 1.5, 1.5] },
  },
  {
    id: "building-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: onLayer("buildings"),
    paint: { "fill-color": "#1c2326", "fill-opacity": ["case", selected, 0.25, 0.08] },
  },
  {
    id: "building-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("buildings"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#1c2326"], "line-width": ["case", selected, 3, 1.5] },
  },
  {
    id: "building-3d",
    type: "fill-extrusion",
    source: FEATURE_SOURCE,
    filter: ["all", ["==", ["get", "layer"], "buildings"], [">", ["get", "heightM"], 0]],
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": ["case", selected, SELECTION_COLOR, "#c9c6bb"],
      "fill-extrusion-height": ["get", "heightM"],
      "fill-extrusion-opacity": 0.85,
    },
  },
  {
    id: "utility-line",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("utility"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#b5121b"], "line-width": ["case", selected, 4, 2.5] },
  },
  {
    id: "dimension-line",
    type: "line",
    source: FEATURE_SOURCE,
    filter: onLayer("dimensions"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#0b4f8a"], "line-width": ["case", selected, 3, 1.5] },
  },
] as AddLayerObject[];

// Picked from the top: dimension lines and lines, outlines, zones, then constraints and roads, then the lot.
export const HIT_LAYERS = [
  "dimension-line",
  "utility-line",
  "building-fill",
  "feasible-fill",
  "feasible-outer-outline",
  "zone-fill",
  "wetland-fill",
  "constraint-fill",
  "road-line",
  "property-fill",
];
