/**
 * Reticle cursor — signature effect #5 of The Observatory.
 *
 * Mounted once in Base.astro as `<Cursor client:only="react" transition:persist />`.
 * Activates only for fine pointers with motion allowed; otherwise renders nothing and
 * touches nothing. While active it adds `has-custom-cursor` to <html> (cursor.css hides the
 * native cursor under that class), and paints:
 *   - a reticle (28px hairline ring, 1px crosshair, 3px signal centre dot) that follows the
 *     pointer with a lerp of 0.18, written per frame as translate3d from a rAF loop (refs only);
 *   - four L-shaped corner brackets that fly from the reticle to the bounding box of any
 *     hovered `[data-cursor="target"]` element and track it while locked;
 *   - a mono label showing `data-cursor-label`, offset below-right of the reticle;
 *   - a dot state on `a, button, [role=button]`;
 *   - magnetic pull on `[data-magnetic]` elements (≤12px toward the pointer, scale 1.02).
 * Everything is delegated at document level, so DOM swaps from the ClientRouter need no rebinding;
 * `astro:page-load` / `astro:after-swap` only reset transient state and refresh the magnet cache.
 */
import { useEffect, useRef, useState } from 'react';
import { motionAllowed } from '@/lib/motion-policy';
/* cursor.css is NOT imported here. styles/global.css:5 already pulls it into
   Base.css, which every page links; importing it from the island as well put a
   second 3,945-byte copy inline in the head of all three pages — including the
   two that never render this island at all. */

const LERP = 0.18;
const FRAME_LERP = 0.22;
const RING = 28;
const FRAME_PAD = 6;
const MAGNET_RADIUS = 80;
const MAGNET_MAX = 12;
const MAGNET_SCALE = 1.02;
const SETTLE = 0.05;

const NATIVE_SELECTOR = 'input, textarea, select, iframe, [contenteditable=""], [contenteditable="true"]';
const DOT_SELECTOR = 'a, button, [role="button"]';
const TARGET_SELECTOR = '[data-cursor="target"]';
const LABEL_SELECTOR = '[data-cursor-label]';
const MAGNET_SELECTOR = '[data-magnetic]';

interface LayerElements {
  root: HTMLDivElement;
  reticle: HTMLDivElement;
  frame: HTMLDivElement;
  label: HTMLDivElement;
}

interface MagnetOffset {
  ox: number;
  oy: number;
}

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

