/**
 * Motion runtime.
 *
 * Single document, no view transitions — so unlike the previous build there is
 * no astro:before-swap teardown path and no generation counter.
 *
 * The reduced-motion decision is made here, in JS, *before* anything is built —
 * not inside gsap.matchMedia. matchMedia can only see the media query, but the
 * site's motion policy is the media query OR <html data-motion="reduced">, and
 * wiring the branch through matchMedia alone silently ignores the attribute.
 * gsap.matchMedia is still used inside individual modules for width branches,
 * which is what it is actually good at.
 */
import { gsap, ScrollTrigger } from './gsap';
import { createSmoothScroll, type SmoothScroll } from './smooth-scroll';
import { createSnr, resolveSnr } from './snr';
import { createGround } from './ground';
import { createResonance, setCavityAct } from './resonance';
import { createTunnel, scrollToReveal } from './tunnel';
import { initStaged, restoreAuthored } from './anims';
import { fontsReady, setContext, runCleanups, unclaimAll, onCleanup } from './anims/util';
import { prefersReducedMotion } from '../lib/motion-policy';
import { bus } from '../lib/bus';

let smooth: SmoothScroll | null = null;
let context: gsap.Context | null = null;

function teardown(): void {
  runCleanups();
  smooth?.destroy();
  smooth = null;
  // Reverting the context undoes every tween, ScrollTrigger and SplitText it
  // created, including the wrapper elements SplitText injects — which is why
  // this must run before anything tries to "reveal" the content by hand.
  context?.revert();
  context = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  unclaimAll(document.body);
}

function build(): void {
  teardown();

  if (prefersReducedMotion()) {
    // Nothing was ever hidden, because nothing was ever built. The document
    // stands as authored, and the instrument reads fully resolved.
    //
    // "As authored" needs help in exactly one case: arriving here from a full
    // build, teardown() has just reverted the context, and GSAP restores the
    // plain text its plugins recorded — dropping markup that was in the source.
    restoreAuthored(document.body);
    resolveSnr();
    bus.emit('page:load');
    return;
  }

  const root = document.body;

  context = gsap.context(() => {
    smooth = createSmoothScroll();
    createSnr();
    // The cavity is built before anything reads it, and before the tunnel:
    // both the shaft walls and the field ask it for the current mode shape on
    // their very first frame.
    createResonance();
    // The shaft first: it writes the transforms that ground.ts then measures,
    // and it publishes the schedule that every reveal resolves its trigger
    // position from, so initAll must come after it.
    createTunnel(root);
    createGround(root);
    // Staged, not one block: the act on screen is built synchronously and the
    // rest are queued one act per task. See initStaged for why the split is
    // decided by each plane's inline visibility and not by an act count.
    onCleanup(initStaged(root, () => ScrollTrigger.refresh()));

    // Each act is a different cavity length. Shortening the string raises the
    // visible mode rate and the audible pitch together, because they are the
    // same number.
    onCleanup(bus.on('act', setCavityAct));

    onCleanup(followFocus());
  }, root);

  setContext(context);
  scheduleRefreshes();
}

/**
 * Fly the camera to whatever the keyboard just focused.
 *
 * With `main` fixed there is nothing for the browser to scroll, so tabbing into
 * an act the camera has passed puts focus on an invisible control — the visitor
 * presses Tab, nothing appears to happen, and they type into a field they
 * cannot see.
 *
 * Guarded three ways. `:focus-visible` keeps a mouse click from yanking the
 * camera, since a click already happened where the visitor was looking. The
 * on-screen test means a control that is already readable is left alone. And
 * `scrollToReveal` returns null outside tunnel mode, where the browser's own
 * behaviour is correct and should not be second-guessed.
 */
function followFocus(): () => void {
  const onFocusIn = (event: FocusEvent) => {
    const el = event.target as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    if (!el.matches(':focus-visible')) return;

    const rect = el.getBoundingClientRect();
    // The HUD scrims cover 76px at each end, so "on screen" has to mean clear
    // of them, not merely inside the viewport.
    const BAND = 76;
    if (rect.top >= BAND && rect.bottom <= window.innerHeight - BAND) return;

    const y = scrollToReveal(el);
    if (y === null) return;

    const lenis = smooth?.lenis;
    if (lenis) lenis.scrollTo(y, { lock: true });
    else window.scrollTo({ top: y, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  document.addEventListener('focusin', onFocusIn);
  return () => document.removeEventListener('focusin', onFocusIn);
}

/**
 * Pin distances are measured against a document that is still growing at first
 * paint. With no <ClientRouter /> there is no astro:page-load to hand us a
 * second, later refresh for free, so every growth event has to be covered
 * explicitly — otherwise act boundaries are measured short and every pin
 * releases early.
 */
function scheduleRefreshes(): void {
  // 1. Real font faces replace the fallback metrics.
  void fontsReady().then(() => {
    ScrollTrigger.refresh();
    bus.emit('page:load');
  });

  // 2. Images and the lazily-imported WebGL chunk have settled.
  if (document.readyState === 'complete') {
    ScrollTrigger.refresh();
  } else {
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  }

  // 3. The field island reports its first frame.
  const offReady = bus.on('field:ready', () => ScrollTrigger.refresh());
  onCleanup(offReady);

  // There used to be a fourth signal here: a ResizeObserver on document.body,
  // meant to catch a late web font or a re-plotted portfolio grid changing the
  // document height. It could not do that job. With `main` position:fixed the
  // only in-flow child of body is .shaft-spacer — every other child is fixed or
  // zero-height — so body's height IS the spacer's height, and tunnel.ts writes
  // that itself from measure(), which only runs from a refresh. It observed its
  // own output: a strict echo of the three signals above, measured at 25191px
  // on both sides. Do not reinstate it on the ten acts either; that fires on
  // every SplitText re-split, every Flip re-plot and every vh-driven padding
  // change, which is strictly MORE refreshes than today, arriving mid-tween.
}

/**
 * A single static document can be interactive before its subresources finish,
 * so DOMContentLoaded (not window.load) is the right moment — but if the script
 * is evaluated after that has already fired, build immediately.
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', build, { once: true });
} else {
  build();
}

/* Rebuild when the motion policy changes, from either source. */
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
reduceQuery.addEventListener('change', build);

new MutationObserver((records) => {
  if (records.some((r) => r.attributeName === 'data-motion')) build();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
