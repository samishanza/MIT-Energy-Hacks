// Projects points on the site into a Street View photo, from the camera Google reports:
// where the photo was taken, the heading and pitch we asked for, and the field of view.

type LonLat = [number, number];

export interface StreetCamera {
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  fov: number;
  width: number;
  height: number;
}

/** Street View cameras ride about 2.5 m above the road. */
const CAMERA_HEIGHT_M = 2.5;
const M_PER_DEG = 111_320;
const rad = (d: number) => (d * Math.PI) / 180;

export interface Projected {
  x: number;
  y: number;
  /** Meters ahead of the camera; zero or less is behind it. */
  depth: number;
}

export function projectPoint(camera: StreetCamera, [lng, lat]: LonLat, heightM: number): Projected {
  const east = (lng - camera.lng) * M_PER_DEG * Math.cos(rad(camera.lat));
  const north = (lat - camera.lat) * M_PER_DEG;
  const h = rad(camera.heading);
  const forward = north * Math.cos(h) + east * Math.sin(h);
  const right = east * Math.cos(h) - north * Math.sin(h);
  const up = heightM - CAMERA_HEIGHT_M;
  const p = rad(camera.pitch);
  const depth = forward * Math.cos(p) + up * Math.sin(p);
  const upCam = up * Math.cos(p) - forward * Math.sin(p);
  const f = camera.width / 2 / Math.tan(rad(camera.fov) / 2);
  return { x: camera.width / 2 + (f * right) / depth, y: camera.height / 2 - (f * upCam) / depth, depth };
}

export const inFront = (p: Projected) => p.depth > 1;
export const onImage = (p: Projected, camera: StreetCamera, margin = 0) =>
  p.x >= -margin && p.x <= camera.width + margin && p.y >= -margin && p.y <= camera.height + margin;
