/**
 * Buffers for the receiver.
 *
 * Six visual states are packed into three vec4 attributes plus `position`
 * (which is state 0, and is what three uses for the bounding sphere). All six
 * states are 2D; z is derived procedurally in the vertex shader from the seed,
 * so no target needs a third component.
 *
 *   position  vec3   state 0 — noise
 *   aP01      vec4   (state0.xy, state1.xy)
 *   aP23      vec4   (state2.xy, state3.xy)
 *   aP45      vec4   (state4.xy, state5.xy)
 *   aSeed     vec4   x: morph stagger  y: phase  z: population rank  w: size
 *   aDepth    float  the particle's ticket in the shaft, 0..1
 *
 * aDepth is what turns the field into a tunnel. The morph gives every particle
 * an XY; aDepth gives it a Z, and the shader wraps `fract(aDepth - travel)` so
 * the population streams past the camera forever without ever being rebuilt.
 * Tickets are stratified (one per 1/count slot, jittered inside it) so the
 * shaft has even depth coverage rather than the clumps a plain random draw
 * would give — and then shuffled, because the sparse states derive their XY
 * from `i`, and an unshuffled ticket would wind those states into a helix.
 *
 * Sparse states (the nine-point plot, the locked sine) do NOT put every
 * particle on the target — that produces nine blown-out blobs with thousands of
 * particles of overdraw each. Instead a small share of the population stays
 * visible and the rest fade out, which is also the truer picture of a signal
 * emerging from noise. See SHARE below.
 */

/** Fraction of the population that stays visible in each state. */
export const SHARE = [1, 1, 1, 1, 0.03, 0.06] as const;

/** Deterministic PRNG so the field is identical on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/** Nine plotted positions on a 4-sector x 3-class board, matching PORTFOLIO. */
const PLOT_CELLS: Array<[number, number]> = [
  [0, 0], [0, 1], [1, 0], [1, 2], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2],
];

export interface FieldBuffers {
  count: number;
  position: Float32Array;
  p01: Float32Array;
  p23: Float32Array;
  p45: Float32Array;
  seed: Float32Array;
  depth: Float32Array;
}

export function buildField(count: number, seed = 0x5f17): FieldBuffers {
  const rnd = mulberry32(seed);

  const position = new Float32Array(count * 3);
  const p01 = new Float32Array(count * 4);
  const p23 = new Float32Array(count * 4);
  const p45 = new Float32Array(count * 4);
  const seeds = new Float32Array(count * 4);
  const depth = new Float32Array(count);

  /* Stratified depth tickets, then a Fisher-Yates shuffle to break the
     correlation with i that the PLOT and LOCK states rely on. */
  for (let i = 0; i < count; i += 1) depth[i] = (i + rnd()) / count;
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = depth[i];
    depth[i] = depth[j];
    depth[j] = t;
  }

  for (let i = 0; i < count; i += 1) {
    const u = rnd();
    const v = rnd();
    const w = rnd();

    /* 0 — NOISE. Uniform static, wider than the frame so edges never read. */
    const n0x = (u - 0.5) * 2.8;
    const n0y = (v - 0.5) * 2.2;

    /* 1 — SPECTRUM. A filled frequency plot: particles stack from the floor up
       to a lumpy envelope, so the shape reads as a reading, not a texture. */
    const sx = -1.3 + u * 2.6;
    const envelope =
      0.30 +
      0.34 * Math.exp(-((sx + 0.72) ** 2) / 0.045) +
      0.46 * Math.exp(-((sx + 0.12) ** 2) / 0.020) +
      0.28 * Math.exp(-((sx - 0.48) ** 2) / 0.060) +
      0.18 * Math.exp(-((sx - 1.02) ** 2) / 0.030) +
      0.10 * Math.sin(sx * 11.0);
    const sy = -0.86 + v * Math.max(0.05, envelope) * 1.7;

    /* 2 — BANDS. Three asset classes. */
    const band = Math.floor(w * 3);
    const bx = -1.3 + u * 2.6;
    const by = (band - 1) * 0.52 + (v - 0.5) * 0.075;

    /* 3 — PEAKS. Four sectors as gaussian columns. */
    const peak = Math.floor(w * 4);
    const px = (peak - 1.5) * 0.62 + (u - 0.5) * 0.30;
    const falloff = Math.exp(-(((px - (peak - 1.5) * 0.62) ** 2) / 0.018));
    const py = -0.82 + v * (0.35 + 0.95 * falloff);

    /* 4 — PLOT. Nine points. Only SHARE[4] of the population is drawn. */
    const cell = PLOT_CELLS[i % PLOT_CELLS.length];
    const jitterR = Math.sqrt(rnd()) * 0.028;
    const jitterA = rnd() * TAU;
    const plx = -0.98 + (cell[0] + 0.5) * (1.96 / 4) + Math.cos(jitterA) * jitterR;
    const ply = 0.62 - (cell[1] + 0.5) * (1.24 / 3) + Math.sin(jitterA) * jitterR;

    /* 5 — LOCK. One clean carrier. Only SHARE[5] of the population is drawn. */
    const lx = -1.25 + (i / count) * 2.5;
    const ly = 0.30 * Math.sin(lx * 2.6) + (rnd() - 0.5) * 0.006;

    const i3 = i * 3;
    position[i3] = n0x;
    position[i3 + 1] = n0y;
    position[i3 + 2] = 0;

    const i4 = i * 4;
    p01[i4] = n0x;      p01[i4 + 1] = n0y;   p01[i4 + 2] = sx;   p01[i4 + 3] = sy;
    p23[i4] = bx;       p23[i4 + 1] = by;    p23[i4 + 2] = px;   p23[i4 + 3] = py;
    p45[i4] = plx;      p45[i4 + 1] = ply;   p45[i4 + 2] = lx;   p45[i4 + 3] = ly;

    seeds[i4] = rnd();                 // morph stagger
    seeds[i4 + 1] = rnd();             // drift phase
    seeds[i4 + 2] = rnd();             // population rank, tested against SHARE
    seeds[i4 + 3] = 0.6 + rnd() * 0.9; // size multiplier
  }

  return { count, position, p01, p23, p45, seed: seeds, depth };
}
