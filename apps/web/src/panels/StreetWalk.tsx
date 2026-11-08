import type { MapFeature, RecordVersion } from "@eqore/contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { BASIS_WORDS, closestOn, gridPath, metersBetween, type GridStep } from "../app/gridPath";
import { labelWidth, placeLabels } from "../app/labelPlacement";
import { inFront, projectPoint, type StreetCamera } from "../app/streetProjection";
import { loadGoogle, onGoogleAuthFailure } from "../map/googleMaps";
import { itemsInPhoto } from "./StreetViewPanel";

// Street View walked along the path from the building back to the grid: one stop per link, each
// at the panorama that sees it best, turned toward it and pitched up for a pole. With the Maps
// JavaScript API on the key the panorama is interactive; without it, each stop is a still photo
// from the Static API, aimed the same way. The record's equipment and the path are drawn over the
// imagery from their positions and the camera Google reports. Nothing is read from the imagery:
// Google's terms allow drawing over it, not deriving data from it.

type LonLat = [number, number];
type LatLng = { lat: () => number; lng: () => number };
type Pano = {
  setPano: (id: string) => void;
  setPov: (pov: { heading: number; pitch: number }) => void;
  setZoom: (zoom: number) => void;
  getPov: () => { heading: number; pitch: number };
  getZoom: () => number;
  getPosition: () => LatLng | null;
  addListener: (event: string, fn: () => void) => { remove: () => void };
};
export type Found = { id: string; at: LonLat; date: string | null; meters: number; target: LonLat };
type Aim = { heading: number; pitch: number; zoom: number };

const STILL = { width: 640, height: 400 };
const toDeg = 180 / Math.PI;
const bearing = ([lon1, lat1]: LonLat, [lon2, lat2]: LonLat) => {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) * toDeg) + 360) % 360;
};
const offset = ([lon, lat]: LonLat, east: number, north: number): LonLat => [lon + east / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + north / 111_320];

/** Where to look for panoramas: either side of the step along the nearest road, the road point, and the step. */
export function lookFrom(step: GridStep, roads: LonLat[][]): LonLat[] {
  let near: { at: LonLat; meters: number; a: LonLat; b: LonLat } | null = null;
  for (const line of roads) {
    for (let k = 1; k < line.length; k++) {
      const hit = closestOn([[line[k - 1]!, line[k]!]], step.at);
      if (hit && (!near || hit.meters < near.meters)) near = { ...hit, a: line[k - 1]!, b: line[k]! };
    }
  }
  if (!near || near.meters > 120) return [step.at];
  const { a, b } = near;
  const len = metersBetween(a, b) || 1;
  const k = Math.cos((near.at[1] * Math.PI) / 180);
  const ux = ((b[0] - a[0]) * 111_320 * k) / len;
  const uy = ((b[1] - a[1]) * 111_320) / len;
  // Far enough along the road to see a pole from the side, not from its foot.
  const back = Math.max(14, Math.min(25, near.meters * 0.8 + 10));
  return [offset(near.at, ux * back, uy * back), offset(near.at, -ux * back, -uy * back), near.at, step.at];
}

/**
 * For a line that runs cross-country, like transmission, places along the line itself within
 * reach of the site: a panorama close to one of them is where a road crosses it.
 */
export function alongLine(lines: LonLat[][], near: LonLat, reachM = 2500, everyM = 90, max = 28): LonLat[] {
  const out: LonLat[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const n = Math.max(1, Math.ceil(metersBetween(a, b) / everyM));
      for (let k = 0; k < n; k++) {
        const p: LonLat = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        if (metersBetween(p, near) <= reachM) out.push(p);
      }
    }
  }
  out.sort((p, q) => metersBetween(p, near) - metersBetween(q, near));
  return out.slice(0, max);
}

/** The panorama to stand at: close enough to see detail, not so close the camera looks straight up. */
export function bestPano(found: Found[], idealM = 18): Found | null {
  const usable = found.filter((f) => f.meters >= 6);
  const pool = usable.length ? usable : found;
  return [...pool].sort((a, b) => Math.abs(a.meters - idealM) - Math.abs(b.meters - idealM))[0] ?? null;
}

