/**
 * RESONANCE — the physical system under the field, the sound and the shaft.
 *
 * The site is a resonant cavity and the scroll is what excites it. This module
 * is the actual physics: a modal decomposition of a fixed-fixed string, six
 * modes, integrated as six driven damped harmonic oscillators.
 *
 *     q̈ₙ + 2ζₙωₙ q̇ₙ + ωₙ² qₙ = Fₙ(t)          n = 1 … MODES
 *
 * with
 *
 *     ωₙ = n·ω₀                 a string's modes are exactly harmonic
 *     ζₙ = ζ₀·√n                viscous air damping on a string scales with
 *                               √ω, so higher modes bleed off first and the
 *                               tone mellows toward its fundamental as it rings
 *                               down. (ζ ∝ n was the first cut and it is wrong
 *                               for the wrong reason: it drops mode 6 to Q≈1.5,
 *                               where the cavity no longer resonates at all and
 *                               the fundamental's off-resonance tail outruns
 *                               every peak above it.)
 *     Fₙ = F(t)·sin(nπξ)        the modal projection of a point force applied
 *                               at ξ ∈ (0,1). This is not decoration: pluck at
 *                               the centre (ξ = 0.5) and every even mode sits
 *                               on a node and takes zero force, so the cavity
 *                               answers with odd harmonics only — audibly.
 *
 * The scroll supplies F(t) two ways, both honest:
 *   · BASE EXCITATION. Scrolling shakes the whole instrument, so the cavity is
 *     driven through its mounting rather than by a force applied to the string:
 *     F = ω_d²·X, the standard base-excitation transmissibility. The scroll
 *     SPEED sets ω_d, so scrolling faster sweeps the drive up through ω₀, 2ω₀,
 *     3ω₀ … and each crossing is a real resonance peak — the amplitude response
 *     of a driven oscillator, not a lookup table. This is the interaction: find
 *     the speed, feel it ring.
 *
 *     The ω_d² is load-bearing and was not there at first. A constant-amplitude
 *     force driver gives every mode a displacement falling as 1/n², measured at
 *     roughly 50:1 between mode 1 and mode 6 — so only the fundamental was ever
 *     visible or audible, and five sixths of the instrument was decoration.
 *     Base excitation is both the truer model of a shaken frame and the one
 *     that makes the whole mode series reachable.
 *   · an impulse on every sharp change in scroll velocity — a pluck.
 * Plus a whisper of stochastic force so the cavity is never quite dead.
 *
 * ── One system, two clocks ──────────────────────────────────────────────────
 * ω₀ is set at ~0.55 Hz because the FIELD has to show these modes and a 110 Hz
 * standing wave is invisible at 60 fps. The audio plays the same modal
 * amplitude vector back at an audible fundamental. Nothing is faked by that:
 * the ratios between partials, their relative amplitudes and their decay
 * envelopes are the ones this solver produced. Mode 3 dominating on screen
 * (three antinodes) IS the third harmonic dominating in your ears.
 *
 * ── Published state ─────────────────────────────────────────────────────────
 * `getResonance()` returns a live, mutable snapshot — read it every frame from
 * the render loop; never retain it. The envelope `env[n] = √(qₙ² + (q̇ₙ/ωₙ)²)`
 * is the exact instantaneous amplitude of mode n and is what the synth uses as
 * a per-partial gain. `q` and `qv` are the quadrature pair the shader rotates
 * to propagate the wave down the shaft.
 */
import { gsap } from './gsap';
import { onCleanup } from './anims/util';
import { getProgress } from './snr';

export const MODES = 6;

/** Fundamental of the modelled cavity, in Hz, at cavity ratio 1. */
const F0 = 0.55;
/** Damping ratio of mode 1. Q₁ = 1/2ζ ≈ 17; mode 6 still holds Q ≈ 7. */
const ZETA0 = 0.03;

/** Integrator step. ω_max·dt ≈ 0.17 ≪ 2, comfortably inside stability. */
const SUBSTEP = 1 / 240;
/** Never chase more than this many steps after a stall, or a dropped frame
 *  turns into a spiral of ever-longer catch-up frames. */
const MAX_SUBSTEPS = 12;

/** Drive frequency range, in units of ω₀. Spans the whole mode series, so a
 *  fast scroll can excite mode 6 and a slow one only the fundamental. */
const DRIVE_LO = 0.55;
const DRIVE_HI = 6.6;

/** Scroll speed, px/s, that counts as "full tilt" — i.e. that puts the drive
 *  at DRIVE_HI. Set to a brisk read, not to a flick, so ordinary scrolling
 *  spends its time in the middle of the mode series rather than under it. */