/** Wires every listener and the frame loop; returns a teardown that leaves no trace. */
function mountCursor(els: LayerElements): () => void {
  const html = document.documentElement;
  html.classList.add('has-custom-cursor');

  // Pointer target and eased position.
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  // Bracket frame (top-left corner + size), eased toward its goal each frame.
  let fx = 0;
  let fy = 0;
  let fw = RING;
  let fh = RING;

  let hasPointer = false;
  let visible = false;
  let rafId = 0;
  let locked: HTMLElement | null = null;
  let magnetized: HTMLElement | null = null;
  let magnets: HTMLElement[] = [];
  const offsets = new Map<HTMLElement, MagnetOffset>();

  const root = els.root;
  root.classList.add('is-hidden');

  /* ---------- state setters (class toggles only; no React state) ---------- */

  const setVisible = (next: boolean): void => {
    if (visible === next) return;
    visible = next;
    root.classList.toggle('is-hidden', !next);
    if (next) ensureLoop();
  };

  const setLock = (el: HTMLElement | null): void => {
    if (locked === el) return;
    locked = el;
    root.classList.toggle('is-locked', el !== null);
    if (el) ensureLoop();
  };

  const setDot = (on: boolean): void => {
    root.classList.toggle('is-dot', on);
  };

  const setNative = (on: boolean): void => {
    root.classList.toggle('is-native', on);
  };

  const setLabel = (text: string): void => {
    // Keep the previous text while fading out so the label never blinks empty.
    if (text) els.label.textContent = text;
    root.classList.toggle('has-label', text.length > 0);
  };

  const releaseMagnet = (el: HTMLElement): void => {
    el.classList.remove('is-magnetized');
    el.style.transform = '';
    offsets.delete(el);
  };

  const clearHoverState = (): void => {
    setLock(null);
    setDot(false);
    setNative(false);
    setLabel('');
  };

  const refreshMagnets = (): void => {
    magnets = Array.from(document.querySelectorAll<HTMLElement>(MAGNET_SELECTOR));
    if (magnetized && !magnetized.isConnected) {
      offsets.delete(magnetized);
      magnetized = null;
    }
  };

  /** Derive the full hover state from the element under the pointer. */
  const applyTarget = (t: Element): void => {
    const target = t.closest<HTMLElement>(TARGET_SELECTOR);
    const labelHost = t.closest<HTMLElement>(LABEL_SELECTOR);
    const magnet = t.closest<HTMLElement>(MAGNET_SELECTOR);
    if (magnet && !magnets.includes(magnet)) magnets.push(magnet);

    setNative(t.closest(NATIVE_SELECTOR) !== null);
    setLock(target);
    setDot(t.closest(DOT_SELECTOR) !== null);
    setLabel(labelHost?.dataset.cursorLabel?.trim() ?? '');
  };

  /* ---------- frame loop ---------- */

  const updateMagnets = (): void => {
    let best: HTMLElement | null = null;
    let bestRect: DOMRect | null = null;
    let bestDist = Infinity;

    for (const el of magnets) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const gapX = Math.max(r.left - tx, 0, tx - r.right);
      const gapY = Math.max(r.top - ty, 0, ty - r.bottom);
      const dist = Math.hypot(gapX, gapY);
      if (dist < MAGNET_RADIUS && dist < bestDist) {
        best = el;
        bestRect = r;
        bestDist = dist;
      }
    }

    if (!best || !bestRect) {
      if (magnetized) {
        releaseMagnet(magnetized);
        magnetized = null;
      }
      return;
    }

    if (magnetized !== best) {
      if (magnetized) releaseMagnet(magnetized);
      magnetized = best;
      best.classList.add('is-magnetized');
    }

    // The measured rect already includes the current pull; subtract it to find the resting centre.
    const applied = offsets.get(best) ?? { ox: 0, oy: 0 };
    const restX = bestRect.left + bestRect.width / 2 - applied.ox;
    const restY = bestRect.top + bestRect.height / 2 - applied.oy;
    const reachX = bestRect.width / 2 + MAGNET_RADIUS;
    const reachY = bestRect.height / 2 + MAGNET_RADIUS;
    const ox = clamp((tx - restX) / reachX, -1, 1) * MAGNET_MAX;
    const oy = clamp((ty - restY) / reachY, -1, 1) * MAGNET_MAX;

    best.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0) scale(${MAGNET_SCALE})`;
    offsets.set(best, { ox, oy });
  };

  const tick = (): void => {
    rafId = 0;

    cx += (tx - cx) * LERP;
    cy += (ty - cy) * LERP;
    if (Math.abs(tx - cx) < SETTLE) cx = tx;
    if (Math.abs(ty - cy) < SETTLE) cy = ty;
    els.reticle.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;

    // Bracket goal: the locked element's box (re-read every frame so scroll, resize, pins and
    // magnetic pull are all tracked), or a collapsed box riding on the reticle.
    let gx = cx - RING / 2;
    let gy = cy - RING / 2;
    let gw = RING;
    let gh = RING;
    if (locked) {
      if (!locked.isConnected) {
        setLock(null);
      } else {
        const r = locked.getBoundingClientRect();
        gx = r.left - FRAME_PAD;
        gy = r.top - FRAME_PAD;
        gw = r.width + FRAME_PAD * 2;
        gh = r.height + FRAME_PAD * 2;
      }
    }
    fx += (gx - fx) * FRAME_LERP;
    fy += (gy - fy) * FRAME_LERP;
    fw += (gw - fw) * FRAME_LERP;
    fh += (gh - fh) * FRAME_LERP;
    if (Math.abs(gx - fx) < SETTLE) fx = gx;
    if (Math.abs(gy - fy) < SETTLE) fy = gy;
    if (Math.abs(gw - fw) < SETTLE) fw = gw;
    if (Math.abs(gh - fh) < SETTLE) fh = gh;
    const frame = els.frame;
    frame.style.transform = `translate3d(${fx.toFixed(2)}px, ${fy.toFixed(2)}px, 0)`;
    frame.style.width = `${fw.toFixed(2)}px`;
    frame.style.height = `${fh.toFixed(2)}px`;

    if (visible) updateMagnets();

    const settled = cx === tx && cy === ty && fx === gx && fy === gy && fw === gw && fh === gh;
    // Keep running while the pointer is in the window (the locked box may move without any
    // pointer event) or while something is still easing home.
    if (visible || !settled || magnetized) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const ensureLoop = (): void => {
    if (rafId === 0) rafId = requestAnimationFrame(tick);
  };

  const stopLoop = (): void => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const hide = (): void => {
    setVisible(false);
    root.classList.remove('is-down');
    if (magnetized) {
      releaseMagnet(magnetized);
      magnetized = null;
    }
  };

  /* ---------- listeners ---------- */

  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      hide();
      return;
    }
    tx = e.clientX;
    ty = e.clientY;
    if (!hasPointer) {
      // First contact: place the reticle on the pointer instead of flying in from the origin.
      hasPointer = true;
      cx = tx;
      cy = ty;
      fx = tx - RING / 2;
      fy = ty - RING / 2;
    }
    setVisible(true);
    ensureLoop();
  };

  const onPointerOver = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const t = e.target;
    if (t instanceof Element) applyTarget(t);
  };

  const onPointerOut = (e: PointerEvent): void => {
    // relatedTarget === null: the pointer left the document (or entered an iframe).
    if (e.relatedTarget === null) hide();
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      hide();
      return;
    }
    root.classList.add('is-down');
  };

  const onPointerUp = (): void => {
    root.classList.remove('is-down');
  };

  const onTouchStart = (): void => {
    hide();
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      hide();
      stopLoop();
    }
  };

  const onBlur = (): void => {
    hide();
  };

  const onSwap = (): void => {
    // The ClientRouter replaced <body>; whatever we were hovering is gone.
    clearHoverState();
    if (magnetized) {
      offsets.delete(magnetized);
      magnetized.classList.remove('is-magnetized');
      magnetized = null;
    }
    refreshMagnets();
  };

  const onPageLoad = (): void => {
    refreshMagnets();
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('astro:after-swap', onSwap);
  document.addEventListener('astro:page-load', onPageLoad);

  refreshMagnets();

  return () => {
    stopLoop();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('astro:after-swap', onSwap);
    document.removeEventListener('astro:page-load', onPageLoad);
    for (const el of offsets.keys()) releaseMagnet(el);
    if (magnetized) releaseMagnet(magnetized);
    magnetized = null;
    locked = null;
    html.classList.remove('has-custom-cursor');
  };
}

/** The painted layer. Only mounted when the policy allows a custom cursor. */
function CursorLayer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const reticle = reticleRef.current;
    const frame = frameRef.current;
    const label = labelRef.current;
    if (!root || !reticle || !frame || !label) return;
    return mountCursor({ root, reticle, frame, label });
  }, []);

  return (
    <div ref={rootRef} className="gh-cursor gh-reground is-hidden" aria-hidden="true">
      <div ref={frameRef} className="gh-cursor__frame">
        <span className="gh-cursor__corner gh-cursor__corner--tl" />
        <span className="gh-cursor__corner gh-cursor__corner--tr" />
        <span className="gh-cursor__corner gh-cursor__corner--br" />
        <span className="gh-cursor__corner gh-cursor__corner--bl" />
      </div>
      <div ref={reticleRef} className="gh-cursor__reticle">
        <svg className="gh-cursor__cross" viewBox="-22 -22 44 44" width="44" height="44" focusable="false">
          <line x1="0" y1="-20" x2="0" y2="-6" />
          <line x1="0" y1="6" x2="0" y2="20" />
          <line x1="-20" y1="0" x2="-6" y2="0" />
          <line x1="6" y1="0" x2="20" y2="0" />
        </svg>
        <span className="gh-cursor__ring" />
        <span className="gh-cursor__dot" />
        <div ref={labelRef} className="gh-cursor__label" />
      </div>
    </div>
  );
}

/**
 * Policy gate. Re-evaluates when the pointer capability or the motion preference changes
 * (media queries, or `html[data-motion="reduced"]` set by a site toggle).
 */
export default function Cursor() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const evaluate = (): void => setActive(fine.matches && motionAllowed());

    evaluate();
    fine.addEventListener('change', evaluate);
    reduced.addEventListener('change', evaluate);
    const observer = new MutationObserver(evaluate);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });

    return () => {
      fine.removeEventListener('change', evaluate);
      reduced.removeEventListener('change', evaluate);
      observer.disconnect();
    };
  }, []);

  if (!active) return null;
  return <CursorLayer />;
}
