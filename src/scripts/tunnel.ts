/**
 * TUNNEL — the shaft, and the acts standing inside it.
 *
 * The acts are not a scrolling document with a tunnel painted behind them. They
 * are ten planes suspended at fixed depths in one shared 3D space, and the
 * scroll is a camera flying down it. At any moment you can see the act you are
 * reading at full size and the next two or three receding ahead of it toward
 * the vanishing point, dimming as they go.
 *
 * That is the whole reason for the rewrite. When each act was a section in
 * normal flow with its own small depth nudge, only one was ever on screen, so
 * there was nothing for the shaft to be a shaft OF — it read as pages with a
 * background. Depth needs two things at different distances to be visible at
 * the same time.
 *
 * ── The camera ──────────────────────────────────────────────────────────────
 * Act i sits at depth D[i] = CREEP + i·GAP. The camera is at C. An act renders
 * at translateZ(C - D[i]), so it is at unity when the camera reaches it, half
 * size one GAP ahead, a third two GAPs ahead. The browser's own `perspective`
 * does the projection, which is why GAP and PERSPECTIVE both live in shaft.ts
 * alongside the numbers the WebGL camera uses.
 *
 * C is not linear in scroll. Each act gets a DWELL — a stretch of scroll over
 * which the camera barely advances (CREEP) and the act instead pans, vertically
 * for ordinary acts and horizontally for the two instrument panels. Between
 * dwells the camera FLIES, eased at both ends so it leaves and arrives at the
 * dwell's own near-zero rate and there is no lurch at the joins.
 *
 * So: an act is a station, the gap between two acts is the flight, and the
 * copy stays at 1:1 and fully legible for the whole time you are at a station.
 * A tunnel you cannot read is a screensaver.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * Nothing scrolls in document flow any more, so ScrollTrigger cannot see an
 * act's position. This module therefore owns what those triggers used to do:
 * the act index on the bus (was anims/acts.ts), the horizontal scrub of the two
 * pinned panels (was anims/hscroll.ts), and the scroll positions the reveal
 * animations fire at (via `actRevealScroll`, which anims/util.ts asks for).
 */
import { gsap, ScrollTrigger } from './gsap';
import { bus } from '../lib/bus';
import { onCleanup, setRevealResolver } from './anims/util';
import { GAP, PERSPECTIVE, addIdle, setCameraZ } from './shaft';

/** Camera drift during a dwell. Small, but the shaft must never look frozen. */
const CREEP = GAP * 0.07;
/** Scroll, in viewport heights, spent flying one GAP. */
const FLIGHT_VH = 0.95;
/** Shortest dwell, in viewport heights, before an act's own pan is added. */
const DWELL_VH = 0.6;

/** Depth past which an act is not rendered at all. */
const FAR_LIMIT = -3.05 * GAP;
/** Depth at which an act has swept past the lens. Must stay well under
 *  PERSPECTIVE: at z = PERSPECTIVE the projection is singular. */
const NEAR_LIMIT = 0.44 * PERSPECTIVE;
/** Distance over which an act fades to nothing as it recedes. */
const DIM_RANGE = 2.3 * GAP;
/** Depth of field. A plane one GAP away is half size and still perfectly sharp
 *  without this, so its type lands right on top of the type you are reading —
 *  legible enough to fight it and not legible enough to be worth reading. Out
 *  of focus it reads as distance, which is what it is. Capped because blur cost
 *  scales with the blurred area and these are viewport-sized layers. */
const BLUR_PER_GAP = 2.8;
const BLUR_MAX = 5;

/**
 * The CLEAR ZONE — the half-width, in depth, of the window around a station
 * inside which an act is rendered at full opacity, with no blur at all, and
 * never magnified past 1:1.
 *
 * Depth is a cue the OTHER planes carry. Copy you are meant to be reading is
 * not a depth cue, and an act that dims to 93% and picks up a fifth of a pixel
 * of blur at the ends of its own dwell is being degraded for nothing. Must
 * exceed the dwell's own camera travel (2·CREEP) or the guarantee has a hole in
 * it at exactly the moments the camera is arriving and leaving.
 */
