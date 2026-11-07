import type { BaseMap, MapFeature, Site, Value } from "@eqore/contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { googleEarthUrl, streetViewUrl } from "../app/siteLinks";
import {
  BASE_LAYER,
  BASE_SOURCE,
  baseSource,
  boundsOf,
  buildingHeights,
  centerOf,
  FEATURE_LAYERS,
  FEATURE_SOURCE,
  HIT_LAYERS,
  isPoint,
  LAYERS,
  layerOf,
  pointFeatures,
  toFeatureCollection,
  type LayerKey,
  ZONE_TIERS,
} from "./layers";
import { Map as MapLibre, Marker, ScaleControl } from "./maplibre";

export interface SiteMapProps {
  site: Site;
  baseMap: BaseMap | null;
  features: MapFeature[];
  values: Value[];
  // During a run, before sources have answered, so nothing missing is reported yet.
  loading?: boolean;
  selectedFields: string[];
  selectedFeatureId?: string | null;
  onSelect: (field: string, featureId?: string) => void;
  dockOpen?: boolean;
  placingField?: string | null;
  onPlace?: (field: string, longitude: number, latitude: number) => void;
  onCancelPlace?: () => void;
  focusField?: string | null;
}

const HIT_RADIUS = 6;

const MAY_BE_UNCOLLECTED: { keys: LayerKey[]; words: string }[] = [
  { keys: ["roads"], words: "roads" },
  { keys: ["utility"], words: "utility lines" },
  { keys: ["substations"], words: "substations" },
  { keys: ["fire_stations"], words: "fire stations" },
  { keys: ["wetlands"], words: "wetlands" },
  { keys: ZONE_TIERS.map((tier) => `zone_${tier}` as const), words: "eligibility zones" },
];

function pointLabel(feature: MapFeature) {
  if (feature.kind === "capture_pin") return "Photo, unconfirmed";
  if (feature.kind === "existing_equipment") return feature.label ?? "(E) Existing equipment";
  return feature.label ?? feature.field.replace(/_/g, " ");
}

