import type { MapFeature, RecordVersion } from "@eqore/contract";
import { useEffect, useRef, useState } from "react";
import {
  BASE_LAYER,
  BASE_SOURCE,
  baseSource,
  FEATURE_LAYERS,
  FEATURE_SOURCE,
  HIT_LAYERS,
  isPoint,
  pointFeatures,
  toFeatureCollection,
} from "./layers";
import { Map as MapLibre, Marker, ScaleControl } from "./maplibre";

export interface SiteMapProps {
  record: RecordVersion;
  selectedFields: string[];
  onSelect: (field: string) => void;
  dockOpen?: boolean;
  placingField?: string | null;
  onPlace?: (field: string, longitude: number, latitude: number) => void;
  // A field to bring into view, such as a label that just appeared.
  focusField?: string | null;
}

const HIT_RADIUS = 6;

function conceptNote(features: MapFeature[]) {
  const usesPhotos = features.some((f) => f.kind === "capture_pin" || f.kind === "existing_equipment");
  const basis = usesPhotos ? "public data and customer photos" : "public data";
  return `Concept-grade. Based on ${basis}. Not surveyed. Not a construction document.`;
}

function pointLabel(feature: MapFeature) {
  return feature.kind === "capture_pin" ? "Photo, unconfirmed" : (feature.label ?? "(E) Existing equipment");
}

export function SiteMap(props: SiteMapProps) {
  const { record, selectedFields, onSelect, dockOpen = false, placingField = null, onPlace, focusField = null } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const highlighted = useRef<string[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const placeRef = useRef({ placingField, onPlace });
  placeRef.current = { placingField, onPlace };
  const [loaded, setLoaded] = useState(false);
  const [aerialFailed, setAerialFailed] = useState(false);
  const { baseMap, features, site } = record;

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
      if (baseMap) {
        instance.addSource(BASE_SOURCE, baseSource(baseMap));
        instance.addLayer(BASE_LAYER);
      }
      instance.addSource(FEATURE_SOURCE, {
        type: "geojson",
        data: toFeatureCollection(features),
        promoteId: "id",
      });
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
          onSelectRef.current(field);
          return;
        }
      }
    });
    map.current = instance;
    return () => {
      map.current = null;
      setLoaded(false);
      instance.remove();
    };
    // One map per site. New versions of the same site update its source below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  // Feature state is lost when source data is replaced, so the selection is reapplied here too.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const source = instance.getSource(FEATURE_SOURCE) as { setData?: (data: unknown) => void } | undefined;
    source?.setData?.(toFeatureCollection(features));
    const next = features.filter((f) => !isPoint(f) && selectedFields.includes(f.field)).map((f) => f.id);
    for (const id of highlighted.current) {
      if (!next.includes(id)) instance.setFeatureState({ source: FEATURE_SOURCE, id }, { selected: false });
    }
    for (const id of next) instance.setFeatureState({ source: FEATURE_SOURCE, id }, { selected: true });
    highlighted.current = next;
  }, [features, selectedFields, loaded]);

  // HTML callouts are never dropped by label collision and need no glyph files offline.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const markers = pointFeatures(features).map((feature) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `callout callout-${feature.kind}${selectedFields.includes(feature.field) ? " callout-selected" : ""}`;
      element.textContent = pointLabel(feature);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(feature.field);
      });
      const coordinates = feature.geometry.coordinates as [number, number];
      return new Marker({ element, anchor: "bottom-left" }).setLngLat(coordinates).addTo(instance);
    });
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [features, selectedFields, loaded]);

  useEffect(() => {
    map.current?.setPadding({ top: 0, bottom: 0, left: 0, right: dockOpen ? 420 : 0 });
  }, [dockOpen, loaded]);

  useEffect(() => {
    if (!loaded || !focusField) return;
    const point = pointFeatures(features).find((f) => f.field === focusField);
    if (point) map.current?.easeTo({ center: point.geometry.coordinates as [number, number], duration: 600 });
  }, [focusField, features, loaded]);

  const noEquipment = !features.some((f) => f.kind === "existing_equipment" || f.kind === "capture_pin");

  return (
    <div className={`map-frame${placingField ? " is-placing" : ""}`}>
      <div ref={container} className="map-canvas" />
      <div className="map-north" aria-label="North is up">
        N ↑
      </div>
      {placingField ? <p className="place-prompt">Click the map to place this equipment. It's recorded as placed by hand.</p> : null}
      <div className="map-legend">
        <p className="concept-note">{conceptNote(features)}</p>
        <ul className="legend-list">
          <li><span className="key key-property" /> Property line, not surveyed</li>
          <li><span className="key key-building" /> Building outline</li>
          <li><span className="key key-utility" /> Utility-published, for this location</li>
          <li><span className="key key-existing">(E)</span> Existing equipment</li>
        </ul>
        {!baseMap || aerialFailed ? <p className="map-warning">Aerial unavailable</p> : null}
        {noEquipment ? <p className="map-warning">No existing equipment placed yet. Public data doesn't show it.</p> : null}
      </div>
    </div>
  );
}