/** Aim at two thirds of the object's height, so a pole's top and crossarm are in frame, and zoom in on far things. */
export function aimAt(from: LonLat, step: GridStep): Aim {
  const d = Math.max(metersBetween(from, step.at), 1);
  const pitch = Math.max(-10, Math.min(35, Math.atan((step.heightM * 0.66 - 2.5) / d) * toDeg));
  return { heading: Math.round(bearing(from, step.at)), pitch: Math.round(pitch), zoom: d > 60 ? 2 : d > 25 ? 1.4 : 1 };
}

/** Google's horizontal field of view halves with each zoom level, from 180 degrees at zoom 0. */
export const fovOf = (zoom: number) => 180 / 2 ** zoom;

const roadLines = (features: MapFeature[]): LonLat[][] =>
  features
    .filter((f) => f.kind === "road")
    .flatMap((f) => (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [])) as LonLat[][];

async function stillPanorama(at: LonLat, targetOf: (pano: LonLat) => LonLat): Promise<Found | null> {
  const r = await fetch(`/api/street-view/metadata?lat=${at[1]}&lng=${at[0]}`);
  const body = (await r.json()) as { status: string; lat?: number; lng?: number; date?: string | null };
  if (body.status !== "OK" || body.lat === undefined || body.lng === undefined) return null;
  const pano: LonLat = [body.lng, body.lat];
  const target = targetOf(pano);
  return { id: `${body.lat},${body.lng}`, at: pano, date: body.date ?? null, meters: metersBetween(pano, target), target };
}

