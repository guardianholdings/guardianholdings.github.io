/**
 * GLSL for the receiver — now a waveguide.
 *
 * Three things happen per vertex, in this order:
 *
 * 1. THE MORPH. Six uniform weights, not an ordered chain: six multiply-adds,
 *    no branching, and any two states can blend (a chain would forbid it, and
 *    GLSL cannot dynamically index attributes anyway).
 *
 * 2. THE SHAFT. Each particle holds a depth ticket; `fract(ticket - uTravel)`
 *    places it somewhere between the near plane and the far plane and wraps it
 *    round forever as the scroll drives uTravel. The camera is perspective, so
 *    the whole population converges on a real vanishing point and the signal
 *    repeats away down the tunnel. Scrolling flies you into it.
 *
 * 3. THE WAVE. The six modal amplitudes solved by resonance.ts are applied as a
 *    standing wave across x — Σ qₙ·sin(nπx) — with a phase lag proportional to
 *    depth, which makes it a wave travelling down the guide rather than a flat
 *    plate wobbling. The lag is applied by rotating each mode's quadrature pair
 *    (qₙ, q̇ₙ/ωₙ) by nφ, which is the exact analytic continuation of that mode's
 *    oscillation, not an approximation of it.
 *
 * The audio is playing those same six amplitudes. Three antinodes on screen is
 * the third harmonic in your ears.
 *
 * Chromatic aberration is done here, per point, rather than in a post pass.
 * A post pass would only composite the canvas, so its fringing would stop dead
 * at the canvas edge instead of crossing the whole page — and it would cost a
 * full-screen render target for the privilege. The page-wide noise and scanline
 * layers are CSS.
 */

export const vertexShader = /* glsl */ `
  uniform float uW[6];
  uniform float uShare[6];
  uniform float uQ[6];        // modal displacement qₙ
  uniform float uQV[6];       // quadrature partner q̇ₙ/ωₙ
  uniform float uTime;
  uniform float uSnr;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTravel;      // shaft travel, driven by scroll
  uniform float uZNear;       // world z of the nearest slice (toward camera)
  uniform float uZFar;        // world z of the deepest slice
  uniform float uDepthScale;  // camera distance, for perspective point sizing
  uniform float uWave;        // displacement amplitude of the standing wave
  uniform float uLag;         // phase lag per unit depth — the guide's k
  uniform vec2  uPointer;

  attribute vec4  aP01;
  attribute vec4  aP23;
  attribute vec4  aP45;
  attribute vec4  aSeed;
  attribute float aDepth;

  varying float vAlpha;
  varying float vHeat;
  varying float vWave;
  varying vec2  vDir;

  const float PI = 3.14159265;

  /* One mode's contribution at normalised position xn, phase-advanced by m·phi.
     Rotating (q, qv) is a rotation in the mode's own phase plane: exact, and
     the reason the shaft shows a travelling wave instead of a lagged copy. */
  float modeAt(float m, float q, float qv, float phi, float xn) {
    float s = m * phi;
    return (q * cos(s) + qv * sin(s)) * sin(m * PI * xn);
  }

  void main() {
    // Per-particle stagger, so a transition arrives as a sweep rather than a
    // rigid teleport of the whole field at once.
    float stagger = 0.65 + aSeed.x * 0.35;

    vec2 p = aP01.xy * uW[0] + aP01.zw * uW[1]
           + aP23.xy * uW[2] + aP23.zw * uW[3]
           + aP45.xy * uW[4] + aP45.zw * uW[5];

    // Visibility follows the *population* of each active state: sparse states
    // keep only a small share of particles rather than stacking thousands on
    // every plotted point.
    float alpha = 0.0;
    alpha += uW[0] * step(aSeed.z, uShare[0]);
    alpha += uW[1] * step(aSeed.z, uShare[1]);
    alpha += uW[2] * step(aSeed.z, uShare[2]);
    alpha += uW[3] * step(aSeed.z, uShare[3]);
    alpha += uW[4] * step(aSeed.z, uShare[4]);
    alpha += uW[5] * step(aSeed.z, uShare[5]);

    /* ── the shaft ─────────────────────────────────────────────────────── */
    float d = fract(aDepth - uTravel);
    float zPos = mix(uZNear, uZFar, d);
    // Both ends have to fade or the wrap is a visible pop: particles arrive out
    // of the far dark and dissolve just before they reach the lens.
    float depthFade = smoothstep(0.0, 0.16, d) * smoothstep(1.0, 0.88, d);

    /* ── the standing wave, travelling ─────────────────────────────────── */
    float xn = clamp(p.x * 0.38 + 0.5, 0.0, 1.0);
    float phi = uLag * d;
    float disp =
        modeAt(1.0, uQ[0], uQV[0], phi, xn)
      + modeAt(2.0, uQ[1], uQV[1], phi, xn)
      + modeAt(3.0, uQ[2], uQV[2], phi, xn)
      + modeAt(4.0, uQ[3], uQV[3], phi, xn)
      + modeAt(5.0, uQ[4], uQV[4], phi, xn)
      + modeAt(6.0, uQ[5], uQV[5], phi, xn);
    p.y += disp * uWave;

    // Noise jitter: maximal at SNR 0, gone once the signal is resolved.
    float noise = (1.0 - uSnr) * 0.055 * stagger;
    float phase = aSeed.y * 6.2831853;
    p.x += noise * sin(uTime * 2.3 + phase);
    p.y += noise * cos(uTime * 1.9 + phase * 1.7);

    // A slow parallax lean toward the pointer — enough to feel alive, not
    // enough to read as a gimmick. Scaled by depth, so near slices swing wider
    // than far ones and the shaft acquires real volume as you move the mouse.
    p += uPointer * 0.045 * (0.4 + aSeed.x * 0.6) * (1.6 - d);

    zPos += 0.012 * sin(uTime * 0.6 + phase);

    vec4 mv = modelViewMatrix * vec4(p, zPos, 1.0);
    gl_Position = projectionMatrix * mv;

    vAlpha = clamp(alpha, 0.0, 1.0) * depthFade;
    // Particles still far from their target run hot; they cool as they land.
    vHeat = clamp((1.0 - uSnr) * 0.55 + aSeed.x * 0.10, 0.0, 1.0);
    vWave = clamp(abs(disp) * 2.2, 0.0, 1.0);
    vDir = normalize(p + vec2(1e-4));

    // Perspective point sizing: apparent size falls with distance, exactly as
    // the projection would scale a quad. Clamped, because a particle a hair in
    // front of the lens would otherwise cover the frame and the fill cost of a
    // few thousand of those is the whole frame budget.
    float ps = uSize * aSeed.w * uPixelRatio
             * (0.70 + 0.35 * (1.0 - uSnr))
             * (uDepthScale / max(-mv.z, 0.05));
    gl_PointSize = clamp(ps, 0.0, 22.0);
  }
`;