const CLEAR = GAP * 0.16;
/**
 * Vertical margin held clear of the HUD's two readout bands, px.
 *
 * The readable window is the viewport MINUS these, and an act taller than that
 * window pans — not one taller than the viewport. Otherwise a tall act parks
 * its first line under the top readout at the start of its pan and its last
 * line under the bottom readout at the end, and both are unreadable at exactly
 * the extremes of the travel.
 */
const SAFE = 48;

const EPS = 0.0015;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const flightEase = gsap.parseEase('power2.inOut');

/** Viewport height less the HUD bands, floored so a short landscape phone
 *  still gets a usable window rather than a negative one. */
const readableHeight = (vh: number) => Math.max(240, vh - SAFE * 2);

/**
 * Layout distance from `root`'s left edge to `el`'s, walking the offsetParent
 * chain. `offsetLeft` is a layout property, so unlike a rect it is unaffected
 * by the transforms this module writes on the plane every frame — which is the
 * whole reason it is used here and a `getBoundingClientRect` difference is not.
 */
function insetWithin(el: HTMLElement, root: HTMLElement): number {
  let x = 0;
  for (let node: HTMLElement | null = el; node && node !== root;) {
    x += node.offsetLeft;
    const parent = node.offsetParent as HTMLElement | null;
    // The chain ran out before reaching the plane — only possible if the plane
    // is not positioned, i.e. not in tunnel mode. Fall back to the direct
    // offset rather than returning a viewport-relative number.
    if (!parent) return el.offsetLeft;
    node = parent;
  }
  return x;
}

interface Plane {
  el: HTMLElement;
  index: number;
  /** Layout height, unaffected by the transform we write on it. */
  height: number;
  depth: number;
  /** Vertical travel needed to read the whole act, px. */
  panY: number;
  /** The two instrument panels pan sideways instead. */
  track: HTMLElement | null;
  rail: HTMLElement | null;
  counter: HTMLElement | null;
  counterInitial: string;
  panels: number;
  panX: number;
  dwellStart: number;
  dwellLength: number;
  /** Camera depth at the start and end of this act's dwell. */
  dwellFrom: number;
  dwellTo: number;
  /** 1px element in the scroll spacer, at the scroll where this act arrives. */
  mark: HTMLElement;
  /* Last written, so a frame that changes nothing writes nothing. Seeded to
     Infinity, NOT NaN: every comparison against NaN is false, so a NaN seed
     silently suppresses the FIRST write and every plane stays untransformed
     until something happens to move it. */
  wz: number;
  wy: number;
  wo: number;
  wx: number;
  wb: number;
  hidden: boolean;
  live: boolean;
  panelShown: number;
}

let planes: Plane[] = [];
let spacer: HTMLElement | null = null;
let total = 0;
let currentAct = -1;
let active = false;

/** Is the shaft built? Reveal triggers ask, because their answer changes. */
export function tunnelActive(): boolean {
  return active;
}

/**
 * The marker standing at the scroll position where the act owning `el` arrives.
 * Reveals hang off it, so a station's copy resolves as you fly the last of the
 * distance in rather than snapping on arrival.
 */
export function actRevealMarker(el: Element): Element | null {
  const section = el.closest<HTMLElement>('[data-act]');
  if (!section) return null;
  return planes.find((p) => p.el === section)?.mark ?? null;
}

/* ── schedule ─────────────────────────────────────────────────────────────── */