const SPEED_FULL = 1400;
/** Speed, px/s, above which the exciter is fully engaged. Deliberately low and
 *  separate from SPEED_FULL: speed picks the drive FREQUENCY, and letting it
 *  scale the force as well made the response cubic in scroll speed — inert
 *  below 1200 px/s, pinned above 2700, measured. Now any real scrolling engages
 *  the exciter and only true rest lets the cavity ring down. */
const SPEED_ENGAGE = 300;
/** Floor, so a resting page still has the faintest life in it. */
const IDLE_DRIVE = 0.05;
/** Shortest gap between two plucks, seconds. Without it a hard trackpad flick
 *  lands an impulse on every frame and pumps the cavity without bound — the
 *  damping is far too light to absorb 60 strikes a second. */
const PLUCK_GAP = 0.16;

/** Base-excitation amplitude X. Force is X·ω_d², so displacement comes out
 *  dimensionless and does not rescale when an act shortens the cavity. */
const DRIVE_GAIN = 0.10;
/**
 * RMS modal displacement that counts as the cavity at full travel. Measured in
 * the browser rather than guessed: a comfortable reading scroll sits near 0.45
 * here and a hard flick reaches 1.
 */
const SWING_REF = 1.35;
const PLUCK_GAIN = 0.22;
const THERMAL = 0.02;

/**
 * Cavity length per act, as a frequency ratio. Shortening the string raises
 * every mode at once — visual rate and audible pitch together, because they
 * are the same number. Just ratios, so the site's ten acts walk a real
 * harmonic path and land an octave up at CHANNEL.
 */
const ACT_CAVITY = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 3 / 2, 6 / 5, 9 / 8, 2] as const;

export interface ResonanceState {
  /** Modal displacement qₙ, signed. */
  q: Float32Array;
  /** Quadrature partner q̇ₙ/ωₙ — same units as q, 90° out of phase. */
  qv: Float32Array;
  /** Instantaneous envelope √(q² + qv²) — the synth's per-partial gain. */
  env: Float32Array;
  /** Total modal energy Σ½(q̇ₙ² + ωₙ²qₙ²), normalised and clamped to 0..1. */
  energy: number;
  /** RMS modal displacement, normalised and clamped to 0..1 — how far the
   *  cavity is actually swinging, which is what the field draws. */
  swing: number;
  /** Drive frequency in units of ω₀. */
  drive: number;
  /** 0..1 — how near the drive is to a mode. 1 is dead on resonance. */
  lock: number;
  /** Dominant mode, 1..MODES, as a float (it slides between modes). */
  peak: number;
  /** Cavity ratio currently in force. */
  cavity: number;
  /** Pluck position ξ, 0..1. */
  xi: number;
}

const state: ResonanceState = {
  q: new Float32Array(MODES),
  qv: new Float32Array(MODES),
  env: new Float32Array(MODES),
  energy: 0,
  swing: 0,
  drive: DRIVE_LO,
  lock: 0,
  peak: 1,
  cavity: 1,
  xi: 0.5,
};

/* Solver working set. qd is the true modal velocity; state.qv is qd/ω. */
const qd = new Float32Array(MODES);

let omega0 = 2 * Math.PI * F0;
let cavityTarget = 1;
let cavityNow = 1;

let driveOmega = DRIVE_LO * omega0;
let drivePhase = 0;
let driveForce = 0;

let lastScroll = 0;
let lastVelocity = 0;
let speed = 0;
let accumulator = 0;
let sincePluck = 0;
let running = false;

