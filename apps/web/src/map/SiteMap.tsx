import type { BaseMap, MapFeature, Site, Value } from "@eqore/contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { plainLabel, workArea, workPoints } from "@eqore/sheets";
import { equipmentSolids, equipmentTag, polePoints, solidsCollection } from "./equipment3d";
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
import { Map as MapLibre, Marker, NavigationControl, ScaleControl } from "./maplibre";

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
  /** Called when the person pans, zooms, or turns the map, not when the app moves it. */
  onUserMove?: () => void;
  /** Drafting-style callout per feature id, as the site plan writes them. */
  featureLabels?: Record<string, string>;
}

const HIT_RADIUS = 6;

// The map bearing that puts the building's long axis across the screen, the quarter turn nearest north-up.
function squareBearing(ring: number[][]): number {
  if (ring.length < 3) return 0;
  const lat = ring.reduce((s, p) => s + p[1]!, 0) / ring.length;
  const k = Math.cos((lat * Math.PI) / 180);
  const pts = ring.map((p) => [p[0]! * k, p[1]!] as const);
  let best = { area: Infinity, azimuth: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const us = pts.map(([x, y]) => x * c - y * s), vs = pts.map(([x, y]) => x * s + y * c);
    const area = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    // The edge's compass azimuth, clockwise from north.
    if (area < best.area) best = { area, azimuth: 90 - (angle * 180) / Math.PI };
  }
  // A bearing of azimuth - 90 lays that edge left to right; take the quarter turn nearest north-up.
  let bearing = best.azimuth - 90;
  while (bearing > 45) bearing -= 90;
  while (bearing <= -45) bearing += 90;
  return Math.round(bearing * 10) / 10;
}

const MAY_BE_UNCOLLECTED: { keys: LayerKey[]; words: string }[] = [
  { keys: ["roads"], words: "roads" },
  { keys: ["utility"], words: "utility lines" },
  { keys: ["substations"], words: "substations" },
  { keys: ["fire_stations"], words: "fire stations" },
  { keys: ["wetlands"], words: "wetlands" },
  { keys: ["paved"], words: "paved parking and drives" },
  { keys: ZONE_TIERS.map((tier) => `zone_${tier}` as const), words: "eligibility zones" },
];

const PIN_LABELS: Record<string, string> = {
  switchboard_location: "(E) MAIN SWITCHBOARD",
  meter_location: "(E) UTILITY METER",
  utility_transformer_location: "(E) UTILITY TRANSFORMER",
};

