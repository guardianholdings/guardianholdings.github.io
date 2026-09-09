/**
 * The shaft's geometry and the camera's position in it, in one place.
 *
 * Two renderers travel this tunnel — the WebGL particle field, and the content
 * planes themselves. If they disagree about depth by even a little, the dust
 * and the copy slide past each other and the illusion dies. So both import
 * their numbers from here, and neither is allowed a constant of its own.
 *
 * The model is an ordinary pinhole camera looking down -z. Depth is expressed
 * two ways and they are NOT interchangeable:
 *
 *   · `cameraZ`, in CSS pixels — how far down the shaft the camera has flown.
 *     tunnel.ts owns this and writes it every frame; the content planes are
 *     positioned against it with the same `perspective` the browser uses.
 *   · a `ticket` in 0..1 for the dust, which has no absolute position — it is
 *     a texture the camera moves through.
 */

/** CSS perspective of the content stage. Mirrors --shaft-perspective. */
export const PERSPECTIVE = 1000;
/** Depth between two consecutive acts, px. One GAP back is half size. */
export const GAP = 1000;

/** Camera distance to the design plane, world units (the particle field). */
export const CAM_Z = 6;
/** World z of the nearest slice of dust. In FRONT of the design plane, so
 *  slices actually pass the lens instead of stopping at it — but not so far in
 *  front that the closest particles magnify into a blob: apparent size is
 *  1/distance, and everything the near plane gains in drama it pays for in fill. */
export const Z_NEAR = 2.4;
/** World z of the deepest slice of dust. */
export const Z_FAR = -34;

/** CSS px of camera travel per full wrap of the dust. */
const WRAP_SPACING = GAP * 0.5;

let cameraZ = 0;
let idle = 0;

/** Written once per frame by tunnel.ts. */
export function setCameraZ(z: number): void {
  cameraZ = z;
}

/** Advanced by the render loop so the shaft is never quite still at rest. */
export function addIdle(seconds: number): void {
  idle += seconds * 0.008;
}

/**
 * Wrap position of the dust. Driven by the CAMERA, not by scroll progress: the
 * dust has to fly at exactly the rate the content planes are approaching, or
 * the acts appear to drift through a separate, unrelated tunnel — which is
 * precisely what they did when this rode raw document progress instead.
 */
export function shaftTravel(): number {
  return cameraZ / WRAP_SPACING + idle;
}