export function SiteMap(props: SiteMapProps) {
  const {
    site,
    baseMap,
    features,
    values,
    loading = false,
    selectedFields,
    selectedFeatureId = null,
    onSelect,
    dockOpen = false,
    placingField = null,
    onPlace,
    onCancelPlace,
    focusField = null,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const highlighted = useRef<string[]>([]);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const placeRef = useRef({ placingField, onPlace });
  placeRef.current = { placingField, onPlace };
  const [loaded, setLoaded] = useState(false);
  const [aerialFailed, setAerialFailed] = useState(false);
  const [hidden, setHidden] = useState<Set<LayerKey>>(new Set());
  const [threeD, setThreeD] = useState(false);
  // On a phone the legend would cover most of the map, so it starts closed there.
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth > 760);

  const heights = useMemo(() => buildingHeights(features, values), [features, values]);
  const visible = useMemo(() => features.filter((feature) => !hidden.has(layerOf(feature))), [features, hidden]);
  const isSelected = (feature: MapFeature) =>
    selectedFeatureId ? feature.id === selectedFeatureId : selectedFields.includes(feature.field);

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapLibre({
      container: container.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "paper", type: "background", paint: { "background-color": "#f7f6f2" } }],
      },
      center: baseMap?.center ?? site.location ?? [-71.8, 42.3],
      zoom: baseMap?.zoom ?? 17,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    });
    instance.addControl(new ScaleControl({ unit: "imperial" }), "bottom-right");
    instance.on("load", () => {
      instance.addSource(FEATURE_SOURCE, { type: "geojson", data: toFeatureCollection([]), promoteId: "id" });
      for (const layer of FEATURE_LAYERS) instance.addLayer(layer);
      setLoaded(true);
    });
    instance.on("error", (event: unknown) => {
      if ((event as { sourceId?: string }).sourceId === BASE_SOURCE) setAerialFailed(true);
    });
    instance.on("click", (event) => {
      const placing = placeRef.current;
      if (placing.placingField) {
        placing.onPlace?.(placing.placingField, event.lngLat.lng, event.lngLat.lat);
        return;
      }
      const { x, y } = event.point;
      for (const layer of HIT_LAYERS) {
        const [hit] = instance.queryRenderedFeatures(
          [
            [x - HIT_RADIUS, y - HIT_RADIUS],
            [x + HIT_RADIUS, y + HIT_RADIUS],
          ],
          { layers: [layer] },
        );
        const field = hit?.properties?.field as string | undefined;
        if (field) {
          onSelectRef.current(field, hit?.properties?.id as string | undefined);
          return;
        }
      }
    });
    map.current = instance;
    return () => {
      map.current = null;
      fitted.current = false;
      setLoaded(false);
      instance.remove();
    };
  }, [site.id]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded || !baseMap || instance.getSource(BASE_SOURCE)) return;
    instance.addSource(BASE_SOURCE, baseSource(baseMap));
    instance.addLayer(BASE_LAYER, FEATURE_LAYERS[0]!.id);
  }, [baseMap, loaded]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const source = instance.getSource(FEATURE_SOURCE) as { setData?: (data: unknown) => void } | undefined;
    source?.setData?.(toFeatureCollection(visible, heights));
  }, [visible, heights, loaded]);

  // MapLibre drops feature state when source data is replaced, so this runs after every data change too.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const next = new Set(visible.filter((f) => !isPoint(f) && isSelected(f)).map((f) => f.id));
    for (const id of highlighted.current) {
      if (!next.has(id)) instance.setFeatureState({ source: FEATURE_SOURCE, id }, { selected: false });
    }
    for (const id of next) instance.setFeatureState({ source: FEATURE_SOURCE, id }, { selected: true });
    highlighted.current = [...next];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, heights, selectedFields, selectedFeatureId, loaded]);

  const parcel = features.find((feature) => feature.kind === "property_line");
  useEffect(() => {
    if (!loaded || !parcel || fitted.current) return;
    const bounds = boundsOf([parcel]);
    if (!bounds) return;
    fitted.current = true;
    map.current?.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 19 });
  }, [parcel, loaded]);

  // HTML labels are never dropped by label collision and need no glyph files offline.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const mark = (feature: MapFeature, text: string, className: string, position: [number, number]) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `${className}${isSelected(feature) ? " callout-selected" : ""}`;
      element.textContent = text;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(feature.field, feature.id);
      });
      return new Marker({ element, anchor: "bottom-left" }).setLngLat(position).addTo(instance);
    };
    const markers = [
      ...pointFeatures(visible).map((feature) =>
        mark(feature, pointLabel(feature), `callout callout-${feature.kind} callout-${layerOf(feature)}`, feature.geometry.coordinates as [number, number]),
      ),
      ...visible
        .filter((feature) => feature.kind === "dimension_line" && feature.label)
        .map((feature) => mark(feature, feature.label!, "callout callout-dimension", centerOf(feature))),
    ];
    return () => {
      for (const marker of markers) marker.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedFields, selectedFeatureId, loaded]);

  const toggled3D = useRef(false);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded || (!threeD && !toggled3D.current)) return;
    toggled3D.current = true;
    instance.setLayoutProperty("building-3d", "visibility", threeD ? "visible" : "none");
    instance.setMaxPitch(threeD ? 60 : 0);
    instance.easeTo({ pitch: threeD ? 55 : 0, duration: 400 });
  }, [threeD, loaded]);

  useEffect(() => {
    const beside = dockOpen && window.innerWidth > 760;
    map.current?.setPadding({ top: 0, bottom: 0, left: 0, right: beside ? 420 : 0 });
  }, [dockOpen, loaded]);

  const focusPoint = focusField ? pointFeatures(features).find((f) => f.field === focusField) : undefined;
  const focusKey = focusPoint?.geometry.coordinates.join(",");
  useEffect(() => {
    if (!loaded || !focusPoint) return;
    map.current?.easeTo({ center: focusPoint.geometry.coordinates as [number, number], duration: 600 });
    // Eases when the target moves, not on every new version of the record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, loaded]);

  const counts = new Map<LayerKey, number>();
  for (const feature of features) {
    const key = layerOf(feature);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const present = LAYERS.filter((layer) => counts.has(layer.key));
  const absent = MAY_BE_UNCOLLECTED.filter((expected) => !expected.keys.some((key) => counts.has(key))).map((expected) => expected.words);
  const raised = [...heights.values()];
  const flat = features.filter((f) => f.kind === "building_outline").length - raised.length;
  const toggle = (key: LayerKey) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className={`map-frame${placingField ? " is-placing" : ""}`}>
      <div ref={container} className="map-canvas" />
      <div className="map-north" aria-label="North is up">
        N ↑
      </div>
      {placingField ? (
        <div className="place-prompt">
          <p>Click the map to place this equipment. It's recorded as placed by hand.</p>
          <button type="button" onClick={onCancelPlace}>
            Cancel placing
          </button>
        </div>
      ) : null}
      <div className="map-tools">
        {site.location ? (
          <>
            <a href={googleEarthUrl(site.location)} target="_blank" rel="noopener noreferrer">
              Open in Google Earth
            </a>
            <a href={streetViewUrl(site.location)} target="_blank" rel="noopener noreferrer">
              Street View
            </a>
          </>
        ) : null}
        <button type="button" aria-pressed={threeD} className={threeD ? "on" : ""} onClick={() => setThreeD((on) => !on)}>
          3D buildings
        </button>
      </div>
      <div className="map-legend">
        <button type="button" className="legend-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen((open) => !open)}>
          Layers
        </button>
        <ul className="legend-list" aria-label="Map layers" hidden={!legendOpen}>
          {present.map((layer) => (
            <li key={layer.key}>
              <label>
                <input type="checkbox" checked={!hidden.has(layer.key)} onChange={() => toggle(layer.key)} />
                <span className={`key key-${layer.key}`} aria-hidden="true" /> {layer.label}
                <span className="legend-count"> {counts.get(layer.key)}</span>
              </label>
            </li>
          ))}
        </ul>
        {!loading && absent.length > 0 ? <p className="note">Not collected for this site: {absent.join(", ")}.</p> : null}
        {threeD ? (
          <p className="note">
            {raised.length > 0
              ? `Heights are estimates on record, not measured.${flat > 0 ? ` ${flat} ${flat === 1 ? "building has" : "buildings have"} no height on record and ${flat === 1 ? "stays" : "stay"} flat.` : ""}`
              : "No building height on record, so buildings stay flat."}
          </p>
        ) : null}
        {!loading && (!baseMap || aerialFailed) ? <p className="map-warning">Aerial unavailable</p> : null}
      </div>
    </div>
  );
}
