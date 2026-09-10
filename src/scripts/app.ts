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
import { createTunnel } from './tunnel';
import { initAll, restoreAuthored } from './anims';
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
    initAll(root);

    // Each act is a different cavity length. Shortening the string raises the
    // visible mode rate and the audible pitch together, because they are the
    // same number.
    onCleanup(bus.on('act', setCavityAct));
  }, root);

  setContext(context);
  scheduleRefreshes();
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

  // 4. Anything else that changes document height — a late web font on an act
  //    far down the page, a filter re-plotting the portfolio grid.
  let debounce = 0;
  const observer = new ResizeObserver(() => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => ScrollTrigger.refresh(), 180);
  });
  observer.observe(document.body);
  onCleanup(() => {
    observer.disconnect();
    window.clearTimeout(debounce);
  });
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
