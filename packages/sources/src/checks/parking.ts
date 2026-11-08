import jpeg from "jpeg-js";
import type { MapFeature, Observation, Source, SourceRun } from "@eqore/contract";
import { observe, type CollectContext } from "../arcgis.ts";

// Parking stalls read from the aerial imagery: the painted stripes inside the paved areas. A stripe is a thin
// bright line on darker asphalt, so the detector finds short bright segments, seeds a row from two parallel ones
// a stall apart, then walks along the row reading the stripe response across the stall depth, where peaks repeat
// every stall width. Cars hide much of each stripe, so a row may skip up to two hidden stripes. Each row becomes
// an outline and one line per stall boundary at the measured spacing: what the striping shows, not a survey.

export type DecodedImage = { width: number; height: number; data: Uint8Array };
export type ImageDecoder = (bytes: Uint8Array) => DecodedImage;

// The decoder for imagery tiles served as JPEG.
export const decodeJpeg: ImageDecoder = (bytes) => {
  const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
  return { width: image.width, height: image.height, data: image.data as Uint8Array };
};
export type StallImagery = { tileUrlTemplate: string; zoom: number; source: Source; sourceDate: string };

type Vec = [number, number];
export type StallRow = { start: Vec; end: Vec; across: Vec; depthM: number; spacingM: number; stalls: number };

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k];
const norm = (a: Vec): Vec => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

