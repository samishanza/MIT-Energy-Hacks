import type { MapFeature, RecordVersion } from "@eqore/contract";

// How the building most likely connects to the grid, link by link, from what the record holds:
// the building, where the service enters, the drop or service path, the transformer, the pole,
// the distribution line, the substation, and the transmission line behind it. Each step says what
// it rests on. Where no public source shows a link, the step says so instead of drawing a route.

type LonLat = [number, number];

/** What a step's position rests on. */
export type StepBasis = "detected" | "inferred" | "mapped" | "not_public";

export type StepRole = "building" | "service_entrance" | "service_drop" | "transformer" | "pole" | "distribution" | "substation" | "transmission";

export interface GridStep {
  role: StepRole;
  title: string;
  detail: string;
  basis: StepBasis;
  /** The record feature this step draws, when there is one. */
  featureId: string | null;
  field: string | null;
  /** Where to look for it. */
  at: LonLat;
  /** About how high the thing is, for aiming a camera at it. */
  heightM: number;
  /** The link from the previous step: its route, and what that route rests on. */
  link: { line: LonLat[][]; heightM: number; basis: StepBasis; distanceFt: number } | null;
}

const M_PER_DEG = 111_320;
const FT = 3.28084;
const attr = (f: MapFeature, key: string) => (f.attributes?.[key] as { value?: unknown } | undefined)?.value;
const typeOf = (f: MapFeature) => String(attr(f, "equipment_type") ?? "");
const classOf = (f: MapFeature) => String(attr(f, "line_class") ?? "");

export function metersBetween([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const k = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lon2 - lon1) * M_PER_DEG * k, (lat2 - lat1) * M_PER_DEG);
}

const linesOf = (f: MapFeature): LonLat[][] =>
  f.geometry.type === "LineString" ? [f.geometry.coordinates as LonLat[]] : f.geometry.type === "MultiLineString" ? (f.geometry.coordinates as LonLat[][]) : [];
const pointOf = (f: MapFeature): LonLat | null => (f.geometry.type === "Point" ? (f.geometry.coordinates as LonLat) : null);

/** The closest point on a set of lines to a point. */
export function closestOn(lines: LonLat[][], to: LonLat): { at: LonLat; meters: number } | null {
  const k = Math.cos((to[1] * Math.PI) / 180);
  let best: { at: LonLat; meters: number } | null = null;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const a = line[i]!;
      const b = line[Math.min(i + 1, line.length - 1)]!;
      const ax = (a[0] - to[0]) * k, ay = a[1] - to[1];
      const dx = (b[0] - a[0]) * k, dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const at: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const meters = metersBetween(at, to);
      if (!best || meters < best.meters) best = { at, meters };
    }
  }
  return best;
}

function mainBuilding(features: MapFeature[]): { ring: LonLat[]; centre: LonLat } | null {
  const area = (ring: LonLat[]) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0));
  const ring = features
    .filter((f) => f.kind === "building_outline")
    .flatMap((f) => (f.geometry.type === "Polygon" ? [(f.geometry.coordinates as LonLat[][])[0]!] : f.geometry.type === "MultiPolygon" ? (f.geometry.coordinates as LonLat[][][]).map((p) => p[0]!) : []))
    .sort((a, b) => area(b) - area(a))[0];
  if (!ring) return null;
  const pts = ring.slice(0, -1).length ? ring.slice(0, -1) : ring;
  return { ring, centre: [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] };
}

function nearest<T>(items: T[], at: LonLat, where: (item: T) => LonLat | null): { item: T; meters: number } | null {
  let best: { item: T; meters: number } | null = null;
  for (const item of items) {
    const p = where(item);
    if (!p) continue;
    const meters = metersBetween(p, at);
    if (!best || meters < best.meters) best = { item, meters };
  }
  return best;
}

