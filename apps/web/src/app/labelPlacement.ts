// Places callout labels on a picture so none overlap: each label tries spots around its anchor, nearest
// first and then farther out on a longer leader, and takes the first spot where the box stays on the
// picture, overlaps no placed box, covers no other anchor, and its leader crosses no placed box. A label
// with no free spot is left out rather than drawn on top of another.

export type LabelRequest = { id: string; anchor: { x: number; y: number }; width: number; height: number };
export type PlacedLabel = { id: string; x: number; y: number; width: number; height: number; leader: { x1: number; y1: number; x2: number; y2: number } };
type Box = { x: number; y: number; width: number; height: number };

const GAP = 4;
// Up first (labels above objects read best in a photo), then the diagonals, then sideways, then down.
const ANGLES = [-90, -60, -120, -35, -145, 0, 180, 35, 145, 60, 120, 90];
const RADII = [34, 56, 84, 120, 165, 220];

const overlaps = (a: Box, b: Box, pad = GAP) => a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
const contains = (b: Box, p: { x: number; y: number }, pad = 6) => p.x > b.x - pad && p.x < b.x + b.width + pad && p.y > b.y - pad && p.y < b.y + b.height + pad;

function segmentHitsBox(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  // Sample the segment; boxes are tens of pixels, so 3 px steps are enough.
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (contains(b, { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }, 1)) return true;
  }
  return false;
}

/** The point on the box's edge nearest the anchor, where the leader ends. */
function edgePoint(b: Box, a: { x: number; y: number }) {
  return { x: Math.max(b.x, Math.min(b.x + b.width, a.x)), y: Math.max(b.y, Math.min(b.y + b.height, a.y)) };
}

export function placeLabels(requests: LabelRequest[], size: { width: number; height: number }, margin = 4): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const anchors = requests.map((r) => r.anchor);
  // Top of the picture first, so labels for high objects claim the space above them.
  for (const r of [...requests].sort((a, b) => a.anchor.y - b.anchor.y)) {
    let chosen: PlacedLabel | null = null;
    for (const radius of RADII) {
      for (const angle of ANGLES) {
        const rad = (angle * Math.PI) / 180;
        const cx = r.anchor.x + radius * Math.cos(rad);
        const cy = r.anchor.y + radius * Math.sin(rad);
        // The box sits beyond the point, on the side away from the anchor.
        const x = Math.cos(rad) > 0.3 ? cx : Math.cos(rad) < -0.3 ? cx - r.width : cx - r.width / 2;
        const y = Math.sin(rad) > 0.3 ? cy : Math.sin(rad) < -0.3 ? cy - r.height : cy - r.height / 2;
        const box = { x, y, width: r.width, height: r.height };
        if (x < margin || y < margin || x + r.width > size.width - margin || y + r.height > size.height - margin) continue;
        if (placed.some((p) => overlaps(p, box))) continue;
        if (anchors.some((a) => contains(box, a))) continue;
        const end = edgePoint(box, r.anchor);
        if (placed.some((p) => segmentHitsBox(r.anchor.x, r.anchor.y, end.x, end.y, p))) continue;
        chosen = { id: r.id, ...box, leader: { x1: r.anchor.x, y1: r.anchor.y, x2: end.x, y2: end.y } };
        break;
      }
      if (chosen) break;
    }
    if (chosen) placed.push(chosen);
  }
  return placed;
}

/** A label box's width for bold Arial at a given size, with padding. */
export const labelWidth = (text: string, fontSize: number) => Math.ceil(text.length * fontSize * 0.62) + 10;