// Stall rows in an image, in pixel coordinates. gray and saturation are per pixel; mask marks paved pixels.
export function detectStallRows(gray: Float32Array, saturation: Float32Array, mask: Uint8Array, width: number, height: number, metresPerPixel: number): StallRow[] {
  const mpp = metresPerPixel;
  // The asphalt's level: the median of each 8 m block of pavement, interpolated between blocks. It follows
  // shadows, and a parked car can't move it.
  const block = Math.max(8, Math.round(8 / mpp));
  const bw = Math.ceil(width / block), bh = Math.ceil(height / block);
  const pavedValues: number[] = [];
  for (let i = 0; i < gray.length; i += 7) if (mask[i]) pavedValues.push(gray[i]!);
  const overall = median(pavedValues.length ? pavedValues : [...gray.filter((_, i) => i % 7 === 0)]);
  const levels = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const values: number[] = [];
    for (let y = by * block; y < Math.min(height, (by + 1) * block); y += 2) for (let x = bx * block; x < Math.min(width, (bx + 1) * block); x += 2) if (mask[y * width + x]) values.push(gray[y * width + x]!);
    levels[by * bw + bx] = values.length > 10 ? median(values) : overall;
  }
  const levelAt = (x: number, y: number) => {
    const fx = Math.max(0, Math.min(bw - 1, x / block - 0.5)), fy = Math.max(0, Math.min(bh - 1, y / block - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    return (levels[y0 * bw + x0]! * (1 - ax) + levels[y0 * bw + x1]! * ax) * (1 - ay) + (levels[y1 * bw + x0]! * (1 - ax) + levels[y1 * bw + x1]! * ax) * ay;
  };
  // Contrast against the local mean over about 3 m of that level-clamped image, so dark and white cars barely
  // shift the background and their edges don't read as paint.
  const k = Math.max(3, Math.round(3 / mpp) | 1), r = (k - 1) / 2;
  const clamped = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const level = levelAt(x, y);
    clamped[y * width + x] = Math.max(level - 25, Math.min(level + 25, gray[y * width + x]!));
  }
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += clamped[y * width + x]!;
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1]! + row;
    }
  }
  const contrast = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(width, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(height, y + r + 1);
    const sum = integral[y1 * (width + 1) + x1]! - integral[y0 * (width + 1) + x1]! - integral[y1 * (width + 1) + x0]! + integral[y0 * (width + 1) + x0]!;
    contrast[y * width + x] = gray[y * width + x]! - sum / ((x1 - x0) * (y1 - y0));
  }

  // Stripes: thin, bright, unsaturated, elongated pieces on the pavement.
  type Stripe = { c: Vec; d: Vec; lengthM: number; angle: number };
  const white = new Uint8Array(width * height);
  for (let i = 0; i < white.length; i++) white[i] = mask[i] && contrast[i]! > 20 && saturation[i]! < 45 ? 1 : 0;
  const seen = new Uint8Array(width * height);
  const stripes: Stripe[] = [];
  for (let start = 0; start < white.length; start++) {
    if (!white[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]!, x = i % width, y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (white[j] && !seen[j]) { seen[j] = 1; queue.push(j); }
      }
    }
    if (queue.length < 8 || queue.length > 4000) continue;
    let mx = 0, my = 0;
    for (const i of queue) { mx += i % width; my += Math.floor(i / width); }
    mx /= queue.length; my /= queue.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const i of queue) { const dx = (i % width) - mx, dy = Math.floor(i / width) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= queue.length; syy /= queue.length; sxy /= queue.length;
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const major = tr / 2 + disc, minor = Math.max(1e-6, tr / 2 - disc);
    const d = norm(Math.abs(sxy) > 1e-9 ? [major - syy, sxy] : sxx >= syy ? [1, 0] : [0, 1]);
    let lo = Infinity, hi = -Infinity;
    for (const i of queue) { const t = ((i % width) - mx) * d[0] + (Math.floor(i / width) - my) * d[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    const lengthM = (hi - lo) * mpp, widthM = 4 * Math.sqrt(minor) * mpp;
    if (lengthM >= 1.2 && lengthM <= 7 && widthM <= 0.5 && lengthM / Math.max(widthM, 0.05) > 5) {
      stripes.push({ c: [mx, my], d, lengthM, angle: ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 180) % 180 });
    }
  }

  // Seeds: parallel stripes a stall or a few apart, side by side with their ends lined up.
  const links: number[][] = stripes.map(() => []);
  for (let i = 0; i < stripes.length; i++) for (let j = i + 1; j < stripes.length; j++) {
    const a = stripes[i]!, b = stripes[j]!;
    const turn = Math.min(Math.abs(a.angle - b.angle), 180 - Math.abs(a.angle - b.angle));
    if (turn > 12) continue;
    const v: Vec = [(b.c[0] - a.c[0]) * mpp, (b.c[1] - a.c[1]) * mpp];
    const apart = Math.hypot(v[0], v[1]);
    if (apart >= 2.2 && apart <= 8 && Math.abs(dot(v, a.d)) <= 1.5) { links[i]!.push(j); links[j]!.push(i); }
  }
  const sample = (field: Float32Array | Uint8Array, p: Vec) => {
    const x = Math.round(p[0]), y = Math.round(p[1]);
    return x >= 0 && y >= 0 && x < width && y < height ? field[y * width + x]! : 0;
  };
  const rows: { c0: Vec; along: Vec; across: Vec; t0: number; t1: number; depthM: number; spacingM: number }[] = [];
  const grouped = new Set<number>();
  for (let s = 0; s < stripes.length; s++) {
    if (grouped.has(s) || links[s]!.length === 0) continue;
    const group = [s];
    grouped.add(s);
    for (let q = 0; q < group.length; q++) for (const j of links[group[q]!]!) if (!grouped.has(j)) { grouped.add(j); group.push(j); }
    const members = group.map((i) => stripes[i]!);
    const across = norm(members.reduce<Vec>((sum, m) => add(sum, dot(m.d, members[0]!.d) >= 0 ? m.d : [-m.d[0], -m.d[1]]), [0, 0]));
    const c0: Vec = [members.reduce((sum, m) => sum + m.c[0], 0) / members.length, members.reduce((sum, m) => sum + m.c[1], 0) / members.length];
    // The row runs through the stripe centres.
    let cxx = 0, cyy = 0, cxy = 0;
    for (const m of members) { const v = sub(m.c, c0); cxx += v[0] * v[0]; cyy += v[1] * v[1]; cxy += v[0] * v[1]; }
    const tr = cxx + cyy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (cxx * cyy - cxy * cxy)));
    const along = norm(Math.abs(cxy) > 1e-9 ? [tr / 2 + disc - cyy, cxy] : cxx >= cyy ? [1, 0] : [0, 1]);
    const depthM = Math.max(4.5, Math.min(5.8, Math.max(...members.map((m) => m.lengthM))));
    // A thin line across the row: brighter than the pavement 0.45 m either side along the row. A car, about 1.8 m
    // wide, is as bright on both sides as at its middle, so it scores near nothing.
    const side = 0.45 / mpp;
    const thin = (p: Vec) => Math.max(0, sample(contrast, p) - 0.5 * (sample(contrast, add(p, along, side)) + sample(contrast, add(p, along, -side))));
    const depth = depthM / mpp;
    const step = 0.25 / mpp;
    const ts: number[] = [], profile: number[] = [], paved: boolean[] = [];
    for (let t = -80 / mpp; t <= 80 / mpp; t += step) {
      const p = add(c0, along, t);
      let sum = 0, inside = 0;
      for (let k2 = 0; k2 < 9; k2++) sum += thin(add(p, across, -depth / 2 + (depth * k2) / 8));
      for (let k2 = 0; k2 < 5; k2++) inside += sample(mask, add(p, across, -depth / 2 + (depth * k2) / 4)) ? 1 : 0;
      ts.push(t * mpp); profile.push(sum / 9); paved.push(inside / 5 > 0.6);
    }
    const at = (tm: number) => profile[Math.max(0, Math.min(profile.length - 1, Math.round((tm + 80) / 0.25)))]!;
    const threshold = 0.45 * median(members.map((m) => at(dot(sub(m.c, c0), along) * mpp)));
    const peaks: number[] = [];
    for (let i = 1; i < profile.length - 1; i++) if (paved[i] && profile[i]! >= threshold && profile[i]! >= profile[i - 1]! && profile[i]! >= profile[i + 1]!) peaks.push(ts[i]!);
    if (peaks.length < 2) continue;
    const centre = peaks.reduce((best, p, i) => (Math.abs(p) < Math.abs(peaks[best]!) ? i : best), 0);
    const kept = [peaks[centre]!];
    for (const direction of [1, -1]) {
      let last = peaks[centre]!;
      for (let i = centre + direction; i >= 0 && i < peaks.length; i += direction) {
        const gap = Math.abs(peaks[i]! - last);
        if (gap < 2.2) continue;
        if (gap > 3.6 * 3) break;
        kept.push(peaks[i]!);
        last = peaks[i]!;
      }
    }
    kept.sort((a, b) => a - b);
    if (kept.length < 3) continue;
    const gaps = kept.slice(1).map((p, i) => p - kept[i]!).filter((g) => g >= 2.2 && g <= 3.6);
    if (!gaps.length) continue;
    // Place the band across the row. The visible stripe pieces mark the aisle end of the stalls, and parked cars
    // hide the rest, so where the visible span is short the band runs from it one stall depth toward the side
    // with the cars. Where the stripes show for the whole depth, the band centres on them.
    const reach = 8;
    const offsets: number[] = [];
    for (let o = -reach; o <= reach + 1e-9; o += 0.25) offsets.push(o);
    const stripeAcross = offsets.map((o) => kept.reduce((sum, tm) => sum + thin(add(add(c0, along, tm / mpp), across, o / mpp)), 0));
    const stallCentres = kept.slice(1).map((tm, i) => (tm + kept[i]!) / 2);
    const carsAcross = offsets.map((o) => stallCentres.reduce((sum, tm) => sum + Math.abs(sample(contrast, add(add(c0, along, tm / mpp), across, o / mpp))), 0));
    const peak = stripeAcross.indexOf(Math.max(...stripeAcross));
    let lo = peak, hi = peak;
    const strong = 0.35 * stripeAcross[peak]!;
    while (lo > 0 && stripeAcross[lo - 1]! >= strong) lo--;
    while (hi < offsets.length - 1 && stripeAcross[hi + 1]! >= strong) hi++;
    const [visibleLo, visibleHi] = [offsets[lo]!, offsets[hi]!];
    const meanOver = (from: number, to: number) => {
      const picked = offsets.map((o, i) => (o >= from && o <= to ? carsAcross[i]! : null)).filter((v): v is number => v !== null);
      return picked.length ? picked.reduce((a, b) => a + b, 0) / picked.length : 0;
    };
    let bandCentre: number;
    if (visibleHi - visibleLo >= 0.8 * depthM) bandCentre = (visibleLo + visibleHi) / 2;
    else if (meanOver(visibleHi, visibleLo + depthM) >= meanOver(visibleHi - depthM, visibleLo)) bandCentre = visibleLo + depthM / 2;
    else bandCentre = visibleHi - depthM / 2;
    const offset = bandCentre / mpp;
    rows.push({ c0: add(c0, across, offset), along, across, t0: kept[0]!, t1: kept.at(-1)!, depthM, spacingM: median(gaps) });
  }

  // The same row seeded twice: parallel, on the same band, overlapping or a stall apart. Keep one, widened.
  const merged: typeof rows = [];
  for (const row of rows.sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0))) {
    const a = add(row.c0, row.along, row.t0 / mpp), b = add(row.c0, row.along, row.t1 / mpp);
    const same = merged.find((m) => {
      if (Math.abs(Math.abs(dot(row.along, m.along)) - 1) > 0.03) return false;
      const side: Vec = [-m.along[1], m.along[0]];
      if (Math.max(Math.abs(dot(sub(a, m.c0), side)), Math.abs(dot(sub(b, m.c0), side))) * mpp > 3) return false;
      const [ta, tb] = [dot(sub(a, m.c0), m.along) * mpp, dot(sub(b, m.c0), m.along) * mpp].sort((x, y) => x - y);
      return !(ta! > m.t1 + 3.6 || tb! < m.t0 - 3.6);
    });
    if (!same) { merged.push({ ...row }); continue; }
    const [ta, tb] = [dot(sub(a, same.c0), same.along) * mpp, dot(sub(b, same.c0), same.along) * mpp].sort((x, y) => x - y);
    same.t0 = Math.min(same.t0, ta!);
    same.t1 = Math.max(same.t1, tb!);
  }
  return merged.map((m) => ({
    start: add(m.c0, m.along, m.t0 / mpp),
    end: add(m.c0, m.along, m.t1 / mpp),
    across: m.across,
    depthM: m.depthM,
    spacingM: m.spacingM,
    stalls: Math.max(1, Math.round((m.t1 - m.t0) / m.spacingM)),
  }));
}