/** Live state. Read every frame; do not retain. */
export function getResonance(): ResonanceState {
  return state;
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Set the cavity from the act index. Crossfaded, never stepped. */
export function setCavityAct(index: number): void {
  cavityTarget = ACT_CAVITY[index] ?? 1;
}

/**
 * Deposit an impulse into the cavity — a pluck at ξ. Exposed so a discrete
 * event (an act boundary, a filter click) can excite the same physics rather
 * than playing a detached sound effect over the top of it.
 *
 * Scaled by the headroom left in the cavity, so strikes stop adding once the
 * string is already at full travel. A real string has a finite excursion; this
 * one now does too, and it is what keeps a violent scroll from pumping the
 * field into a smear.
 */
export function pluck(strength: number, xi = state.xi): void {
  const headroom = Math.max(0, 1 - state.swing);
  if (headroom <= 0) return;
  const s = strength * headroom;
  for (let n = 0; n < MODES; n += 1) {
    // Modal projection of a point impulse: velocity, not displacement, is what
    // a strike imparts.
    qd[n] += s * Math.sin((n + 1) * Math.PI * xi) / (n + 1);
  }
}

/** One fixed-size step of the six-oscillator system. Semi-implicit Euler:
 *  symplectic, so an undamped mode holds its energy instead of blooming. */
function integrate(dt: number): void {
  drivePhase += driveOmega * dt;
  if (drivePhase > Math.PI * 2) drivePhase -= Math.PI * 2;

  const excitation = driveForce * Math.sin(drivePhase);
  const xi = state.xi;

  for (let n = 0; n < MODES; n += 1) {
    const mode = n + 1;
    const w = mode * omega0;
    const zeta = ZETA0 * Math.sqrt(mode);

    // Point force at ξ, projected onto mode n. Nodes really do take nothing.
    const shape = Math.sin(mode * Math.PI * xi);
    const f = excitation * shape + (Math.random() - 0.5) * THERMAL * omega0 * omega0 * shape;

    const accel = f - 2 * zeta * w * qd[n] - w * w * state.q[n];
    qd[n] += accel * dt;
    state.q[n] += qd[n] * dt;
  }
}

function publish(): void {
  let energy = 0;
  let swing = 0;
  let peakValue = 0;
  let peakMode = 1;

  for (let n = 0; n < MODES; n += 1) {
    const w = (n + 1) * omega0;
    const v = qd[n] / w;
    state.qv[n] = v;
    const env = Math.hypot(state.q[n], v);
    state.env[n] = env;
    // E = ½(q̇² + ω²q²) per unit modal mass.
    energy += 0.5 * (qd[n] * qd[n] + w * w * state.q[n] * state.q[n]);
    swing += env * env;
    if (env > peakValue) {
      peakValue = env;
      peakMode = n + 1;
    }
  }

  // The reference scales with ω₀ because a stiffer cavity stores more energy
  // for the same displacement; without it the readout would jump every act.
  // Energy legitimately RISES when a high mode is driven — same displacement,
  // much higher velocity — which is why the field rides `swing` instead.
  state.energy = clamp(Math.sqrt(energy) / (omega0 * 1.5), 0, 1);
  state.swing = clamp(Math.sqrt(swing) / SWING_REF, 0, 1);
  state.peak = peakMode;

  const ratio = driveOmega / omega0;
  state.drive = ratio;
  const nearest = Math.max(1, Math.round(ratio));
  state.lock = clamp(1 - Math.abs(ratio - nearest) * 2, 0, 1);
}

/** CSS mirror, epsilon-guarded like every other per-frame custom property. */
const CSS_EPS = 0.01;
let lastEnergy = -9;
let lastLock = -9;

function publishCss(style: CSSStyleDeclaration): void {
  if (Math.abs(state.swing - lastEnergy) >= CSS_EPS) {
    lastEnergy = state.swing;
    style.setProperty('--res', state.swing.toFixed(3));
  }
  if (Math.abs(state.lock - lastLock) >= CSS_EPS) {
    lastLock = state.lock;
    style.setProperty('--lock', state.lock.toFixed(3));
  }
}

export function createResonance(): void {
  if (running) return;
  running = true;

  const style = document.documentElement.style;
  lastScroll = window.scrollY;
  accumulator = 0;

  const step = (_time: number, delta: number): void => {
    const dt = Math.min(delta / 1000, 0.25);

    /* ── read the scroll and turn it into a force ──────────────────────── */
    const y = window.scrollY;
    const velocity = dt > 0 ? (y - lastScroll) / dt : 0;
    lastScroll = y;

    // Pluck position walks the cavity as you read: the timbre of the site is
    // literally a function of where you are in it. Progress comes from snr.ts,
    // which owns scroll-global progress; scrollY here is only ever differenced
    // for velocity, which is a different quantity.
    state.xi = clamp(0.08 + getProgress() * 0.84, 0.02, 0.98);

    // Exponential moving average — raw per-frame velocity is far too spiky to
    // steer a drive frequency with.
    speed += (Math.abs(velocity) - speed) * Math.min(1, dt * 6);
    const norm = clamp(speed / SPEED_FULL, 0, 1);

    // Scroll speed sets the drive FREQUENCY. Sweeping it through nω₀ is what
    // produces the resonance peaks; the solver decides how big they are.
    const targetOmega = (DRIVE_LO + (DRIVE_HI - DRIVE_LO) * norm) * omega0;
    driveOmega += (targetOmega - driveOmega) * Math.min(1, dt * 3.5);
    // Amplitude is CONSTANT; speed moves the frequency. All the variation you
    // feel is the cavity's own response curve, which is the point.
    const gate = IDLE_DRIVE + (1 - IDLE_DRIVE) * clamp(speed / SPEED_ENGAGE, 0, 1);
    driveForce = DRIVE_GAIN * gate * driveOmega * driveOmega;

    // A sharp change in scroll velocity is a strike, not a drive.
    const jerk = Math.abs(velocity - lastVelocity);
    lastVelocity = velocity;
    sincePluck += dt;
    if (jerk > 900 && sincePluck >= PLUCK_GAP) {
      sincePluck = 0;
      pluck(clamp(jerk / 4200, 0, 1) * PLUCK_GAIN * omega0);
    }

    /* ── cavity crossfade ──────────────────────────────────────────────── */
    cavityNow += (cavityTarget - cavityNow) * Math.min(1, dt * 1.6);
    state.cavity = cavityNow;
    omega0 = 2 * Math.PI * F0 * cavityNow;

    /* ── fixed-step integration ────────────────────────────────────────── */
    accumulator += dt;
    let steps = 0;
    while (accumulator >= SUBSTEP && steps < MAX_SUBSTEPS) {
      integrate(SUBSTEP);
      accumulator -= SUBSTEP;
      steps += 1;
    }
    // Discard whatever is left after a long stall rather than replaying it.
    if (steps === MAX_SUBSTEPS) accumulator = 0;

    publish();
    publishCss(style);
  };

  gsap.ticker.add(step);

  onCleanup(() => {
    gsap.ticker.remove(step);
    running = false;
    state.q.fill(0);
    state.qv.fill(0);
    state.env.fill(0);
    qd.fill(0);
    state.energy = 0;
    state.swing = 0;
    state.lock = 0;
    lastEnergy = lastLock = -9;
    sincePluck = 0;
    style.removeProperty('--res');
    style.removeProperty('--lock');
  });
}

/* ── Pure solver, exported for tests ──────────────────────────────────────── */

export interface ProbeResult {
  /** Steady-state amplitude of each mode under a constant sinusoidal drive. */
  amplitude: Float32Array;
  /** Total energy at the end of the run. */
  energy: number;
}

export interface ProbeOptions {
  seconds?: number;
  /** Pluck position. Modes with a node at ξ take no force. */
  xi?: number;
  modes?: number;
  f0?: number;
  /**
   * 'force' — unit sinusoidal force, the textbook single-frequency probe.
   * 'base'  — what the site actually does: F = X·ω_d², a shaken mounting.
   */
  drive?: 'force' | 'base';
}

/**
 * Run the same equations headlessly: drive the cavity at `driveRatio`·ω₀ and
 * report the amplitude each mode settles at. This is the function the tests
 * sweep to confirm the response peaks at the mode frequencies — i.e. that the
 * thing resonates because of the maths and not because something was tuned to
 * look like it does.
 */
export function probe(driveRatio: number, opts: ProbeOptions = {}): ProbeResult {
  const { seconds = 40, xi = 0.5, modes = MODES, f0 = F0, drive = 'force' } = opts;

  const w0 = 2 * Math.PI * f0;
  const wd = driveRatio * w0;
  const force = drive === 'base' ? DRIVE_GAIN * wd * wd : 1;

  const q = new Float32Array(modes);
  const v = new Float32Array(modes);
  const amplitude = new Float32Array(modes);
  let phase = 0;
  const dt = SUBSTEP;
  const total = Math.round(seconds / dt);
  // Measure only the last quarter, once the transient has died away.
  const measureFrom = Math.round(total * 0.75);

  for (let i = 0; i < total; i += 1) {
    phase += wd * dt;
    const excitation = Math.sin(phase) * force;
    for (let n = 0; n < modes; n += 1) {
      const mode = n + 1;
      const w = mode * w0;
      const zeta = ZETA0 * Math.sqrt(mode);
      const f = excitation * Math.sin(mode * Math.PI * xi);
      v[n] += (f - 2 * zeta * w * v[n] - w * w * q[n]) * dt;
      q[n] += v[n] * dt;
    }
    if (i >= measureFrom) {
      for (let n = 0; n < modes; n += 1) {
        const a = Math.hypot(q[n], v[n] / ((n + 1) * w0));
        if (a > amplitude[n]) amplitude[n] = a;
      }
    }
  }

  let energy = 0;
  for (let n = 0; n < modes; n += 1) {
    const w = (n + 1) * w0;
    energy += 0.5 * (v[n] * v[n] + w * w * q[n] * q[n]);
  }
  return { amplitude, energy };
}

/**
 * Free decay of a single mode from unit displacement. Used by the tests to
 * confirm the integrator is symplectic (ζ = 0 conserves energy) and that
 * damping removes it at the analytic rate e^(-ζωt).
 */
export function decay(mode: number, zeta: number, seconds: number, f0 = F0): number {
  const w = mode * 2 * Math.PI * f0;
  let q = 1;
  let v = 0;
  const dt = SUBSTEP;
  for (let i = 0, n = Math.round(seconds / dt); i < n; i += 1) {
    v += (-2 * zeta * w * v - w * w * q) * dt;
    q += v * dt;
  }
  return Math.hypot(q, v / w);
}