export const fragmentShader = /* glsl */ `
  // No explicit precision qualifier: three prepends one, and declaring
  // mediump here while the vertex stage defaults to highp makes uSnr's
  // precision differ between stages, which fails program validation.
  uniform vec3  uInk;
  uniform vec3  uSignal;
  uniform float uSnr;
  uniform float uLock;      // 0..1 — how near the drive is to a mode

  varying float vAlpha;
  varying float vHeat;
  varying float vWave;
  varying vec2  vDir;

  float disc(vec2 c) {
    return smoothstep(0.5, 0.08, length(c));
  }

  void main() {
    if (vAlpha <= 0.001) discard;

    // No bone split any more. The dust is the far volume of the shaft and the
    // acts are opaque panels standing in it, so an inverted act simply occludes
    // what is behind it — which is what an opaque panel does. The per-fragment
    // inversion existed because the bone used to be a fixed sheet UNDER this
    // canvas; there is no such sheet now.
    vec3 ink = uInk;
    vec3 sig = uSignal;

    vec2 c = gl_PointCoord - 0.5;

    // Per-channel offset, strongest at the noise floor and toward the edges.
    float aberr = (1.0 - uSnr) * 0.16;
    vec2 off = vDir * aberr;

    float r = disc(c - off);
    float g = disc(c);
    float b = disc(c + off);

    // Antinodes run hot and the whole field warms when the cavity locks on a
    // mode: the colour is a readout of the same number the synth is playing.
    float heat = clamp(vHeat * 0.75 + vWave * 0.55 + uLock * vWave * 0.6, 0.0, 1.0);
    vec3 tint = mix(ink, sig, heat);
    vec3 rgb = tint * vec3(r, g, b);

    // FIELD_ALPHA keeps the field behind the type rather than beside it. The
    // reference sites all hold their background object well under the copy;
    // at full strength this reads as a smear, not an instrument. Lower than it
    // was on the flat field: the shaft stacks many depth slices through the
    // same pixel, so the same per-particle alpha buys far more coverage.
    const float FIELD_ALPHA = 0.24;
    float a = max(r, max(g, b)) * vAlpha * FIELD_ALPHA * (1.0 + 0.5 * vWave);

    // Premultiplied: the canvas sits over a CSS background, and straight alpha
    // fringes every point with a dark halo against it.
    gl_FragColor = vec4(rgb * a, a);
  }
`;
