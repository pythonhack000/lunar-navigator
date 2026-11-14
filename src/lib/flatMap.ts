/**
 * Where a latitude/longitude falls on the flat maps shown without WebGL, as shares of the image
 * (u right, v down), and back. The global map is equirectangular with longitude 0 in the middle;
 * the polar map is the app's own south polar stereographic grid (see polarGrid.ts): radius
 * ρ = 2·tan(colatitude/2) in Moon radii, x = ρ·cos(lon), y = ρ·sin(lon), y up, out to ±rhoMax.
 */
const DEG = Math.PI / 180;

export interface MapPoint {
  u: number;
  v: number;
}

export const globeToMap = (lat: number, lon: number): MapPoint => ({
  u: (((((lon + 180) % 360) + 360) % 360) / 360),
  v: (90 - lat) / 180,
});

export const mapToGlobe = ({ u, v }: MapPoint): { lat: number; lon: number } => ({ lat: 90 - v * 180, lon: u * 360 - 180 });

export function poleToMap(lat: number, lon: number, rhoMax: number): MapPoint {
  const rho = 2 * Math.tan(((lat + 90) / 2) * DEG);
  return { u: 0.5 + (rho * Math.cos(lon * DEG)) / (2 * rhoMax), v: 0.5 - (rho * Math.sin(lon * DEG)) / (2 * rhoMax) };
}

/** Null outside the map's circle, where the image has no data. */
export function mapToPole({ u, v }: MapPoint, rhoMax: number): { lat: number; lon: number } | null {
  const x = (u - 0.5) * 2 * rhoMax;
  const y = (0.5 - v) * 2 * rhoMax;
  const rho = Math.hypot(x, y);
  if (rho > rhoMax) return null;
  return { lat: (2 * Math.atan(rho / 2)) / DEG - 90, lon: Math.atan2(y, x) / DEG };
}

/**
 * Zoom and pan of the flat map. The picture's own box (`base`, in frame pixels) is scaled by
 * `scale` about the frame centre, then moved by `pan`.
 */
export interface MapView {
  scale: number;
  panX: number;
  panY: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const HOME_VIEW: MapView = { scale: 1, panX: 0, panY: 0 };

/** The picture's box inside a frame: as large as fits, centred (CSS object-fit: contain). */
export function fitBox(frameW: number, frameH: number, aspect: number): Box {
  const width = Math.min(frameW, frameH * aspect);
  const height = width / aspect;
  return { left: (frameW - width) / 2, top: (frameH - height) / 2, width, height };
}

/** Frame pixel of a map point under the view. */
export function toScreen(p: MapPoint, base: Box, view: MapView, frameW: number, frameH: number): { x: number; y: number } {
  const cx = frameW / 2;
  const cy = frameH / 2;
  return {
    x: cx + (base.left + p.u * base.width - cx) * view.scale + view.panX,
    y: cy + (base.top + p.v * base.height - cy) * view.scale + view.panY,
  };
}

/** The map point under a frame pixel. */
export function fromScreen(x: number, y: number, base: Box, view: MapView, frameW: number, frameH: number): MapPoint {
  const cx = frameW / 2;
  const cy = frameH / 2;
  return {
    u: (cx + (x - cx - view.panX) / view.scale - base.left) / base.width,
    v: (cy + (y - cy - view.panY) / view.scale - base.top) / base.height,
  };
}

/** Keeps the picture on screen: it can be moved only as far as it overhangs the frame. */
export function clampView(view: MapView, base: Box): MapView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  // Each edge of the zoomed picture may come in as far as the unzoomed picture's edge, no further.
  const limitX = (base.width * (scale - 1)) / 2;
  const limitY = (base.height * (scale - 1)) / 2;
  // `+ 0` turns a −0 into 0.
  const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v)) + 0;
  return { scale, panX: clamp(view.panX, limitX), panY: clamp(view.panY, limitY) };
}

/** Zooms by `factor` keeping the map point under (x, y) where it is, as maps on the web do. */
export function zoomAt(view: MapView, factor: number, x: number, y: number, base: Box, frameW: number, frameH: number): MapView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const k = scale / view.scale;
  const ox = x - frameW / 2;
  const oy = y - frameH / 2;
  return clampView({ scale, panX: ox - (ox - view.panX) * k, panY: oy - (oy - view.panY) * k }, base);
}
