import type { BaseMap, Geometry, MapFeature } from "@eqore/contract";
import type { AddLayerObject } from "maplibre-gl";

export const FEATURE_SOURCE = "features";
export const BASE_SOURCE = "base";

const selected = ["boolean", ["feature-state", "selected"], false];
const SELECTION_COLOR = "#f05a00";

export const isPoint = (feature: MapFeature) => feature.geometry.type === "Point";

export const pointFeatures = (features: MapFeature[]) => features.filter(isPoint);

export function toFeatureCollection(features: MapFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features
      .filter((feature) => !isPoint(feature))
      .map((feature) => ({
        type: "Feature" as const,
        geometry: feature.geometry as Geometry,
        properties: { id: feature.id, kind: feature.kind, field: feature.field },
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

const ofKind = (kind: string): ["==", ["get", string], string] => ["==", ["get", "kind"], kind];

export const BASE_LAYER: AddLayerObject = {
  id: "base",
  type: "raster",
  source: BASE_SOURCE,
  // Faded toward the paper color, so the drawn lines stay legible on top.
  paint: { "raster-opacity": 0.72, "raster-saturation": -0.35 },
};

export const FEATURE_LAYERS = [
  {
    id: "property-fill",
    type: "fill",
    source: FEATURE_SOURCE,
    filter: ofKind("property_line"),
    paint: {
      "fill-color": SELECTION_COLOR,
      "fill-opacity": ["case", selected, 0.12, 0],
    },
  },
  {
    id: "property-casing",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ofKind("property_line"),
    paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.8 },
  },
  {
    id: "property-line",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ofKind("property_line"),
    paint: {
      "line-color": ["case", selected, SELECTION_COLOR, "#1c2326"],
      "line-width": 2,
      "line-dasharray": [6, 2],
    },
  },
  {
    id: "building-outline",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ofKind("building_outline"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#1c2326"], "line-width": ["case", selected, 3, 1.5] },
  },
  {
    id: "utility-line",
    type: "line",
    source: FEATURE_SOURCE,
    filter: ofKind("utility_line"),
    paint: { "line-color": ["case", selected, SELECTION_COLOR, "#6a3fc2"], "line-width": ["case", selected, 4, 2.5] },
  },
] as AddLayerObject[];

// Narrow targets first, so a line on top of the parcel can still be picked.
export const HIT_LAYERS = ["utility-line", "building-outline", "property-fill"];