function measure(): void {
  if (!planes.length) return;
  const vh = window.innerHeight;
  const flight = vh * FLIGHT_VH;

  const view = readableHeight(vh);

  let scroll = 0;
  for (const p of planes) {
    p.height = p.el.offsetHeight;
    p.panY = Math.max(0, p.height - view);
    if (p.track) {
      // A panel act pans sideways, so its own height must not also buy dwell.
      //
      // BOTH gutters, not one. The track starts `inset` in from the frame and
      // has to finish `inset` in from the other side; measuring the pan as
      // scrollWidth - clientWidth leaves the closing panel of every sideways
      // act hanging exactly one gutter over the right edge, permanently, at the
      // one scroll position where it is supposed to be the thing you are
      // reading. Both instrument panels ended on a cropped card.
      const inset = insetWithin(p.track, p.el);
      p.panX = Math.max(0, p.track.scrollWidth + inset * 2 - p.el.clientWidth);
      p.panY = 0;
    }
    p.depth = p.index * GAP;
    // A dwell ARRIVES at its plane; it does not fly through it. The camera runs
    // from 2·CREEP short of the act to exactly its depth, so the act grows the
    // last few per cent into place and settles at 1:1.
    //
    // The alternative — straddling, which this used to do — puts the camera in
    // FRONT of the plane for the back half of every dwell, where perspective
    // magnifies it past the frame and `overflow: hidden` starts eating its
    // edges. On the closing act, which the scroll ends inside, that clipping
    // was permanent. A station may never crop its own copy.
    p.dwellFrom = p.depth - 2 * CREEP;
    p.dwellTo = p.depth;

    if (p.index > 0) scroll += flight;
    p.dwellStart = scroll;
    p.dwellLength = vh * DWELL_VH + p.panY + p.panX;
    scroll += p.dwellLength;

    // The reveal fires when the marker crosses the viewport BOTTOM (see
    // enterTrigger), so the marker itself sits one viewport below the scroll
    // position we actually want to fire at. The -1 keeps the opening act
    // unambiguously in the past: a trigger resolving to exactly scroll 0 is
    // neither before nor after, and that is the worst act to leave undecided.
    const at = Math.max(0, Math.round(p.dwellStart - vh * FLIGHT_VH * 0.45));
    const top = `${at + vh - 1}px`;
    if (p.mark.style.top !== top) p.mark.style.top = top;
  }
  total = scroll;

  if (spacer) {
    const h = `${Math.round(total + vh)}px`;
    if (spacer.style.height !== h) spacer.style.height = h;
  }
}

/** Camera depth for a scroll position, plus each act's pan progress. */
function cameraAt(scroll: number): number {
  const vh = window.innerHeight;
  const flight = vh * FLIGHT_VH;

  for (let i = 0; i < planes.length; i += 1) {
    const p = planes[i];

    if (i > 0) {
      const fStart = p.dwellStart - flight;
      if (scroll < fStart) break; // handled by an earlier segment
      if (scroll < p.dwellStart) {
        const prev = planes[i - 1];
        const t = flight > 0 ? (scroll - fStart) / flight : 1;
        // Eased at both ends so the camera leaves and arrives at the dwell's
        // own near-zero rate. A linear flight would step the velocity twice
        // per act and you would feel every join.
        return gsap.utils.interpolate(prev.dwellTo, p.dwellFrom, flightEase(clamp01(t)));
      }
    }

    if (scroll <= p.dwellStart + p.dwellLength || i === planes.length - 1) {
      const t = p.dwellLength > 0 ? clamp01((scroll - p.dwellStart) / p.dwellLength) : 0;
      return p.dwellFrom + (p.dwellTo - p.dwellFrom) * t;
    }
  }
  return planes.length ? planes[planes.length - 1].dwellTo : 0;
}

/** 0 before its dwell, 0..1 across it, 1 after. */
function panProgress(p: Plane, scroll: number): number {
  if (scroll <= p.dwellStart) return 0;
  if (p.dwellLength <= 0) return 1;
  return clamp01((scroll - p.dwellStart) / p.dwellLength);
}

/* ── build ────────────────────────────────────────────────────────────────── */

