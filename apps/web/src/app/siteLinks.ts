type Position = [number, number];

const fixed = (n: number) => n.toFixed(6);

export function googleEarthUrl([longitude, latitude]: Position): string {
  return `https://earth.google.com/web/@${fixed(latitude)},${fixed(longitude)},0a,300d,35y,0h,45t,0r`;
}

export function streetViewUrl([longitude, latitude]: Position): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${fixed(latitude)},${fixed(longitude)}`;
}
