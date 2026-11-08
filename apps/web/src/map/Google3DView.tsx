import type { MapFeature } from "@eqore/contract";
import { useEffect, useRef, useState } from "react";
import { BASIS_WORDS, metersBetween, type GridStep } from "../app/gridPath";
import { drawableEquipment, equipmentSolids, overheadWires } from "./equipment3d";
import { loadGoogle, onGoogleAuthFailure } from "./googleMaps";

// Google's photorealistic 3D map of the site, with the electrical equipment placed in it as
// solid models, overhead wires in the air, and a plain label over each item. Clicking a label
// opens its details. The path from the building back to the grid is drawn over it, and the
// camera can step along that path, link by link, out to the substation and transmission line.

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

const PATH_COLOR = "#ffb000";
const GAP_COLOR = "rgba(255,255,255,0.55)";

/** How far back the camera stands for each kind of step, in meters. */
const RANGE: Record<GridStep["role"], number> = { building: 140, service_entrance: 45, service_drop: 50, transformer: 45, pole: 55, distribution: 110, substation: 260, transmission: 450 };

type Camera = { center: { lat: number; lng: number; altitude: number }; range: number; tilt: number; heading: number };

/** Where to put the camera for a step: standing back from it, looking along the path toward it. */
export function cameraFor(trace: GridStep[], index: number): Camera {
  if (index >= trace.length) {
    // The whole path: from the building to the farthest step, seen from above at an angle.
    const first = trace[0]!.at;
    const far = trace.reduce((best, s) => (metersBetween(s.at, first) > metersBetween(best.at, first) ? s : best), trace[0]!).at;
    const span = metersBetween(first, far);
    return { center: { lat: (first[1] + far[1]) / 2, lng: (first[0] + far[0]) / 2, altitude: 0 }, range: Math.max(300, span * 1.8), tilt: 45, heading: Math.round(bearing(first, far)) };
  }
  const step = trace[index]!;
  const before = trace[index - 1]?.at;
  const span = before ? metersBetween(before, step.at) : 0;
  const heading = before && span > 2 ? Math.round(bearing(before, step.at)) : 0;
  const range = step.role === "substation" || step.role === "transmission" ? Math.max(RANGE[step.role], Math.min(span * 0.6, 1500)) : RANGE[step.role];
  return { center: { lat: step.at[1], lng: step.at[0], altitude: Math.min(step.heightM, 12) }, range, tilt: step.role === "building" ? 55 : 67, heading };
}

export function Google3DView({
  features,
  center,
  trace,
  onSelect,
  onFail,
}: {
  features: MapFeature[];
  center: [number, number];
  trace: GridStep[];
  onSelect: (field: string, featureId?: string) => void;
  onFail: (reason: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<(HTMLElement & { flyCameraTo?: (options: unknown) => void }) | null>(null);
  const [status, setStatus] = useState("Loading the 3D view…");
  const [stop, setStop] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let element: HTMLElement | null = null;
    const off = onGoogleAuthFailure(() => onFail("Google's 3D map isn't enabled for this key."));
    (async () => {
      const google = await loadGoogle();
      const lib = (await google.maps.importLibrary("maps3d")) as unknown as Record<string, new (options: Record<string, unknown>) => HTMLElement>;
      if (cancelled || !host.current) return;
      const solids = equipmentSolids(features);
      const view = connectionView(drawableEquipment(features), center);
      const map = new lib.Map3DElement!({ center: { lat: view.at[1], lng: view.at[0], altitude: 0 }, range: 95, tilt: 68, heading: view.heading, mode: "HYBRID" });
      element = map;
      mapRef.current = map;
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
      // The path to the grid: bright where a public source shows the link, faint where none does.
      for (const step of trace) {
        if (!step.link) continue;
        const known = step.link.basis !== "not_public";
        for (const part of step.link.line) {
          const line = new lib.Polyline3DElement!({ altitudeMode: "RELATIVE_TO_GROUND", strokeColor: known ? PATH_COLOR : GAP_COLOR, strokeWidth: known ? 7 : 3, outerColor: "#1c2326", outerWidth: known ? 0.25 : 0 });
          (line as unknown as { coordinates: unknown }).coordinates = part.map(([lng, lat]) => ({ lat, lng, altitude: step.link!.heightM + 0.2 }));
          map.append(line);
        }
      }
      const labelled = new Set<string>();
      for (const s of solids) {
        if (!s.tag || labelled.has(s.featureId)) continue;
        labelled.add(s.featureId);
        const c = s.ring.slice(0, -1).reduce(([x, y], [lng, lat]) => [x + lng / (s.ring.length - 1), y + lat / (s.ring.length - 1)], [0, 0]);
        const marker = new lib.Marker3DInteractiveElement!({
          // Just above eye height on the object, so the label sits on it rather than in the sky.
          position: { lat: c[1], lng: c[0], altitude: Math.min(s.top, 5) + 1 },
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          label: `${s.tag} · ${s.name}`,
        });
        marker.addEventListener("gmp-click", () => onSelect(s.field, s.featureId));
        map.append(marker);
      }
      // The far end of the path has no model of its own: label the substation and the transmission line.
      for (const step of trace) {
        if (step.role !== "substation" && step.role !== "transmission") continue;
        const marker = new lib.Marker3DInteractiveElement!({
          position: { lat: step.at[1], lng: step.at[0], altitude: step.heightM + 4 },
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          label: step.title,
        });
        if (step.field) marker.addEventListener("gmp-click", () => onSelect(step.field!, step.featureId ?? undefined));
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
      off();
      mapRef.current = null;
      element?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, trace]);

  const go = (index: number) => {
    setStop(index);
    mapRef.current?.flyCameraTo?.({ endCamera: cameraFor(trace, index), durationMillis: 2200 });
  };
  const current = stop !== null && stop < trace.length ? trace[stop]! : null;

  return (
    <div className="google-3d">
      <div ref={host} className="google-3d-host" />
      {status ? <p className="google-3d-status">{status}</p> : null}
      {!status && trace.length > 1 ? (
        <aside className="grid-tour" aria-label="Path to the grid">
          <h3>Path to the grid</h3>
          <ol>
            {trace.map((step, i) => (
              <li key={`${step.role}-${i}`}>
                <button type="button" className={stop === i ? "on" : ""} onClick={() => go(i)}>
                  <span className={`grid-tour-dot basis-${step.basis}`} aria-hidden />
                  <span className="grid-tour-title">{step.title}</span>
                  {step.link ? <span className="grid-tour-gap">{step.link.basis === "not_public" ? `route not public, ${step.link.distanceFt.toLocaleString()} ft` : `${step.link.distanceFt.toLocaleString()} ft`}</span> : null}
                </button>
              </li>
            ))}
          </ol>
          {current ? (
            <p className="grid-tour-detail">
              <strong>{BASIS_WORDS[current.basis]}.</strong> {current.detail}
            </p>
          ) : (
            <p className="grid-tour-detail">Step from the building back to the grid. Bright links are shown by a public source; faint ones aren't public.</p>
          )}
          <div className="grid-tour-buttons">
            <button type="button" disabled={stop === null || stop === 0} onClick={() => go((stop ?? 1) - 1)}>
              Back
            </button>
            <button type="button" onClick={() => go(stop === null ? 0 : Math.min(stop + 1, trace.length))}>
              {stop === null ? "Start" : stop >= trace.length - 1 ? "Whole path" : "Next"}
            </button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
