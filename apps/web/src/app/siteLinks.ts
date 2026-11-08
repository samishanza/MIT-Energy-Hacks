type Position = [number, number];

const fixed = (n: number) => n.toFixed(6);

export function googleEarthUrl([longitude, latitude]: Position): string {
  return `https://earth.google.com/web/@${fixed(latitude)},${fixed(longitude)},0a,300d,35y,0h,45t,0r`;
}

export function streetViewUrl([longitude, latitude]: Position): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${fixed(latitude)},${fixed(longitude)}`;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Compass bearing from one point to another, in degrees. */
export function bearing([lon1, lat1]: Position, [lon2, lat2]: Position): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Street View from the nearest mapped road point, facing the target. Google picks the
 * closest panorama to the viewpoint; the heading turns the camera toward the equipment.
 */
export function streetViewToward(target: Position, roadPoints: Position[]): string {
  const near = roadPoints.reduce<Position | null>((best, p) => {
    const d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2;
    return !best || d < (best[0] - target[0]) ** 2 + (best[1] - target[1]) ** 2 ? p : best;
  }, null);
  const from = near ?? target;
  const heading = near ? Math.round(bearing(from, target)) : 0;
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${fixed(from[1])},${fixed(from[0])}&heading=${heading}&pitch=5&fov=80`;
}
