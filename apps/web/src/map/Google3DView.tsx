import type { MapFeature } from "@eqore/contract";
import { useEffect, useRef, useState } from "react";
import { drawableEquipment, equipmentSolids, overheadWires } from "./equipment3d";

// Google's photorealistic 3D map of the site, with the electrical equipment placed in it as
// solid models, overhead wires in the air, and a plain label over each item. Clicking a label
// opens its details. The key is served by the local API and is restricted to this app.

type Google = { maps: { importLibrary: (name: string) => Promise<Record<string, new (options: Record<string, unknown>) => HTMLElement>> } };

let loading: Promise<Google> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

type LonLat = [number, number];
const bearing = ([lon1, lat1]: LonLat, [lon2, lat2]: LonLat) => {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};

/** The grid connection point to frame, and the heading from the street toward it. */
function connectionView(features: MapFeature[], fallback: LonLat): { at: LonLat; heading: number } {
  const type = (f: MapFeature) => String((f.attributes?.["equipment_type"] as { value?: string } | undefined)?.value ?? "");
  const point = (t: string) => features.find((f) => type(f) === t && f.geometry.type === "Point")?.geometry.coordinates as LonLat | undefined;
  const at = point("service_tap") ?? point("service_entrance") ?? point("bess_pad") ?? fallback;
  const road = features
    .filter((f) => f.kind === "road")
    .flatMap((f) => (f.geometry.type === "LineString" ? f.geometry.coordinates : f.geometry.type === "MultiLineString" ? f.geometry.coordinates.flat() : [])) as LonLat[];
  const near = road.sort((a, b) => Math.hypot(a[0] - at[0], a[1] - at[1]) - Math.hypot(b[0] - at[0], b[1] - at[1]))[0];
  const entrance = point("service_entrance");
  // Look from the street at the connection, or along the service toward the building.
  const from = near && Math.hypot(near[0] - at[0], near[1] - at[1]) > 1e-5 ? near : entrance ? at : null;
  const to = from === at && entrance ? entrance : at;
  return { at, heading: from ? Math.round(bearing(from, to)) : 0 };
}
function loadGoogle(key: string): Promise<Google> {
  const w = window as unknown as { google?: Google };
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google);
  loading ??= new Promise((resolve, reject) => {
    // Google calls this when the key isn't allowed to use the API, instead of failing the script.
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((listener) => listener());
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&libraries=maps3d`;
    script.async = true;
    script.onload = () => (w.google ? resolve(w.google) : reject(new Error("Google Maps didn't load.")));
    script.onerror = () => reject(new Error("Google Maps couldn't be reached."));
    document.head.appendChild(script);
  });
  return loading;
}

export function Google3DView({
  features,
  center,
  onSelect,
  onFail,
}: {
  features: MapFeature[];
  center: [number, number];
  onSelect: (field: string, featureId?: string) => void;
  onFail: (reason: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading the 3D view…");

  useEffect(() => {
    let cancelled = false;
    let element: HTMLElement | null = null;
    const failed = () => onFail("Google's 3D map isn't enabled for this key.");
    authListeners.add(failed);
    if (authFailed) failed();
    (async () => {
      const config = (await (await fetch("/api/maps-config")).json()) as { key: string | null };
      if (!config.key) throw new Error("No Google Maps key is configured.");
      const google = await loadGoogle(config.key);
      const lib = await google.maps.importLibrary("maps3d");
      if (cancelled || !host.current) return;
      const solids = equipmentSolids(features);
      const view = connectionView(drawableEquipment(features), center);
      const map = new lib.Map3DElement!({ center: { lat: view.at[1], lng: view.at[0], altitude: 0 }, range: 95, tilt: 68, heading: view.heading, mode: "HYBRID" });
      element = map;
      map.style.width = "100%";
      map.style.height = "100%";
      for (const s of solids) {
        if (s.base > 1.2) continue; // Parts in the air, like crossarms, read better as the wires below.
        const polygon = new lib.Polygon3DElement!({
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          fillColor: s.color,
          strokeColor: "#1c2326",
          strokeWidth: 1,
        });
        (polygon as unknown as { outerCoordinates: unknown }).outerCoordinates = s.ring.map(([lng, lat]) => ({ lat, lng, altitude: s.top }));
        map.append(polygon);
      }
      for (const w of overheadWires(features)) {
        const line = new lib.Polyline3DElement!({ altitudeMode: "RELATIVE_TO_GROUND", strokeColor: "#1c2326", strokeWidth: 3 });
        (line as unknown as { coordinates: unknown }).coordinates = w.line.map(([lng, lat]) => ({ lat, lng, altitude: w.heightM }));
        map.append(line);
      }
      const labelled = new Set<string>();
      for (const s of solids) {
        if (!s.tag || labelled.has(s.featureId)) continue;
        labelled.add(s.featureId);
        const c = s.ring.slice(0, -1).reduce(([x, y], [lng, lat]) => [x + lng / (s.ring.length - 1), y + lat / (s.ring.length - 1)], [0, 0]);
        const marker = new lib.Marker3DInteractiveElement!({
          position: { lat: c[1], lng: c[0], altitude: s.top + 3 },
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          label: `${s.tag} · ${s.name}`,
        });
        marker.addEventListener("gmp-click", () => onSelect(s.field, s.featureId));
        map.append(marker);
      }
      host.current.replaceChildren(map);
      setStatus("");
    })().catch((error: unknown) => {
      if (cancelled) return;
      const reason = error instanceof Error ? error.message : "The 3D view didn't load.";
      setStatus(reason);
      onFail(reason);
    });
    return () => {
      cancelled = true;
      authListeners.delete(failed);
      element?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  return (
    <div className="google-3d">
      <div ref={host} className="google-3d-host" />
      {status ? <p className="google-3d-status">{status}</p> : null}
    </div>
  );
}
