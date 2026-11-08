import type { RecordVersion, StreetView } from "@eqore/contract";
import { useEffect, useState } from "react";
import type { EngineerApi } from "../api";

type Marker = StreetView["markers"][number];

const COLOR: Record<Marker["basis"], string> = { detected: "#b5121b", inferred: "#b5121b", concept: "#0b5cad" };

/** One street-level photo facing the likely grid connection, with our equipment drawn where it should be. */
export function StreetViewPanel({ api, record }: { api: EngineerApi; record: RecordVersion }) {
  const [view, setView] = useState<StreetView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setView(null);
    setFailed(null);
    api
      .readStreetView(record.site.id, record.version)
      .then((next) => current && setView(next))
      .catch((error: unknown) => current && setFailed(error instanceof Error ? error.message : "Street View couldn't be loaded."));
    return () => {
      current = false;
    };
  }, [api, record.site.id, record.version]);

  if (failed) return <p className="note street-note">{failed}</p>;
  if (!view) return <p className="note street-note">Finding the nearest street photo facing the likely connection…</p>;
  if (view.status === "unavailable") {
    return (
      <section className="street-view" aria-label="Street view">
        <p className="street-unavailable">Street view isn't available: {view.reason}</p>
      </section>
    );
  }

  const { width, height } = view.camera;
  // The connection chain first, then the nearest of everything else, so the photo stays readable.
  const rank = (m: Marker) => (m.hidden ? 0 : /SERVICE|ENTRANCE|DROP/.test(m.label) ? 1 : m.basis === "concept" ? 2 : 3);
  const near = view.markers.filter((m) => m.inFrame && m.distanceFt <= 400).sort((a, b) => rank(a) - rank(b) || a.distanceFt - b.distanceFt);
  const shown = near.slice(0, 8);
  const offFrame = view.markers.filter((m) => !shown.includes(m));
  // Labels stack in a column on each side, each on a leader to its marker, as a drawing does.
  const BOX_W = 214;
  const BOX_H = 30;
  const placed = (["left", "right"] as const).flatMap((side) =>
    shown
      .filter((m) => (side === "left" ? m.x < width / 2 : m.x >= width / 2))
      .sort((a, b) => a.y - b.y)
      .map((m, i) => ({ m, x: side === "left" ? 6 : width - BOX_W - 6, y: 8 + i * (BOX_H + 6), side })),
  );
  return (
    <section className="street-view" aria-label="Street view">
      <p className="street-caption">
        Facing {view.target.toLowerCase()} · heading {view.camera.heading}° · photo {view.pano.date ?? "date not given"} · Imagery © Google
      </p>
      <div className="street-frame" style={{ aspectRatio: `${width} / ${height}` }}>
        <img src={view.imagePath} alt={`Street View facing ${view.target}`} />
        <svg viewBox={`0 0 ${width} ${height}`} aria-label="Equipment markers">
          {placed.map(({ m, x, y, side }) => {
            const color = COLOR[m.basis];
            const anchorX = side === "left" ? x + BOX_W : x;
            return (
              <g key={m.id}>
                <line x1={anchorX} y1={y + BOX_H / 2} x2={m.x} y2={m.y} stroke={color} strokeWidth={1.2} strokeDasharray={m.hidden ? "4 3" : undefined} />
                <circle cx={m.x} cy={m.y} r={m.hidden ? 8 : 5} fill={m.hidden ? "rgba(255,255,255,0.6)" : color} stroke={color} strokeWidth={2} strokeDasharray={m.hidden ? "3 2" : undefined} />
                <rect x={x} y={y} width={BOX_W} height={BOX_H} fill="rgba(255,255,255,0.93)" stroke={color} strokeWidth={1} strokeDasharray={m.hidden ? "4 2" : undefined} />
                <text x={x + 5} y={y + 12} fontSize={8.5} fontWeight={700} fill={color} fontFamily="Arial, sans-serif">
                  {(m.hidden ? `INSIDE: ${m.label.replace(/^\(E\)\s*/, "")}` : m.label).slice(0, 46)}
                </text>
                <text x={x + 5} y={y + 24} fontSize={7.5} fill="#222" fontFamily="Arial, sans-serif">
                  {`${m.note.slice(0, 50)} · ±${m.distanceFt} FT`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="note">
        Markers are placed from our record, not read from the photo: detected in public lidar, inferred from public data, or a concept location. Dashed
        markers are inside the building and not visible from the street. Photo positions are approximate.
      </p>
      {offFrame.length ? (
        <p className="note">Also on the record, not marked here: {offFrame.map((m) => `${m.label} (±${m.distanceFt} ft${m.inFrame ? "" : ", outside this view"})`).join("; ")}.</p>
      ) : null}
    </section>
  );
}
