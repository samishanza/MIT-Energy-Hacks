import type { BaseMap, MapFeature, Site, Value } from "@eqore/contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { plainLabel, workArea } from "@eqore/sheets";
import { equipmentSolids, equipmentTag, polePoints, solidsCollection } from "./equipment3d";
import { Google3DView } from "./Google3DView";
import { declutter, priorityOf, type PlacedLabel } from "./declutter";
import { symbolSvg } from "./symbols";
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
  /** Drafting-style callout per feature id, as the site plan writes them. */
  featureLabels?: Record<string, string>;
}

const HIT_RADIUS = 6;

const MAY_BE_UNCOLLECTED: { keys: LayerKey[]; words: string }[] = [
  { keys: ["roads"], words: "roads" },
  { keys: ["utility"], words: "utility lines" },
  { keys: ["substations"], words: "substations" },
  { keys: ["fire_stations"], words: "fire stations" },
  { keys: ["wetlands"], words: "wetlands" },
  { keys: ["paved"], words: "paved parking and drives" },
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
    featureLabels,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const highlighted = useRef<string[]>([]);
  // What the view was last framed on, so it frames again once the battery zone arrives.
  const fitted = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const placeRef = useRef({ placingField, onPlace });
  placeRef.current = { placingField, onPlace };
  const [loaded, setLoaded] = useState(false);
  const [aerialFailed, setAerialFailed] = useState(false);
  // The view is the electrical work: environmental layers start off and stay one click away.
  const [hidden, setHidden] = useState<Set<LayerKey>>(() => new Set<LayerKey>(["wetlands", "fire_stations", "constraints", "zone_unknown", "feasible_outer"]));
  const [threeD, setThreeD] = useState(false);
  // Google's 3D city when it loads; our own 3D models on the aerial when it doesn't.
  const [googleFailed, setGoogleFailed] = useState(false);
  // On a phone the legend would cover most of the map, so it starts closed there.
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth > 760);
  // A plan-set drawing aligned onto this site, when one was prepared (scripts/plan-overlay.py).
  // It's a customer document, so it lives in a gitignored folder and is absent everywhere else.
  const [planOverlay, setPlanOverlay] = useState<{ image: string; corners: [number, number][]; label: string } | null>(null);
  const [planShown, setPlanShown] = useState(true);
  const [planOpacity, setPlanOpacity] = useState(0.85);

  useEffect(() => {
    let current = true;
    setPlanOverlay(null);
    fetch(`/private/plan-overlay/${site.id}.json`)
      .then((response) => (response.ok && /json/.test(response.headers.get("content-type") ?? "") ? response.json() : null))
      .then((meta: { image: string; corners: [number, number][]; label: string } | null) => {
        if (current && meta?.corners?.length === 4) setPlanOverlay({ ...meta, image: `/private/plan-overlay/${meta.image}` });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [site.id]);

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
      pitch: 45,
      maxPitch: 70,
    });
    instance.addControl(new ScaleControl({ unit: "imperial" }), "bottom-right");
    instance.on("load", () => {
      instance.addSource(FEATURE_SOURCE, { type: "geojson", data: toFeatureCollection([]), promoteId: "id" });
      for (const layer of FEATURE_LAYERS) instance.addLayer(layer);
      instance.addSource("equipment3d", { type: "geojson", data: solidsCollection([]) });
      instance.addLayer({
        id: "equipment-3d",
        type: "fill-extrusion",
        source: "equipment3d",
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-height": ["get", "top"],
          "fill-extrusion-opacity": 0.95,
        },
      });
      instance.addSource("poles", { type: "geojson", data: polePoints([]) });
      instance.addLayer({
        id: "poles",
        type: "circle",
        source: "poles",
        paint: {
          "circle-color": "#7a5a3a",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 19, 5, 21, 8],
          "circle-stroke-color": "#1c2326",
          "circle-stroke-width": 1.5,
        },
      });
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
      for (const layer of ["poles", "equipment-3d", ...HIT_LAYERS]) {
        const [hit] = instance.queryRenderedFeatures(
          [
            [x - HIT_RADIUS, y - HIT_RADIUS],
            [x + HIT_RADIUS, y + HIT_RADIUS],
          ],
          { layers: [layer] },
        );
        const field = hit?.properties?.field as string | undefined;
        if (field) {
          onSelectRef.current(field, (hit?.properties?.featureId ?? hit?.properties?.id) as string | undefined);
          return;
        }
      }
    });
    map.current = instance;
    return () => {
      map.current = null;
      fitted.current = null;
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
    if (!instance || !loaded || !planOverlay) return;
    if (!instance.getSource("plan-overlay")) {
      instance.addSource("plan-overlay", { type: "image", url: planOverlay.image, coordinates: planOverlay.corners as never });
      instance.addLayer({ id: "plan-overlay", type: "raster", source: "plan-overlay", paint: { "raster-opacity": planOpacity, "raster-fade-duration": 0 } }, FEATURE_LAYERS[0]!.id);
    }
    instance.setLayoutProperty("plan-overlay", "visibility", planShown ? "visible" : "none");
    instance.setPaintProperty("plan-overlay", "raster-opacity", planOpacity);
  }, [planOverlay, planShown, planOpacity, loaded, baseMap]);

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

  useEffect(() => {
    const source = map.current?.getSource("equipment3d") as { setData?: (data: unknown) => void } | undefined;
    source?.setData?.(solidsCollection(equipmentSolids(visible)));
    const poles = map.current?.getSource("poles") as { setData?: (data: unknown) => void } | undefined;
    poles?.setData?.(polePoints(visible));
  }, [visible, loaded]);

  const parcel = features.find((feature) => feature.kind === "property_line");
  const zoneReady = features.some((f) => f.kind === "candidate_area" && String((f.attributes?.["zone_kind"] as { value?: unknown } | undefined)?.value ?? "").startsWith("feasible_bess"));
  const frameKey = parcel ? `${parcel.id}:${zoneReady}` : null;
  useEffect(() => {
    if (!loaded || !parcel || !frameKey || fitted.current === frameKey) return;
    // Frame the building, its electrical service, and the battery area, not the whole parcel.
    const area = workArea(features);
    const bounds = area ? ([[area[0], area[1]], [area[2], area[3]]] as [[number, number], [number, number]]) : boundsOf([parcel]);
    if (!bounds) return;
    fitted.current = frameKey;
    map.current?.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 20 });
    // The tilted view shows more ground than the box it was fitted to, so step in to match.
    const zoom = map.current?.getZoom?.();
    if (area && zoom !== undefined) map.current?.setZoom?.(Math.min(zoom + 0.5, 20.5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, loaded]);

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
    const symbol = (feature: MapFeature, tag: string, name: string) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `equipment-symbol${isSelected(feature) ? " is-selected" : ""}`;
      element.title = name;
      element.setAttribute("aria-label", name);
      const isNew = /^\(N\)/.test(feature.label ?? "") || (feature.attributes?.["basis"] as { value?: string } | undefined)?.value === "concept";
      element.innerHTML = `${symbolSvg(tag, isNew)}<span class="equipment-tag">${tag}</span>`;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(feature.field, feature.id);
      });
      return new Marker({ element, anchor: "center" }).setLngLat(feature.geometry.coordinates as [number, number]).addTo(instance);
    };
    const markers = [
      ...pointFeatures(visible)
        .filter((feature) => !equipmentTag(feature))
        .map((feature) => mark(feature, plainLabel(pointLabel(feature)), `callout callout-${feature.kind} callout-${layerOf(feature)}`, feature.geometry.coordinates as [number, number])),
      ...visible
        .filter((feature) => feature.kind === "dimension_line" && feature.label)
        .map((feature) => mark(feature, feature.label!.replace(/\s*\(fitted\)/i, ""), "callout callout-dimension", centerOf(feature))),
      ...visible
        .filter((feature) => !isPoint(feature) && feature.kind !== "utility_line" && featureLabels?.[feature.id])
        // One label per road name, however many segments the road has.
        .filter((feature, i, all) => feature.kind !== "road" || all.findIndex((other) => other.kind === "road" && featureLabels![other.id] === featureLabels![feature.id]) === i)
        .map((feature) => mark(feature, featureLabels![feature.id]!, `callout callout-drafting callout-${layerOf(feature)}`, centerOf(feature))),
    ];
    // No two labels overlap: the less important one hides until there's room again.
    const labels: PlacedLabel[] = markers.map((marker) => {
      const element = marker.getElement();
      return { element, priority: priorityOf(element.className) };
    });
    let pending = 0;
    const run = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const frame = container.current?.getBoundingClientRect();
        const panels = [...(container.current?.parentElement?.querySelectorAll(".map-legend, .map-tools") ?? [])].map((panel) => panel.getBoundingClientRect());
        declutter(
          labels,
          frame && frame.width > 0 ? { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom } : undefined,
          panels.filter((r) => r.width > 0).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
        );
      });
    };
    run();
    instance.on("render", run);
    return () => {
      instance.off("render", run);
      if (pending) cancelAnimationFrame(pending);
      for (const marker of markers) marker.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedFields, selectedFeatureId, loaded, featureLabels]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    instance.setLayoutProperty("building-3d", "visibility", "visible");
  }, [loaded]);

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
        <button type="button" aria-pressed={threeD} className={threeD ? "on" : ""} onClick={() => setThreeD((on) => !on)} disabled={googleFailed} title={googleFailed ? "Google's 3D map isn't enabled for this key" : undefined}>
          3D view
        </button>
      </div>
      {threeD && !googleFailed && site.location ? (
        <div className="google-3d-frame">
          <Google3DView
            features={visible}
            center={site.location}
            onSelect={(field, id) => onSelectRef.current(field, id)}
            onFail={() => {
              setGoogleFailed(true);
              setThreeD(false);
            }}
          />
          <button type="button" className="google-3d-exit" onClick={() => setThreeD(false)}>
            Exit 3D
          </button>
        </div>
      ) : null}
      <div className="map-legend">
        <button type="button" className="legend-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen((open) => !open)}>
          Layers
        </button>
        <ul className="legend-list" aria-label="Map layers" hidden={!legendOpen}>
          {planOverlay ? (
            <li className="legend-plan">
              <label>
                <input type="checkbox" checked={planShown} onChange={() => setPlanShown((shown) => !shown)} />
                <span className="key key-plan" aria-hidden="true" /> {planOverlay.label}
              </label>
              {planShown ? (
                <input type="range" min={0.2} max={1} step={0.05} value={planOpacity} aria-label="Plan set opacity" onChange={(e) => setPlanOpacity(Number(e.target.value))} />
              ) : null}
            </li>
          ) : null}
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
        {!loading && (!baseMap || aerialFailed) ? <p className="map-warning">Aerial unavailable</p> : null}
      </div>
    </div>
  );
}
