/**
 * The receiver, as an r3f scene. This module is loaded lazily by Field.tsx so
 * three never enters the critical path.
 *
 * The camera is perspective, not orthographic: the particles are distributed
 * down a shaft and the scroll flies the camera into it, so the field needs a
 * real vanishing point. Everything else the scene draws — the morph, the bone
 * split, the standing wave — is described in shaders.ts.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { gsap } from '../../scripts/gsap';
import { buildField, SHARE } from './geometry';
import { fragmentShader, vertexShader } from './shaders';
import { getSnr, onSnr } from '../../scripts/snr';
import { getResonance, MODES } from '../../scripts/resonance';
import { CAM_Z, Z_FAR, Z_NEAR, shaftTravel } from '../../scripts/shaft';
import { bus } from '../../lib/bus';

/** Which visual state each act settles on. */
const ACT_STATE = [0, 2, 1, 5, 3, 1, 4, 2, 3, 5] as const;

const COUNT = { high: 32000, medium: 12000 } as const;

/* ── the shaft ────────────────────────────────────────────────────────────── */
/* Depth, travel rate and camera distance all come from scripts/shaft.ts, which
   the CSS ring layer reads too. If these two renderers disagree about depth by
   even a little, the dust and the walls slide past each other. */
/** Phase lag of mode 1 across the full shaft, radians. Mode n gets n times it,
 *  which is what a real dispersion-free guide does. */
const LAG = 1.8;
/** Displacement of the standing wave at full cavity energy, in field units. */
const WAVE_MAX = 0.34;

function readToken(name: string, fallback: string): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color(fallback);
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

function Field({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const { size, viewport } = useThree();

  const buffers = useMemo(() => buildField(count), [count]);

  const uniforms = useMemo(
    () => ({
      uW: { value: [1, 0, 0, 0, 0, 0] },
      uShare: { value: [...SHARE] },
      uQ: { value: new Array(MODES).fill(0) as number[] },
      uQV: { value: new Array(MODES).fill(0) as number[] },
      uTime: { value: 0 },
      uSnr: { value: 0 },
      uSize: { value: 1.7 },
      uPixelRatio: { value: 1 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uTravel: { value: 0 },
      uZNear: { value: Z_NEAR },
      uZFar: { value: Z_FAR },
      uDepthScale: { value: CAM_Z },
      uWave: { value: 0 },
      uLag: { value: LAG },
      uLock: { value: 0 },
      uInk: { value: readToken('--ink', '#ede8de') },
      uSignal: { value: readToken('--signal-hi', '#e8503f') },
      uRes: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3));
    g.setAttribute('aP01', new THREE.BufferAttribute(buffers.p01, 4));
    g.setAttribute('aP23', new THREE.BufferAttribute(buffers.p23, 4));
    g.setAttribute('aP45', new THREE.BufferAttribute(buffers.p45, 4));
    g.setAttribute('aSeed', new THREE.BufferAttribute(buffers.seed, 4));
    g.setAttribute('aDepth', new THREE.BufferAttribute(buffers.depth, 1));
    return g;
  }, [buffers]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        // Premultiplied "over": the fragment shader already multiplies by alpha.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendEquation: THREE.AddEquation,
      }),
    [uniforms],
  );

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  /* ── act → state weights, crossfaded ──────────────────────────────────── */
  useEffect(() => {
    const weights = uniforms.uW.value as number[];

    const off = bus.on('act', (index) => {
      const target = ACT_STATE[index] ?? 0;
      const next = [0, 0, 0, 0, 0, 0];
      next[target] = 1;
      gsap.to(weights, {
        // Tween the array's numeric keys directly — one tween, no allocation
        // per frame, and it interrupts cleanly when acts change quickly.
        0: next[0], 1: next[1], 2: next[2],
        3: next[3], 4: next[4], 5: next[5],
        duration: 1.4,
        ease: 'power2.inOut',
        overwrite: true,
      });
    });

    return () => {
      off();
      gsap.killTweensOf(weights);
    };
  }, [uniforms]);

  /* ── pointer parallax ─────────────────────────────────────────────────── */
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  /* ── SNR ──────────────────────────────────────────────────────────────── */
  useEffect(() => onSnr((snr) => { uniforms.uSnr.value = snr; }), [uniforms]);

  /* ── camera framing: world y spans [-1, 1] at the design plane ────────── */
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    uniforms.uPixelRatio.value = dpr;
    uniforms.uSize.value = size.width < 768 ? 1.3 : 1.7;
    // gl_FragCoord is in device pixels, so the resolution must be too.
    (uniforms.uRes.value as THREE.Vector2).set(size.width * dpr, size.height * dpr);
  }, [size, uniforms]);

  const elapsed = useRef(0);

  useFrame((state, delta) => {
    elapsed.current += delta;
    uniforms.uTime.value += delta;
    uniforms.uSnr.value = getSnr();

    // Exactly the travel the CSS walls are using, from the same function —
    // and it rides the CAMERA, so the dust flies at the rate the acts are
    // actually approaching rather than at some unrelated scroll rate.
    uniforms.uTravel.value = shaftTravel();

    /* ── the cavity ────────────────────────────────────────────────────── */
    const res = getResonance();
    const q = uniforms.uQ.value as number[];
    const qv = uniforms.uQV.value as number[];
    // The mode SHAPE is normalised so it stays legible whichever mode is up —
    // physically, mode 6 reaches a far smaller displacement than mode 1 for the
    // same drive, and left raw it would simply never be visible. The magnitude
    // is not faked: uWave carries the cavity's real energy, and the audio plays
    // the unnormalised envelopes, so loudness stays honest.
    let sum = 0;
    for (let n = 0; n < MODES; n += 1) sum += res.env[n] * res.env[n];
    const scale = 1 / Math.max(1e-4, Math.sqrt(sum));
    for (let n = 0; n < MODES; n += 1) {
      q[n] = res.q[n] * scale;
      qv[n] = res.qv[n] * scale;
    }
    // `swing`, not `energy`: energy rises with mode number for the same
    // displacement (velocity is ωq), and the field draws displacement.
    uniforms.uWave.value = WAVE_MAX * res.swing;
    uniforms.uLock.value = res.lock;

    const p = uniforms.uPointer.value as THREE.Vector2;
    // Ease toward the pointer rather than snapping — quickTo semantics without
    // allocating a tween per event.
    p.x += (pointer.current.x - p.x) * 0.05;
    p.y += (pointer.current.y - p.y) * 0.05;
    void state;
  });

  return (
    <points ref={points} geometry={geometry} material={material} frustumCulled={false} scale={[viewport.width / 2.6, viewport.height / 2, 1]} />
  );
}

export default function FieldScene({ tier }: { tier: 'high' | 'medium' }) {
  useEffect(() => {
    // Mark the layer live so the static fallback fades out. It stays in the
    // DOM rather than unmounting, so a lost context brings it straight back.
    const layer = document.querySelector('.field');
    layer?.setAttribute('data-field-live', '');
    bus.emit('field:ready');
    return () => layer?.removeAttribute('data-field-live');
  }, []);

  return (
    <Canvas
      className="field__canvas"
      camera={{ fov: 45, position: [0, 0, CAM_Z], near: 0.1, far: 120 }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, depth: false, stencil: false, alpha: true, powerPreference: 'high-performance' }}
      flat
      style={{ position: 'absolute', inset: 0 }}
    >
      <Field count={COUNT[tier]} />
    </Canvas>
  );
}
