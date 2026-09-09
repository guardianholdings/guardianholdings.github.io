/**
 * The cavity has to resonate because the equations do, not because a curve was
 * drawn to look like it. These tests drive the same solver the site runs and
 * check it against the analytic behaviour of a damped harmonic oscillator.
 */
import { describe, expect, it } from 'vitest';
import { MODES, decay, probe } from '../src/scripts/resonance';

/** Peak amplitude of mode n (1-indexed) when driven at `ratio`·ω₀. */
function amp(ratio: number, mode: number, xi = 0.3): number {
  return probe(ratio, { xi }).amplitude[mode - 1];
}

/** Dominant mode under the site's own driver, a shaken mounting. */
function dominantMode(ratio: number, xi: number): number {
  const a = probe(ratio, { xi, drive: 'base' }).amplitude;
  let best = 0;
  for (let n = 1; n < MODES; n += 1) if (a[n] > a[best]) best = n;
  return best + 1;
}

describe('resonance — driven response', () => {
  it('peaks when the drive frequency reaches the mode frequency', () => {
    // Mode 1 driven at ω₀ must dominate the same mode driven either side of it.
    expect(amp(1.0, 1)).toBeGreaterThan(amp(0.5, 1) * 2);
    expect(amp(1.0, 1)).toBeGreaterThan(amp(1.8, 1) * 2);
  });

  it('walks up the mode series as the drive frequency rises', () => {
    // Each mode's own resonance is the loudest that mode ever gets.
    for (let n = 1; n <= 4; n += 1) {
      const onResonance = amp(n, n);
      const below = amp(n - 0.45, n);
      const above = amp(n + 0.45, n);
      expect(onResonance).toBeGreaterThan(below);
      expect(onResonance).toBeGreaterThan(above);
    }
  });

  it('hands the field a different dominant mode at each drive frequency', () => {
    // The whole mode series has to be REACHABLE, not merely present. Under a
    // constant-amplitude force driver it is not: displacement falls as 1/n²
    // and mode 1 wins at every drive frequency, leaving five sixths of the
    // instrument inert. Base excitation — F = X·ω_d², a shaken mounting, which
    // is what a scroll actually is — is what makes this pass.
    // Excited at its own antinode, ξ = 1/2n, each mode has to win outright.
    // (Away from it the answer legitimately differs — a mode driven at one of
    // its own nodes takes no force at all, which the node test below pins.)
    for (let n = 1; n <= 5; n += 1) {
      expect(dominantMode(n, 1 / (2 * n))).toBe(n);
    }
  });

  it('gives high modes a lower Q, because damping rises with frequency', () => {
    // ζₙ = ζ₀√n, so Q = 1/2ζₙ falls as 1/√n. Sharpness has to be measured at a
    // constant FRACTIONAL detuning — Q is a ratio. Compared at a constant
    // absolute detuning the result inverts, which is also correct and is what
    // caught the first version of this test.
    const sharpness = (n: number) => amp(n, n) / amp(n * 1.35, n);
    expect(sharpness(1)).toBeGreaterThan(sharpness(3));
  });
});

describe('resonance — modal force projection', () => {
  it('gives a node no force: plucked at the centre, even modes stay silent', () => {
    // sin(nπ·0.5) is 0 for every even n. This is why the timbre changes as you
    // scroll: ξ walks the cavity and mutes different partials on the way.
    expect(amp(2, 2, 0.5)).toBeLessThan(amp(2, 2, 0.3) * 1e-6);
    expect(amp(4, 4, 0.5)).toBeLessThan(amp(4, 4, 0.3) * 1e-6);
  });

  it('still drives odd modes from the centre', () => {
    expect(amp(1, 1, 0.5)).toBeGreaterThan(0.01);
    expect(amp(3, 3, 0.5)).toBeGreaterThan(0.001);
  });
});

describe('resonance — integrator', () => {
  it('conserves energy with damping off', () => {
    // Semi-implicit Euler is symplectic: an undamped oscillator must neither
    // bloom nor bleed. Plain explicit Euler fails this outright.
    const after = decay(1, 0, 60);
    expect(after).toBeGreaterThan(0.97);
    expect(after).toBeLessThan(1.03);
  });

  it('decays at the analytic rate e^(-ζωt)', () => {
    const zeta = 0.05;
    const f0 = 0.55;
    const t = 6;
    const expected = Math.exp(-zeta * 2 * Math.PI * f0 * t);
    const actual = decay(1, zeta, t, f0);
    expect(actual).toBeGreaterThan(expected * 0.9);
    expect(actual).toBeLessThan(expected * 1.1);
  });

  it('stays bounded at the highest mode the site uses', () => {
    // ω₆·dt must sit well inside the stability limit, or the field explodes on
    // the one act that excites mode 6.
    const after = decay(MODES, 0, 90);
    expect(Number.isFinite(after)).toBe(true);
    expect(after).toBeLessThan(1.2);
  });
});
