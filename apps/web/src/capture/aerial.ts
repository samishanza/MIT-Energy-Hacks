import type { BaseMap } from "@eqore/contract";

const TILE = 256;

export interface AerialTile {
  url: string;
  left: number;
  top: number;
}

// The tiles that cover a small view centered on a point, without a map library on the phone.
export function aerialTiles(base: BaseMap, center: [number, number], width: number, height: number): AerialTile[] {
  const zoom = Math.min(Math.round(base.zoom), base.maxZoom);
  const scale = TILE * 2 ** zoom;
  const [longitude, latitude] = center;
  const worldX = ((longitude + 180) / 360) * scale;
  const sin = Math.sin((latitude * Math.PI) / 180);
  const worldY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  const originX = worldX - width / 2;
  const originY = worldY - height / 2;

  const tiles: AerialTile[] = [];
  for (let x = Math.floor(originX / TILE); x * TILE < originX + width; x++) {
    for (let y = Math.floor(originY / TILE); y * TILE < originY + height; y++) {
      tiles.push({
        url: base.tileUrlTemplate
          .replace("{z}", String(zoom))
          .replace("{x}", String(x))
          .replace("{y}", String(y)),
        left: x * TILE - originX,
        top: y * TILE - originY,
      });
    }
  }
  return tiles;
}