export function createTunnel(root: ParentNode): void {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-act]'));
  if (!sections.length) return;

  spacer = document.querySelector<HTMLElement>('.shaft-spacer');

  planes = sections.map((el, i) => {
    const track = el.querySelector<HTMLElement>('[data-hscroll-track]');
    const counter = el.querySelector<HTMLElement>('[data-hscroll-index]');
    const mark = document.createElement('i');
    mark.className = 'shaft-mark';
    mark.setAttribute('aria-hidden', 'true');
    spacer?.appendChild(mark);
    return {
      mark,
      el,
      index: Number(el.dataset.act) || i,
      height: 0,
      depth: 0,
      panY: 0,
      track,
      rail: el.querySelector<HTMLElement>('[data-hscroll-rail]'),
      counter,
      counterInitial: counter?.textContent ?? '',
      panels: track ? track.children.length : 0,
      panX: 0,
      dwellStart: 0,
      dwellLength: 0,
      dwellFrom: 0,
      dwellTo: 0,
      wz: Infinity, wy: Infinity, wo: Infinity, wx: Infinity, wb: Infinity,
      hidden: false,
      live: false,
      panelShown: -1,
    };
  });

  document.documentElement.dataset.tunnel = 'on';
  active = true;
  setRevealResolver(actRevealMarker);
  measure();

  // Re-measure whenever anything else refreshes. refreshInit runs BEFORE the
  // triggers recalculate, so the reveal starts that ask actRevealScroll() for
  // their position read the new schedule rather than the previous one.
  const onRefreshInit = () => measure();
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);

  for (const p of planes) {
    if (p.rail) gsap.set(p.rail, { scaleX: 0, transformOrigin: 'left center' });
    if (p.track) p.el.setAttribute('data-hscroll-active', '');
  }

  const step = (_t: number, delta: number): void => {
    addIdle(delta / 1000);

    const vh = window.innerHeight;
    const view = readableHeight(vh);
    const scroll = window.scrollY;
    const camera = cameraAt(scroll);
    setCameraZ(camera);

    let inDwell = -1;

    for (const p of planes) {
      const z = camera - p.depth;

      if (z < FAR_LIMIT || z > NEAR_LIMIT) {
        if (!p.hidden) {
          p.hidden = true;
          p.live = false;
          // visibility, not display: display:none would drop the layout this
          // module measures the schedule from.
          p.el.style.visibility = 'hidden';
          p.el.style.pointerEvents = 'none';
          // Drop the blur with it, so a plane that comes back does not paint
          // one frame at whatever focus it had when it left.
          p.el.style.filter = '';
          p.wb = Infinity;
        }
        continue;
      }
      if (p.hidden) {
        p.hidden = false;
        p.el.style.visibility = '';
      }

      const pan = panProgress(p, scroll);
      if (scroll >= p.dwellStart && scroll <= p.dwellStart + p.dwellLength) inDwell = p.index;

      // Panned inside the readable window, not the raw viewport: at pan 0 the
      // plane's top edge sits SAFE below the frame, at pan 1 its bottom edge
      // sits SAFE above it, and an act short enough not to pan is centred in
      // the same window — which, since the two margins are equal, is exactly
      // where centring in the viewport would have put it.
      const y = p.panY > 0 ? SAFE - p.panY * pan : SAFE + (view - p.height) / 2;

      // Atmospheric perspective, measured from the EDGE of the clear zone
      // rather than from the lens, so a station is flat 1.000 and the falloff
      // starts only once the plane is genuinely somewhere else. The exponent is
      // what stops the act one GAP ahead competing with the one you are
      // reading: linear dimming leaves it at 60% and the two sets of type fight.
      const behind = Math.max(0, -z - CLEAR);
      const dim = clamp01(1 - behind / DIM_RANGE) ** 2.4;
      // Sweeping past the lens — also held off until the plane leaves the clear
      // zone, and reaching zero exactly at the cull distance so the plane is
      // already invisible by the frame it is dropped on.
      const near = 1 - clamp01((z - CLEAR) / (NEAR_LIMIT - CLEAR));
      const o = dim * near;

      if (Math.abs(z - p.wz) >= 0.4 || Math.abs(y - p.wy) >= 0.4) {
        p.wz = z;
        p.wy = y;
        p.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, ${z.toFixed(1)}px)`;
      }
      if (Math.abs(o - p.wo) >= EPS) {
        p.wo = o;
        p.el.style.opacity = o.toFixed(3);
      }

      const blur = Math.min(BLUR_MAX, (Math.max(0, Math.abs(z) - CLEAR) / GAP) * BLUR_PER_GAP);
      if (Math.abs(blur - p.wb) >= 0.05) {
        p.wb = blur;
        // Removed rather than set to 0: `filter` flattens the plane's own 3D
        // children, so the act at the station must carry no filter at all or it
        // loses the interior depth its opener stands in.
        p.el.style.filter = blur > 0.12 ? `blur(${blur.toFixed(2)}px)` : '';
      }

      // Only the act at the station takes clicks. Without this the portfolio
      // filters of an act half a shaft away sit invisibly over the copy you
      // are actually reading.
      const live = Math.abs(z) < GAP * 0.4;
      if (live !== p.live) {
        p.live = live;
        p.el.style.pointerEvents = live ? 'auto' : 'none';
      }

      /* the two instrument panels pan sideways */
      if (p.track) {
        const x = -p.panX * pan;
        if (Math.abs(x - p.wx) >= 0.4) {
          p.wx = x;
          p.track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
          p.el.style.setProperty('--gh-hscroll-progress', pan.toFixed(4));
          if (p.rail) gsap.set(p.rail, { scaleX: pan });
          if (p.counter && p.panels > 0) {
            const i = Math.min(p.panels - 1, Math.floor(pan * p.panels + 1e-6));
            if (i !== p.panelShown) {
              p.panelShown = i;
              p.counter.textContent = String(i + 1).padStart(2, '0');
            }
          }
        }
      }
    }

    if (inDwell >= 0 && inDwell !== currentAct) {
      currentAct = inDwell;
      bus.emit('act', inDwell);
    }
  };

  step(0, 0);
  // Publish the opening act immediately so the HUD is never blank.
  currentAct = 0;
  bus.emit('act', 0);

  gsap.ticker.add(step);

  /* Keyboard focus. main is fixed, so the browser cannot scroll a focused
     control into view by itself — tab into the contact form from the top of
     the site and focus lands somewhere invisible. Fly to the owning act
     instead, which is the shaft's equivalent of scrollIntoView. */
  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target as Element | null;
    const section = target?.closest?.('[data-act]');
    if (!section) return;
    const plane = planes.find((p) => p.el === section);
    if (!plane) return;
    const y = window.scrollY;
    if (y >= plane.dwellStart && y <= plane.dwellStart + plane.dwellLength) return;
    window.scrollTo({ top: plane.dwellStart + 1, behavior: 'smooth' });
  };
  document.addEventListener('focusin', onFocusIn);

  onCleanup(() => {
    document.removeEventListener('focusin', onFocusIn);
    gsap.ticker.remove(step);
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    document.documentElement.removeAttribute('data-tunnel');
    setRevealResolver(null);
    active = false;
    for (const p of planes) {
      p.el.style.transform = '';
      p.el.style.opacity = '';
      p.el.style.filter = '';
      p.el.style.visibility = '';
      p.el.style.pointerEvents = '';
      p.el.style.removeProperty('--gh-hscroll-progress');
      p.el.removeAttribute('data-hscroll-active');
      if (p.track) p.track.style.transform = '';
      if (p.counter) p.counter.textContent = p.counterInitial;
    }
    for (const p of planes) p.mark.remove();
    planes = [];
    currentAct = -1;
    if (spacer) spacer.style.height = '';
    spacer = null;
  });
}
