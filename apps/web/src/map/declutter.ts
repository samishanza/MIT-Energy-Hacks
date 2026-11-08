// Keeps map labels from overlapping. Labels are HTML elements placed by the map; after each
// move, they're checked in priority order and any that would overlap one already kept is
// hidden until there's room for it again.

export interface PlacedLabel {
  element: HTMLElement;
  /** Lower is more important. */
  priority: number;
}

const PAD = 3;

export function priorityOf(className: string): number {
  if (/callout-dimension/.test(className)) return 0;
  if (/callout-buildings/.test(className)) return 1;
  if (/callout-lot/.test(className)) return 2;
  if (/callout-roads/.test(className)) return 3;
  if (/callout-wetlands/.test(className)) return 5;
  if (/callout-(zone|candidate)/.test(className)) return 6;
  if (/callout-fire_stations/.test(className)) return 7;
  return 4;
}

type Box = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right + PAD && b.left < a.right + PAD && a.top < b.bottom + PAD && b.top < a.bottom + PAD;

/** Shows the most important labels that fit, hides the rest. Returns how many were hidden. */
export function declutter(labels: PlacedLabel[], bounds?: Box, occupied: Box[] = []): number {
  // Panels over the map, like the legend, count as space already taken.
  const kept: Box[] = [...occupied];
  let hidden = 0;
  for (const label of [...labels].sort((a, b) => a.priority - b.priority)) {
    label.element.style.visibility = "visible";
    const r = label.element.getBoundingClientRect();
    const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (r.width === 0 && r.height === 0) continue;
    const cut = bounds && (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom);
    if (cut || kept.some((k) => overlaps(k, box))) {
      label.element.style.visibility = "hidden";
      hidden += 1;
    } else {
      kept.push(box);
    }
  }
  return hidden;
}
