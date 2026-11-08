import type { MapFeature, RecordVersion, StreetView } from "@eqore/contract";
import { plainLabel } from "@eqore/sheets";
import { useEffect, useMemo, useState } from "react";
import type { EngineerApi } from "../api";
import { labelWidth, placeLabels } from "../app/labelPlacement";
import { inFront, onImage, projectPoint, type StreetCamera } from "../app/streetProjection";
import { equipmentSolids, equipmentTag, overheadWires, type Solid } from "../map/equipment3d";
import { StreetWalk } from "./StreetWalk";

// One street-level photo facing the grid connection, with each piece of equipment drawn where it
// stands: its true-size outline projected into the photo, so a pole is outlined along its height
// and a cabinet as a box, not pinned with a dot. Details open on click.

type Item = { featureId: string; name: string; isNew: boolean; outline: string[]; anchor: { x: number; y: number }; distanceFt: number };

const RED = "#ff3b30";
const BLUE = "#3d8bff";

export function itemsInPhoto(features: MapFeature[], camera: StreetCamera): { items: Item[]; wires: string[] } {
  const byFeature = new Map<string, Solid[]>();
  for (const s of equipmentSolids(features)) {
    // Wires are drawn as lines below, not as items.
    if (s.top - s.base < 0.2) continue;
    byFeature.set(s.featureId, [...(byFeature.get(s.featureId) ?? []), s]);
  }
  const items: Item[] = [];
  for (const [featureId, solids] of byFeature) {
    const feature = features.find((f) => f.id === featureId);
    if (!feature) continue;
    const segments: string[] = [];
    const tops: { x: number; y: number }[] = [];
    let behind = false;
    let nearest = Infinity;
    for (const s of solids) {
      const ring = s.ring.slice(0, -1);
      const bottom = ring.map((p) => projectPoint(camera, p, s.base));
      const top = ring.map((p) => projectPoint(camera, p, s.top));
      if ([...bottom, ...top].some((p) => !inFront(p))) {
        behind = true;
        break;
      }
      nearest = Math.min(nearest, ...bottom.map((p) => p.depth));
      // A pole (an octagon in plan): one line up its height reads better than a sliver of outline.
      if (ring.length >= 8) {
        const c = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
        const b = c(bottom);
        const t = c(top);
        segments.push(`M${b.x} ${b.y} L${t.x} ${t.y}`);
        tops.push(t);
      } else {
        const loop = (pts: { x: number; y: number }[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join(" L")} Z`;
        segments.push(loop(bottom), loop(top), ...bottom.map((p, i) => `M${p.x} ${p.y} L${top[i]!.x} ${top[i]!.y}`));
        tops.push(...top);
      }
    }
    if (behind || !tops.length) continue;
    const anchor = tops.reduce((best, p) => (p.y < best.y ? p : best), tops[0]!);
    if (!tops.some((p) => onImage({ ...p, depth: 1 }, camera))) continue;
    const isNew = /^\(N\)/.test(feature.label ?? "") || String((feature.attributes?.["basis"] as { value?: unknown } | undefined)?.value) === "concept";
    items.push({
      featureId,
      name: plainLabel(feature.label) || equipmentTag(feature)?.name || "",
      isNew,
      outline: segments,
      anchor: { x: Math.max(4, Math.min(camera.width - 4, anchor.x)), y: Math.max(4, Math.min(camera.height - 4, anchor.y)) },
      distanceFt: Math.round(nearest * 3.28084),
    });
  }
  const wires = overheadWires(features).flatMap((w) => {
    const pts = w.line.map((p) => projectPoint(camera, p, w.heightM));
    return pts.every(inFront) ? [`M${pts.map((p) => `${p.x} ${p.y}`).join(" L")}`] : [];
  });
  return { items: items.filter((i) => i.distanceFt <= 400).sort((a, b) => a.distanceFt - b.distanceFt).slice(0, 8), wires };
}

/** The interactive walk along the path to the grid, or the single annotated photo. */
export function StreetViewPanel({ api, record }: { api: EngineerApi; record: RecordVersion }) {
  const [mode, setMode] = useState<"walk" | "photo">("walk");
  return (
    <section className="street-view" aria-label="Street view">
      <div className="street-modes" role="tablist" aria-label="Street view mode">
        <button type="button" role="tab" aria-selected={mode === "walk"} className={mode === "walk" ? "on" : ""} onClick={() => setMode("walk")}>
          Walk to the grid
        </button>
        <button type="button" role="tab" aria-selected={mode === "photo"} className={mode === "photo" ? "on" : ""} onClick={() => setMode("photo")}>
          Annotated photo
        </button>
      </div>
      {mode === "walk" ? <StreetWalk record={record} /> : <StreetPhoto api={api} record={record} />}
    </section>
  );
}

function StreetPhoto({ api, record }: { api: EngineerApi; record: RecordVersion }) {
  const [view, setView] = useState<StreetView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [picked, setPicked] = useState<Item | null>(null);

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

  const drawn = useMemo(() => {
    if (!view || view.status !== "ok") return null;
    return itemsInPhoto(record.features, { lat: view.pano.lat, lng: view.pano.lng, ...view.camera });
  }, [view, record.features]);

  if (failed) return <p className="note street-note">{failed}</p>;
  if (!view) return <p className="note street-note">Finding the street photo facing the grid connection…</p>;
  if (view.status === "unavailable" || !drawn) {
    return (
      <div className="street-photo">
        <p className="street-unavailable">Street view isn't available: {view.status === "unavailable" ? view.reason : ""}</p>
      </div>
    );
  }

  const { width, height } = view.camera;
  const inside = view.markers.filter((m) => m.hidden && m.inFrame);
  // Each label goes in the nearest free spot around its item, on a leader, so none overlap.
  const BOX_H = 18;
  const FONT = 9;
  // One label per kind, as a drawing does: "(E) UTILITY POLE, TYP. OF 4".
  const kinds = new Map<string, Item[]>();
  for (const m of drawn.items) kinds.set(m.name, [...(kinds.get(m.name) ?? []), m]);
  const labelled = [...kinds.values()].map((group) => ({ ...group[0]!, name: group.length > 1 ? `${group[0]!.name}, TYP. OF ${group.length}` : group[0]!.name }));
  const textOf = (m: Item) => m.name.replace(/, (AT|ON) .*$/, "").slice(0, 40);
  const spots = placeLabels(
    labelled.map((m) => ({ id: m.featureId, anchor: m.anchor, width: labelWidth(textOf(m), FONT), height: BOX_H })),
    { width, height },
  );
  const placed = spots.map((s) => ({ m: labelled.find((m) => m.featureId === s.id)!, ...s }));
  return (
    <div className="street-photo">
      <p className="street-caption">
        Facing {plainLabel(view.target).toLowerCase()} · photo {view.pano.date ?? "date not given"} · Imagery © Google
      </p>
      <div className="street-frame" style={{ aspectRatio: `${width} / ${height}` }}>
        <img src={view.imagePath} alt={`Street View facing ${view.target}`} />
        <svg viewBox={`0 0 ${width} ${height}`} aria-label="Equipment in the photo">
          {drawn.wires.map((d, i) => (
            <path key={`w${i}`} d={d} fill="none" stroke={RED} strokeWidth={1.6} strokeDasharray="5 3" opacity={0.9} />
          ))}
          {drawn.items.map((m) => (
            <g key={m.featureId} style={{ cursor: "pointer" }} onClick={() => setPicked(m)}>
              {m.outline.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={4} opacity={0.75} />
              ))}
              {m.outline.map((d, i) => (
                <path key={`c${i}`} d={d} fill="none" stroke={m.isNew ? BLUE : RED} strokeWidth={2} />
              ))}
            </g>
          ))}
          {inside.map((m) => (
            <circle key={m.id} cx={m.x} cy={m.y} r={9} fill="rgba(255,255,255,0.5)" stroke={RED} strokeWidth={2} strokeDasharray="3 2" />
          ))}
          {placed.map(({ m, x, y, width: w, leader }) => {
            const color = m.isNew ? BLUE : RED;
            return (
              <g key={`l-${m.featureId}`} style={{ cursor: "pointer" }} onClick={() => setPicked(m)}>
                <line x1={leader.x1} y1={leader.y1} x2={leader.x2} y2={leader.y2} stroke="#fff" strokeWidth={3} opacity={0.8} />
                <line x1={leader.x1} y1={leader.y1} x2={leader.x2} y2={leader.y2} stroke={color} strokeWidth={1.3} />
                <circle cx={leader.x1} cy={leader.y1} r={2.5} fill={color} stroke="#fff" strokeWidth={1} />
                <rect x={x} y={y} width={w} height={BOX_H} rx={2} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
                <text x={x + 5} y={y + 12.5} fontSize={FONT} fontWeight={700} fill={color} fontFamily="Arial, sans-serif">
                  {textOf(m)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {picked ? (
        <aside className="street-details" aria-label="Item details">
          <h3>{picked.name}</h3>
          <p>{picked.distanceFt} ft from the camera.</p>
          <button type="button" onClick={() => setPicked(null)}>
            Close
          </button>
        </aside>
      ) : null}
      <details className="street-about">
        <summary>How this view is made</summary>
        <p className="note">
          The photo is Google Street View from the closest point on a mapped road, facing the grid connection. Each item is drawn from the site record at its
          true size and position, projected through the camera Google reports; nothing is read from the photo. Small position errors in the record or the
          camera shift an outline by a few pixels.
        </p>
      </details>
    </div>
  );
}