export type StallCollection = { observations: Observation[]; features: MapFeature[]; run: SourceRun };

const tileOf = (lon: number, lat: number, z: number): Vec => {
  const n = 2 ** z;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n];
};
const lonLatOf = (x: number, y: number, z: number): [number, number] => {
  const n = 2 ** z;
  return [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
};

// Fetches the imagery over the paved areas, finds the stall rows, and returns them as features.
export async function collectParkingStalls(config: StallImagery, pavedAreas: MapFeature[], decode: ImageDecoder, ctx: CollectContext): Promise<StallCollection | null> {
  const rings = pavedAreas.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [])) as [number, number][][][];
  if (rings.length === 0) return null;
  const source = config.source;
  const run = (status: SourceRun["status"], reason?: string): SourceRun => ({ sourceId: source.id, name: source.name, status, ...(reason ? { reason } : {}) });
  const z = config.zoom;
  const all = rings.flatMap((polygon) => polygon[0]!);
  const [x0, y1] = tileOf(Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), z);
  const [x1, y0] = tileOf(Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1])), z);
  const tx0 = Math.floor(x0), tx1 = Math.floor(x1), ty0 = Math.floor(y0), ty1 = Math.floor(y1);
  const query = `stripes in imagery tiles z${z} ${tx0}-${tx1}, ${ty0}-${ty1}`;
  const origin = (retrievedAt: string) => ({ source, query, retrievedAt });
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 120) {
    const reason = "The paved area is too large to read stall by stall.";
    return { observations: [observe(origin(ctx.now()), ctx, { field: "parking_stall_count", kind: "no_value", value: null, reason })], features: [], run: run("missing", reason) };
  }
  const width = (tx1 - tx0 + 1) * 256, height = (ty1 - ty0 + 1) * 256;
  const gray = new Float32Array(width * height), saturation = new Float32Array(width * height);
  try {
    const tiles: { tx: number; ty: number }[] = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) tiles.push({ tx, ty });
    for (let i = 0; i < tiles.length; i += 8) {
      await Promise.all(
        tiles.slice(i, i + 8).map(async ({ tx, ty }) => {
          const response = await ctx.fetch(config.tileUrlTemplate.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty)));
          if (!response.ok) throw new Error(`HTTP ${response.status} for an imagery tile`);
          const image = decode(new Uint8Array(await response.arrayBuffer()));
          for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const s = (y * image.width + x) * 4, r = image.data[s]!, g = image.data[s + 1]!, b = image.data[s + 2]!;
            const at = ((ty - ty0) * 256 + y) * width + (tx - tx0) * 256 + x;
            gray[at] = (r + g + b) / 3;
            saturation[at] = Math.max(r, g, b) - Math.min(r, g, b);
          }
        }),
      );
    }
  } catch (error) {
    const reason = `The imagery couldn't be read: ${(error as Error).message}`;
    return { observations: [observe(origin(ctx.now()), ctx, { field: "parking_stall_count", kind: "no_value", value: null, reason })], features: [], run: run("missing", reason) };
  }

  // The paved areas as a pixel mask, by scanline.
  const toPixel = ([lon, lat]: [number, number]): Vec => { const [x, y] = tileOf(lon, lat, z); return [(x - tx0) * 256, (y - ty0) * 256]; };
  const mask = new Uint8Array(width * height);
  for (const polygon of rings) {
    const pixelRings = polygon.map((ring) => ring.map(toPixel));
    for (let y = 0; y < height; y++) {
      const crossings: number[] = [];
      for (const ring of pixelRings) for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1]!, [bx, by] = ring[i]!;
        if ((ay > y + 0.5) !== (by > y + 0.5)) crossings.push(ax + ((y + 0.5 - ay) * (bx - ax)) / (by - ay));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) for (let x = Math.max(0, Math.ceil(crossings[i]! - 0.5)); x <= Math.min(width - 1, Math.floor(crossings[i + 1]! - 0.5)); x++) mask[y * width + x] = 1;
    }
  }
  const lat0 = all.reduce((sum, p) => sum + p[1], 0) / all.length;
  const mpp = (156543.03392 * Math.cos((lat0 * Math.PI) / 180)) / 2 ** z;
  const rows = detectStallRows(gray, saturation, mask, width, height, mpp);
  const toLonLat = ([x, y]: Vec): [number, number] => lonLatOf(tx0 + x / 256, ty0 + y / 256, z);

  const retrievedAt = ctx.now();
  const FEET = 3.280839895;
  const reason = `Stall stripes read from ${source.name} (${config.sourceDate}) inside the mapped paved areas, with the spacing measured along each row. Parked cars and worn paint hide some stripes, so a row may be cut short or missed.`;
  const features: MapFeature[] = rows.flatMap((row, index) => {
    const half = (row.depthM / mpp) / 2;
    const corners = [add(row.start, row.across, -half), add(row.end, row.across, -half), add(row.end, row.across, half), add(row.start, row.across, half)];
    const along = norm(sub(row.end, row.start));
    const lines = Array.from({ length: row.stalls + 1 }, (_, k) => {
      const p = add(row.start, along, (k * row.spacingM) / mpp);
      return [toLonLat(add(p, row.across, -half)), toLonLat(add(p, row.across, half))];
    });
    const attributes = {
      stall_count: { type: "quantity" as const, value: row.stalls, unit: "stalls" },
      stall_width_ft: { type: "quantity" as const, value: Math.round(row.spacingM * FEET * 10) / 10, unit: "ft" },
      stall_depth_ft: { type: "quantity" as const, value: Math.round(row.depthM * FEET), unit: "ft" },
      basis: { type: "text" as const, value: "detected (imagery)" },
      confidence_reason: { type: "text" as const, value: reason },
    };
    return [
      { id: `parking-row-${index + 1}`, kind: "constraint", field: "parking_stalls", geometry: { type: "Polygon", coordinates: [[...corners, corners[0]!].map(toLonLat)] }, label: `(E) PARKING, ${row.stalls} STALLS`, attributes },
      { id: `parking-stripes-${index + 1}`, kind: "constraint", field: "parking_stalls", geometry: { type: "MultiLineString", coordinates: lines }, label: "(E) PARKING STRIPES", attributes: { ...attributes, line_class: { type: "text" as const, value: "parking stripe" } } },
    ] satisfies MapFeature[];
  });
  const total = rows.reduce((sum, row) => sum + row.stalls, 0);
  const observations = [
    rows.length
      ? observe(origin(retrievedAt), ctx, { field: "parking_stall_count", kind: "reading", value: { type: "quantity", value: total, unit: "stalls" }, attribute: "stall stripes in imagery", method: "computed", sourceDate: config.sourceDate, grade: "reference", reason })
      : observe(origin(retrievedAt), ctx, { field: "parking_stall_count", kind: "no_value", value: null, attribute: "stall stripes in imagery", reason: "No striped stall rows found in the imagery over the paved areas." }),
  ];
  return { observations, features, run: run("done") };
}