/** Conductor spans joined to a pole, followed span to span along the street. */
function lineFromPole(conductors: MapFeature[], pole: LonLat): LonLat[][] {
  const spans = conductors.flatMap(linesOf).filter((l) => l.length >= 2);
  const touches = (l: LonLat[], p: LonLat) => metersBetween(l[0]!, p) < 4 || metersBetween(l[l.length - 1]!, p) < 4;
  const taken = new Set<number>();
  const frontier: LonLat[] = [pole];
  while (frontier.length) {
    const p = frontier.pop()!;
    spans.forEach((l, i) => {
      if (taken.has(i) || !touches(l, p)) return;
      taken.add(i);
      frontier.push(l[0]!, l[l.length - 1]!);
    });
  }
  return [...taken].map((i) => spans[i]!);
}

const ft = (m: number) => Math.round(m * FT);
const straight = (a: LonLat, b: LonLat, heightM: number, basis: StepBasis) => ({ line: [[a, b]], heightM, basis, distanceFt: ft(metersBetween(a, b)) });

export function gridPath(record: Pick<RecordVersion, "features" | "values">): GridStep[] {
  const features = record.features;
  const building = mainBuilding(features);
  if (!building) return [];
  const steps: GridStep[] = [];
  const last = () => steps[steps.length - 1]!;
  const valueText = (field: string) => {
    const v = record.values.find((x) => x.field === field)?.current;
    return v && v.type === "text" ? v.value : null;
  };

  steps.push({ role: "building", title: "Building", detail: "The main roofprint on the parcel.", basis: "mapped", featureId: null, field: null, at: building.centre, heightM: 5, link: null });

  const drop = features.find((f) => f.kind === "utility_line" && classOf(f) === "detected service drop");
  const path = features.find((f) => f.kind === "utility_line" && classOf(f) === "inferred service path");
  const entrance = features.find((f) => typeOf(f) === "service_entrance" && pointOf(f));
  const tap = features.find((f) => typeOf(f) === "service_tap" && pointOf(f));
  const poles = features.filter((f) => typeOf(f) === "utility_pole" && pointOf(f));
  const pads = features.filter((f) => typeOf(f) === "pad_mount_transformer_candidate" && pointOf(f));

  // Where the service meets the building: the detected drop's wall end, else the inferred entrance.
  const dropLine = drop ? linesOf(drop)[0] : undefined;
  const dropEnds = dropLine && dropLine.length >= 2 ? [dropLine[0]!, dropLine[dropLine.length - 1]!] : null;
  const wallEnd = dropEnds ? (closestOn([building.ring], dropEnds[0]!)!.meters <= closestOn([building.ring], dropEnds[1]!)!.meters ? dropEnds[0]! : dropEnds[1]!) : null;
  const streetEnd = dropEnds && wallEnd ? (wallEnd === dropEnds[0] ? dropEnds[1]! : dropEnds[0]!) : null;
  if (wallEnd) {
    steps.push({ role: "service_entrance", title: "Service entrance", detail: "Where the detected service drop meets the wall. The meter and main switchgear are usually just inside or on this wall.", basis: "detected", featureId: drop!.id, field: drop!.field, at: wallEnd, heightM: 4, link: null });
  } else if (entrance) {
    steps.push({ role: "service_entrance", title: "Service entrance", detail: "The wall facing the nearest mapped line, where a service usually enters. Not field verified.", basis: "inferred", featureId: entrance.id, field: entrance.field, at: pointOf(entrance)!, heightM: 2, link: null });
  }

  // The supply side of the service: a drop seen in lidar, else the path inferred from the line maps.
  if (drop && streetEnd && wallEnd) {
    steps.push({ role: "service_drop", title: "Overhead service drop", detail: "Wires seen in public lidar running from the street to the building.", basis: "detected", featureId: drop.id, field: drop.field, at: streetEnd, heightM: 6, link: { line: [dropLine!], heightM: 6, basis: "detected", distanceFt: ft(metersBetween(wallEnd, streetEnd)) } });
  }

  // The transformer: a pole-top can at the tap on an overhead line, a pad-mounted box on an underground one.
  const from = last().at;
  const pad = nearest(pads, building.centre, pointOf);
  const construction = tap ? String(attr(tap, "construction") ?? "") : "";
  if (pad && pad.meters < 80 && !drop) {
    const at = pointOf(pad.item)!;
    steps.push({ role: "transformer", title: "Equipment box, possibly a pad-mounted transformer", detail: "A box seen in lidar near the building. It could also be a generator or other equipment.", basis: "detected", featureId: pad.item.id, field: pad.item.field, at, heightM: 1.2, link: straight(from, at, 0.3, "not_public") });
  } else if (tap && !drop) {
    const at = pointOf(tap)!;
    const kind = construction === "underground" ? "pad-mounted transformer" : construction === "overhead" ? "pole-top transformer" : "transformer";
    steps.push({ role: "transformer", title: `Likely ${kind}`, detail: `Where the service most likely taps the mapped line. On ${construction || "this"} line that is usually a ${kind}. Inferred, not field verified.`, basis: "inferred", featureId: tap.id, field: tap.field, at, heightM: construction === "underground" ? 1.2 : 7.5, link: path ? { line: linesOf(path), heightM: 0.3, basis: "inferred", distanceFt: ft(metersBetween(from, at)) } : straight(from, at, 0.3, "inferred") });
  }

  // The pole the service hangs from, or the nearest one to where it leaves the street.
  // From the building itself, measure to its walls, so a large building's own poles aren't missed.
  const poleFrom = last().role === "building" ? (p: LonLat) => closestOn([building.ring], p)!.meters : (p: LonLat) => metersBetween(p, last().at);
  const pole = poles
    .map((item) => ({ item, meters: poleFrom(pointOf(item)!) }))
    .sort((a, b) => a.meters - b.meters)[0];
  if (pole && pole.meters < 120) {
    const at = pointOf(pole.item)!;
    const heightM = (Number(attr(pole.item, "height_ft")) || 35) / FT;
    const joined = drop && pole.meters < 6;
    steps.push({
      role: "pole",
      title: joined ? "Utility pole the drop hangs from" : "Nearest utility pole",
      detail: joined ? "Detected in public lidar at the street end of the service drop. A pole-top transformer, if there is one, sits near its top." : "The detected pole nearest the service. Which pole serves the building isn't public.",
      basis: "detected",
      featureId: pole.item.id,
      field: pole.item.field,
      at,
      heightM,
      link: joined ? null : straight(last().role === "building" ? closestOn([building.ring], at)!.at : last().at, at, 0.3, "not_public"),
    });
  }

  // The distribution line: wires seen in lidar from that pole, and the feeder the utility maps nearby.
  const conductors = features.filter((f) => f.kind === "utility_line" && classOf(f) === "detected overhead conductor");
  const wires = pole ? lineFromPole(conductors, pointOf(pole.item)!) : [];
  const feeders = features.filter((f) => f.kind === "utility_line" && (classOf(f) === "distribution segment" || classOf(f) === "feeder candidate"));
  const feeder = nearest(feeders, last().at, (f) => closestOn(linesOf(f), last().at)?.at ?? null);
  const feederName = feeder ? String(attr(feeder.item, "feeder") ?? attr(feeder.item, "feeder_id") ?? "") || valueText("feeder") : null;
  if (feeder && feeder.meters < 300) {
    const near = closestOn(linesOf(feeder.item), last().at)!;
    const onIt = near.meters < 3;
    steps.push({
      role: "distribution",
      title: feederName ? `Distribution feeder ${feederName}` : "Distribution feeder",
      detail: `${onIt ? "The utility's mapped line the service most likely taps" : `The utility's mapped line nearest the service, about ${ft(near.meters)} ft away`}${wires.length ? `, with ${wires.length} span${wires.length === 1 ? "" : "s"} of overhead wire seen in lidar from the pole` : ""}. Mapped positions are schematic.`,
      basis: "mapped",
      featureId: feeder.item.id,
      field: feeder.item.field,
      at: near.at,
      heightM: 9,
      link: wires.length
        ? { line: wires, heightM: 9.5, basis: "detected", distanceFt: ft(near.meters) }
        : onIt
          ? null
          : { line: [[last().at, near.at]], heightM: 0.3, basis: "not_public", distanceFt: ft(near.meters) },
    });
  } else if (wires.length) {
    const mid = wires[0]![Math.floor(wires[0]!.length / 2)]!;
    steps.push({
      role: "distribution",
      title: "Distribution line along the street",
      detail: `${wires.length} span${wires.length === 1 ? "" : "s"} of overhead wire seen in public lidar from the pole. The utility doesn't publish which feeder this is.`,
      basis: "detected",
      featureId: null,
      field: "detected_grid_equipment",
      at: mid,
      heightM: 9.5,
      link: { line: wires, heightM: 9.5, basis: "detected", distanceFt: ft(metersBetween(last().at, mid)) },
    });
  }

  // The substation: the one the utility names for the feeder, else the nearest one it maps.
  const substations = features.filter((f) => f.kind === "substation" && pointOf(f) && !/proposed/i.test(f.label ?? ""));
  const named = valueText("feeder_substation");
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = named ? substations.find((s) => norm(s.label ?? "").includes(norm(named)) || norm(named).includes(norm(s.label ?? "-"))) : undefined;
  const sub = match ? { item: match, meters: metersBetween(pointOf(match)!, building.centre) } : nearest(substations, building.centre, pointOf);
  if (sub) {
    const at = pointOf(sub.item)!;
    steps.push({
      role: "substation",
      title: `${match ? "Feeder's substation" : "Nearest mapped substation"}: ${(sub.item.label ?? "unnamed").replace(/^substation:?\s*/i, "")}`,
      detail: match
        ? `National Grid names ${named} as this feeder's substation. ${ft(sub.meters).toLocaleString()} ft from the building. The feeder's route to it isn't public.`
        : `${ft(sub.meters).toLocaleString()} ft from the building. Distance doesn't show which substation serves the site${named ? `; the utility names ${named}, which isn't in the mapped layer here` : ""}.`,
      basis: "mapped",
      featureId: sub.item.id,
      field: sub.item.field,
      at,
      heightM: 6,
      link: straight(last().at, at, 0.3, "not_public"),
    });
  } else if (named) {
    steps.push({ role: "substation", title: `Feeder's substation: ${named}`, detail: "The utility names it, but its location isn't in a mapped layer here.", basis: "not_public", featureId: null, field: "feeder_substation", at: last().at, heightM: 6, link: null });
  }

  // Transmission behind it: the nearest mapped line. It feeds substations, not the building.
  const transmission = features.filter((f) => f.kind === "utility_line" && f.field === "transmission_nearby");
  const anchor = sub ? pointOf(sub.item)! : last().at;
  const tx = nearest(transmission, anchor, (f) => closestOn(linesOf(f), anchor)?.at ?? null);
  if (tx) {
    const near = closestOn(linesOf(tx.item), anchor)!;
    const kv = Number(attr(tx.item, "line_voltage"));
    const ends = [attr(tx.item, "line_from"), attr(tx.item, "line_to")].filter((x) => x && !/^UNKNOWN/i.test(String(x))).join(" to ");
    const owner = attr(tx.item, "line_owner");
    const linksSub = sub && ends && norm(ends).includes(norm((sub.item.label ?? "").split(/\s/)[0] ?? "-"));
    steps.push({
      role: "transmission",
      title: `${kv > 0 ? `${kv} kV ` : ""}transmission line${ends ? `, ${ends}` : ""}`,
      detail: `The nearest mapped transmission line${owner ? `, owned by ${owner} per the national layer` : ""}, ${ft(metersBetween(near.at, building.centre)).toLocaleString()} ft from the building. It feeds substations, not the building directly.`,
      basis: "mapped",
      featureId: tx.item.id,
      field: tx.item.field,
      at: near.at,
      heightM: 20,
      link: { line: linesOf(tx.item), heightM: 20, basis: linksSub ? "mapped" : "not_public", distanceFt: ft(metersBetween(anchor, near.at)) },
    });
  }
  return steps;
}

export const BASIS_WORDS: Record<StepBasis, string> = {
  detected: "Detected in public lidar",
  inferred: "Inferred, not field verified",
  mapped: "Mapped in a public layer",
  not_public: "Route not public",
};