function Overlay({ camera, features, trace }: { camera: StreetCamera; features: MapFeature[]; trace: GridStep[] }) {
  const drawn = useMemo(() => itemsInPhoto(features, camera), [features, camera]);
  // Labels go where there's room, on leaders, so none sit on another label or object.
  const textOf = (m: { name: string; distanceFt: number }) => `${m.name.replace(/, (AT|ON) .*$/, "").slice(0, 30)} · ${m.distanceFt} ft`;
  const labels = useMemo(
    () => placeLabels(drawn.items.map((m) => ({ id: m.featureId, anchor: m.anchor, width: labelWidth(textOf(m), 12), height: 20 })), { width: camera.width, height: camera.height }),
    [drawn, camera],
  );
  const path = useMemo(
    () =>
      trace.flatMap((step) =>
        // A link no public source shows isn't drawn over a photo, where it would read as a route.
        (step.link && step.link.basis !== "not_public" ? step.link.line : []).flatMap((line) => {
          const pts = line.map((p) => projectPoint(camera, p, step.link!.heightM + 0.1));
          // Only stretches in front of the camera and within sight.
          const near = line.every((p) => metersBetween(p, [camera.lng, camera.lat]) < 150);
          return near && pts.every(inFront) ? [{ d: `M${pts.map((p) => `${p.x} ${p.y}`).join(" L")}`, known: true }] : [];
        }),
      ),
    [camera, trace],
  );
  return (
    <svg className="street-walk-overlay" viewBox={`0 0 ${camera.width} ${camera.height}`} aria-label="Equipment and the path to the grid, drawn from the record">
      {path.map((p, i) => (
        <path key={`p${i}`} d={p.d} fill="none" stroke={p.known ? "#ffb000" : "rgba(255,255,255,0.8)"} strokeWidth={p.known ? 4 : 2} strokeDasharray={p.known ? undefined : "6 5"} />
      ))}
      {drawn.wires.map((d, i) => (
        <path key={`w${i}`} d={d} fill="none" stroke="#ff3b30" strokeWidth={1.6} strokeDasharray="5 3" opacity={0.9} />
      ))}
      {drawn.items.map((m) => (
        <g key={m.featureId}>
          {m.outline.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={4} opacity={0.7} />
          ))}
          {m.outline.map((d, i) => (
            <path key={`c${i}`} d={d} fill="none" stroke={m.isNew ? "#3d8bff" : "#ff3b30"} strokeWidth={2} />
          ))}
        </g>
      ))}
      {labels.map((l) => {
        const m = drawn.items.find((item) => item.featureId === l.id)!;
        const color = m.isNew ? "#3d8bff" : "#ff3b30";
        return (
          <g key={`l-${l.id}`}>
            <line x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} stroke="#fff" strokeWidth={3.5} opacity={0.85} />
            <line x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} stroke={color} strokeWidth={1.6} />
            <circle cx={l.leader.x1} cy={l.leader.y1} r={3} fill={color} stroke="#fff" strokeWidth={1} />
            <rect x={l.x} y={l.y} width={l.width} height={l.height} rx={3} fill="rgba(20,24,28,0.82)" stroke={color} strokeWidth={1.2} />
            <text x={l.x + 5} y={l.y + 14} fontSize={12} fontWeight={700} fill="#fff" fontFamily="Arial, sans-serif">
              {textOf(m)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function StreetWalk({ record }: { record: RecordVersion }) {
  const trace = useMemo(() => gridPath(record), [record]);
  const stops = useMemo(() => {
    const near = trace.filter((s) => s.role !== "building");
    return near.length ? near : trace;
  }, [trace]);
  const roads = useMemo(() => roadLines(record.features), [record.features]);
  const host = useRef<HTMLDivElement>(null);
  const panoRef = useRef<Pano | null>(null);
  const serviceRef = useRef<{ getPanorama: (req: unknown) => Promise<{ data: { location: { pano: string; latLng: LatLng }; imageDate?: string } }> } | null>(null);
  const [mode, setMode] = useState<"loading" | "interactive" | "still">("loading");
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);
  const [camera, setCamera] = useState<StreetCamera | null>(null);

  // Interactive when Google allows the JavaScript API for this key; still photos otherwise.
  useEffect(() => {
    let cancelled = false;
    const listeners: { remove: () => void }[] = [];
    const fallBack = () => !cancelled && setMode("still");
    const off = onGoogleAuthFailure(fallBack);
    (async () => {
      const google = await loadGoogle();
      const lib = (await google.maps.importLibrary("streetView")) as unknown as Record<string, new (...args: unknown[]) => unknown>;
      if (cancelled || !host.current) return;
      const pano = new lib.StreetViewPanorama!(host.current, { addressControl: false, motionTracking: false, showRoadLabels: false, fullscreenControl: false, linksControl: true, clickToGo: true }) as Pano;
      panoRef.current = pano;
      serviceRef.current = new lib.StreetViewService!() as never;
      const sync = () => {
        const at = pano.getPosition();
        const el = host.current;
        if (!at || !el) return;
        const pov = pano.getPov();
        setCamera({ lat: at.lat(), lng: at.lng(), heading: pov.heading, pitch: pov.pitch, fov: fovOf(pano.getZoom() ?? 1), width: el.clientWidth, height: el.clientHeight });
      };
      listeners.push(pano.addListener("pov_changed", sync), pano.addListener("position_changed", sync), pano.addListener("zoom_changed", sync));
      setMode((m) => (m === "loading" ? "interactive" : m));
    })().catch(fallBack);
    return () => {
      cancelled = true;
      off();
      listeners.forEach((l) => l.remove());
      panoRef.current = null;
    };
  }, []);

  // At each stop, find the panorama that sees it best and aim at it.
  useEffect(() => {
    const step = stops[index];
    if (mode === "loading" || !step) return;
    let current = true;
    setFound(null);
    setAim(null);
    (async () => {
      const service = serviceRef.current;
      // A transmission line is looked at where a road crosses it, aiming at the nearest point of the line.
      const crossCountry = step.role === "transmission" && step.link ? step.link.line : null;
      const targetOf = (pano: LonLat): LonLat => (crossCountry ? closestOn(crossCountry, pano)!.at : step.at);
      const places = crossCountry ? alongLine(crossCountry, step.at) : lookFrom(step, roads);
      const tries = await Promise.all(
        places.map((location) =>
          (mode === "interactive" && service
            ? service
                .getPanorama({ location: { lat: location[1], lng: location[0] }, radius: 50, preference: "nearest", sources: ["outdoor"] })
                .then(({ data }): Found => {
                  const at: LonLat = [data.location.latLng.lng(), data.location.latLng.lat()];
                  const target = targetOf(at);
                  return { id: data.location.pano, at, date: data.imageDate ?? null, meters: metersBetween(at, target), target };
                })
            : stillPanorama(location, targetOf)
          ).catch(() => null),
        ),
      );
      // A pole reads best from about 18 m; a transmission line, tall and wide, from about 30 m.
      const best = bestPano(tries.filter((t): t is Found => t !== null), crossCountry ? 30 : 18);
      if (!current) return;
      if (!best) {
        setFound({ id: "", at: step.at, date: null, meters: 0, target: step.at });
        return;
      }
      const next = aimAt(best.at, { ...step, at: best.target });
      setFound(best);
      setAim(next);
      const pano = panoRef.current;
      if (mode === "interactive" && pano) {
        pano.setPano(best.id);
        pano.setPov({ heading: next.heading, pitch: next.pitch });
        pano.setZoom(next.zoom);
      } else {
        setCamera({ lat: best.at[1], lng: best.at[0], heading: next.heading, pitch: next.pitch, fov: fovOf(next.zoom), ...STILL });
      }
    })();
    return () => {
      current = false;
    };
  }, [index, stops, roads, mode]);

  const turn = (degrees: number) => {
    if (!aim || !found) return;
    const next = { ...aim, heading: (aim.heading + degrees + 360) % 360 };
    setAim(next);
    setCamera({ lat: found.at[1], lng: found.at[0], heading: next.heading, pitch: next.pitch, fov: fovOf(next.zoom), ...STILL });
  };

  const step = stops[index];
  if (!trace.length) return <p className="street-unavailable">No building on the record, so there's no service to follow.</p>;
  const still = mode === "still" && found?.id && aim && camera;
  return (
    <div className="street-walk">
      <div className="street-walk-frame" style={mode === "still" ? { aspectRatio: `${STILL.width} / ${STILL.height}`, minHeight: 0, alignSelf: "start" } : undefined}>
        {mode !== "still" ? <div ref={host} className="street-walk-pano" /> : null}
        {still ? (
          <img
            className="street-walk-still"
            src={`/api/sites/${record.site.id}/versions/${record.version}/street-view.jpg?lat=${found.at[1]}&lng=${found.at[0]}&heading=${camera.heading}&pitch=${camera.pitch}&fov=${Math.round(camera.fov)}`}
            alt={`Street View facing ${step?.title ?? "the equipment"}`}
          />
        ) : null}
        {camera && (mode === "interactive" || still) ? <Overlay camera={camera} features={record.features} trace={trace} /> : null}
        {mode === "loading" ? <p className="google-3d-status">Loading Street View…</p> : null}
      </div>
      <aside className="street-walk-steps" aria-label="Path to the grid">
        <h3>Walk the path to the grid</h3>
        <ol>
          {stops.map((s, i) => (
            <li key={`${s.role}-${i}`}>
              <button type="button" className={i === index ? "on" : ""} onClick={() => setIndex(i)}>
                <span className={`grid-tour-dot basis-${s.basis}`} aria-hidden />
                <span className="grid-tour-title">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        {step ? (
          <p className="grid-tour-detail">
            <strong>{BASIS_WORDS[step.basis]}.</strong> {step.detail}{" "}
            {found === null
              ? "Finding the panorama that sees it best…"
              : found.id
                ? `Panorama ${Math.round(found.meters * 3.28084)} ft away${found.date ? `, taken ${found.date}` : ""}. Imagery © Google.`
                : "Google has no Street View within about 160 ft of it."}
          </p>
        ) : null}
        <div className="grid-tour-buttons">
          <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Back
          </button>
          <button type="button" disabled={index >= stops.length - 1} onClick={() => setIndex(index + 1)}>
            Next
          </button>
          {mode === "still" ? (
            <>
              <button type="button" aria-label="Turn left" disabled={!still} onClick={() => turn(-30)}>
                ◀
              </button>
              <button type="button" aria-label="Turn right" disabled={!still} onClick={() => turn(30)}>
                ▶
              </button>
            </>
          ) : null}
        </div>
        <p className="note">
          {mode === "still"
            ? "Still photos: interactive Street View needs the Maps JavaScript API turned on for this key. "
            : mode === "interactive"
              ? "Drag to look around. "
              : ""}
          Outlines and the path are drawn from the record at their mapped positions, not read from the photo.
        </p>
      </aside>
    </div>
  );
}
