// Pure zoom math for the listing lightbox (components/listing/lightbox.tsx, Effortless list-01). A zoom is a scale and
// an offset applied as `translate(x, y) scale(scale)` around the centre of the photo stage. Points are measured from
// the stage centre. The photo is drawn "contained" in the stage, so its fitted size is what may move: the offset is
// clamped so the zoomed photo never leaves a gap at an edge it could cover.

export type Zoom = { scale: number; x: number; y: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;
// "Acercar" / "Alejar" and the + / - keys: 1x → 2x → 3x → 4x and back.
export const ZOOM_STEP = 1;
export const IDENTITY: Zoom = Object.freeze({ scale: 1, x: 0, y: 0 });

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampScale(scale: number) {
  return Number.isFinite(scale) ? clamp(scale, MIN_ZOOM, MAX_ZOOM) : MIN_ZOOM;
}

// The size of a photo of `natural` proportions drawn with object-fit: contain in `stage`.
export function fittedSize(stage: Size, natural?: Size | null): Size {
  if (!natural || natural.width <= 0 || natural.height <= 0 || stage.width <= 0 || stage.height <= 0) return stage;
  const ratio = Math.min(stage.width / natural.width, stage.height / natural.height);
  return { width: natural.width * ratio, height: natural.height * ratio };
}

// Keeps the zoomed photo over the stage: along an axis where it is larger than the stage it may move until its edge
// meets the stage's edge; where it is smaller it stays centred.
export function clampZoom(zoom: Zoom, stage: Size, photo: Size = stage): Zoom {
  const scale = clampScale(zoom.scale);
  if (scale <= MIN_ZOOM) return IDENTITY;
  const maxX = Math.max(0, (photo.width * scale - stage.width) / 2);
  const maxY = Math.max(0, (photo.height * scale - stage.height) / 2);
  return { scale, x: clamp(zoom.x, -maxX, maxX) || 0, y: clamp(zoom.y, -maxY, maxY) || 0 };
}

// Zooms to `scale` keeping the photo point under `at` (from the stage centre) where it is.
export function zoomAt(zoom: Zoom, scale: number, at: Point, stage: Size, photo: Size = stage): Zoom {
  const next = clampScale(scale);
  if (next <= MIN_ZOOM) return IDENTITY;
  const ratio = next / zoom.scale;
  return clampZoom({ scale: next, x: at.x - (at.x - zoom.x) * ratio, y: at.y - (at.y - zoom.y) * ratio }, stage, photo);
}

// Double tap / double click: 1x zooms to 2.5x at the tapped point; any zoom goes back to 1x.
export function toggleZoom(zoom: Zoom, at: Point, stage: Size, photo: Size = stage): Zoom {
  return zoom.scale > MIN_ZOOM ? IDENTITY : zoomAt(zoom, DOUBLE_TAP_ZOOM, at, stage, photo);
}

// The buttons and keys zoom around the stage centre, one step at a time.
export function stepZoom(zoom: Zoom, direction: 1 | -1, stage: Size, photo: Size = stage): Zoom {
  const target = direction > 0 ? Math.floor(zoom.scale + ZOOM_STEP) : Math.ceil(zoom.scale - ZOOM_STEP);
  return zoomAt(zoom, target, { x: 0, y: 0 }, stage, photo);
}

// Mouse wheel and trackpad: a pinch on a trackpad arrives as a wheel event with ctrlKey and small deltas.
export function wheelScale(scale: number, deltaY: number, pinch = false) {
  return clampScale(scale * Math.exp(-deltaY * (pinch ? 0.01 : 0.002)));
}

// Two-finger pinch: the gesture started at `start` with the fingers' midpoint at `fromMid`; now the midpoint is at
// `toMid` and the fingers are `ratio` times as far apart. The photo point under the first midpoint follows the fingers.
export function pinchZoom(start: Zoom, fromMid: Point, toMid: Point, ratio: number, stage: Size, photo: Size = stage): Zoom {
  const scale = clampScale(start.scale * ratio);
  const qx = (fromMid.x - start.x) / start.scale;
  const qy = (fromMid.y - start.y) / start.scale;
  if (scale <= MIN_ZOOM) return IDENTITY;
  return clampZoom({ scale, x: toMid.x - qx * scale, y: toMid.y - qy * scale }, stage, photo);
}

// One-finger drag (or mouse drag) while zoomed.
export function panZoom(start: Zoom, dx: number, dy: number, stage: Size, photo: Size = stage): Zoom {
  return clampZoom({ ...start, x: start.x + dx, y: start.y + dy }, stage, photo);
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function zoomPercent(zoom: Zoom) {
  return Math.round(zoom.scale * 100);
}