function pointLabel(feature: MapFeature) {
  // A pin placed to mark equipment says what it marks; who placed it, and from what, is in its details.
  // A photo still waiting for review says so.
  if (feature.kind === "capture_pin") return PIN_LABELS[feature.field] ?? "Photo, unconfirmed";
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
  const onUserMoveRef = useRef(props.onUserMove);
  onUserMoveRef.current = props.onUserMove;
  const placeRef = useRef({ placingField, onPlace });
  placeRef.current = { placingField, onPlace };
  const [loaded, setLoaded] = useState(false);
  const [aerialFailed, setAerialFailed] = useState(false);
  // The view is the electrical work: environmental layers start off and stay one click away.
  const [hidden, setHidden] = useState<Set<LayerKey>>(() => new Set<LayerKey>(["wetlands", "fire_stations", "constraints", "zone_unknown", "feasible_outer"]));
  // On a phone the legend would cover most of the map, so it starts closed there.
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth > 760);
  // A plan-set drawing aligned onto this site, when one was prepared (scripts/plan-overlay.py).
  // It's a customer document, so it lives in a gitignored folder and is absent everywhere else.
  const [planOverlay, setPlanOverlay] = useState<{ image: string; corners: [number, number][]; label: string } | null>(null);
  // The plan-set drawing starts off; the map opens on the record itself, and the drawing is one click away.
  const [planShown, setPlanShown] = useState(false);
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
    // Orbit like a model view: right-drag or Ctrl-drag turns and tilts, the compass returns to north.
    instance.addControl(new NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), "top-right");
    // Only a person's drag, wheel, or pinch carries an original event; the app's own easing doesn't.
    // A click that ends a pan is the pan, not a pick.
    let panned = false;
    instance.on("mousedown", () => {
      panned = false;
    });
    instance.on("touchstart", () => {
      panned = false;
    });
    instance.on("movestart", (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent) return;
      panned = true;
      onUserMoveRef.current?.();
    });
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
      if (panned) {
        panned = false;
        return;
      }
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
  // Frame again when the battery zone arrives or moves (a placed switchboard moves it), not on every edit.
  const zone = features.find((f) => f.kind === "candidate_area" && (f.attributes?.["zone_kind"] as { value?: unknown } | undefined)?.value === "feasible_bess_recommended");
  const zoneAt = zone ? boundsOf([zone])?.flat().map((v) => v.toFixed(4)).join(",") : "none";
  const frameKey = parcel ? `${parcel.id}:${zoneAt}` : null;
  useEffect(() => {
    if (!loaded || !parcel || !frameKey || fitted.current === frameKey) return;
    // Frame the building, its electrical service, and the battery area, not the whole parcel.
    const area = workArea(features);
    const bounds = area ? ([[area[0], area[1]], [area[2], area[3]]] as [[number, number], [number, number]]) : boundsOf([parcel]);
    if (!bounds) return;
    fitted.current = frameKey;
    // Open turned so the main building runs across the screen, as the site plan draws it. The work area is
    // already tight (zone, building, and nearby service), so no extra step in.
    const building = workPoints(features)?.building ?? [];
    map.current?.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 20, bearing: squareBearing(building) });
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
        // Anything drawn over the map counts as taken: the legend, the tools, the zoom control, the details
        // dock, the header, and prompts. Labels never sit under or over them.
        const panels = [...document.querySelectorAll(".map-legend, .map-tools, .maplibregl-ctrl-group, .dock, .header, .place-prompt, .equipment-specs")].map((panel) => panel.getBoundingClientRect());
        declutter(
          labels,
          frame && frame.width > 0 ? { left: frame.left, top: frame.top, right: frame.right, bottom: frame.bottom } : undefined,
          panels.filter((r) => r.width > 0).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
        );
      });
    };
    run();
    instance.on("render", run);
    // Panels open and close without the map redrawing, so check again a few times a second.
    const recheck = window.setInterval(run, 400);
    return () => {
      window.clearInterval(recheck);
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
      <div className="map-legend">
        <button type="button" className="legend-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen((open) => !open)}>
          <span className="is-label">Layers</span>
          <span className="is-caption">
            {present.filter((layer) => !hidden.has(layer.key)).length} of {present.length}
          </span>
        </button>
        <ul className="legend-list" aria-label="Map layers" hidden={!legendOpen}>
          {planOverlay ? (
            <li className="legend-plan">
              <label className="is-toggle">
                <input type="checkbox" checked={planShown} onChange={() => setPlanShown((shown) => !shown)} />
                <span className="is-toggle__sw" aria-hidden="true" />
                <span className="is-toggle__name">{planOverlay.label}</span>
                <span className="key key-plan" aria-hidden="true" />
              </label>
              {planShown ? (
                <input type="range" min={0.2} max={1} step={0.05} value={planOpacity} aria-label="Plan set opacity" onChange={(e) => setPlanOpacity(Number(e.target.value))} />
              ) : null}
            </li>
          ) : null}
          {present.map((layer) => (
            <li key={layer.key}>
              <label className="is-toggle">
                <input type="checkbox" checked={!hidden.has(layer.key)} onChange={() => toggle(layer.key)} />
                <span className="is-toggle__sw" aria-hidden="true" />
                <span className="is-toggle__name">
                  {layer.label}
                  <span className="legend-count"> {counts.get(layer.key)}</span>
                </span>
                <span className={`key key-${layer.key}`} aria-hidden="true" />
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
