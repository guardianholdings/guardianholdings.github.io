/**
 * Animation registry — the reveal modules only.
 *
 * The three modules that used to live here and are now gone were all doing the
 * same job by hand: turning scroll position into where you are in the site.
 * The shaft owns that now (scripts/tunnel.ts).
 *   · acts.ts     — one ScrollTrigger per act, reporting the act index.
 *   · hscroll.ts  — pinned the two instrument panels and scrubbed them sideways.
 *                   There is nothing left to pin: an act holds still because the
 *                   camera is holding still, and the panel pans on its dwell.
 *   · parallax.ts — faked depth with a scrubbed y offset. The acts are in a real
 *                   3D space now, so depth is depth.
 *
 * Order still matters: these all resolve their trigger positions from the
 * shaft's schedule, so the shaft must be built before initAll runs.
 */
import * as word from './word';
import * as lines from './lines';
import * as scramble from './scramble';
import * as counter from './counter';
import * as draw from './draw';
import * as fadeUp from './fade-up';

const modules = [word, lines, scramble, counter, draw, fadeUp];

/**
 * Put back decoration the document was authored with that a context revert
 * stripped. For the reduced-motion path, where no module initialises and the
 * document is meant to stand exactly as written.
 */
export function restoreAuthored(root: ParentNode): void {
  scramble.restoreHot(root);
}

export function initAll(root: ParentNode): void {
  for (const mod of modules) mod.init(root);
}

interface Scheduler {
  postTask?: (cb: () => void, opts?: { priority?: string }) => Promise<unknown>;
}

/**
 * Build the reveals in chunks instead of in one synchronous block.
 *
 * Mobile TBT was ONE task. Lighthouse recorded three long tasks; two land
 * before FCP and score zero, so the whole 205ms was the 263ms task in which
 * build() ran uninterrupted. Instrumented at 4x CPU, SplitText cost 370.5ms
 * inside it and DrawSVG 113.8ms — and only 9.8ms of that belonged to the act
 * actually on screen. The other ~475ms hid glyphs on acts parked at negative Z
 * that nobody reaches for tens of seconds.
 *
 * WHAT IS ON SCREEN MUST STILL BE BUILT SYNCHRONOUSLY, and this is the trap:
 * an act that has not been initialised is FULLY COMPOSED. Every module hides
 * its own targets inside init() — word.ts sets yPercent 110, lines.ts masks,
 * draw.ts sets drawSVG 0% — so deferring an act you can already see paints its
 * opener un-hidden for a frame or two. At scroll 0 three acts are visible, two
 * of them at fractional opacity, so a fixed "first N acts" rule would be wrong
 * on the wrong viewport. tunnel.ts writes the first frame before it returns
 * (createTunnel ends with step(0, 0)), so each plane's INLINE visibility is
 * already the exact truth about what is on screen. That is what decides.
 *
 * Returns a canceller. app.ts registers it with onCleanup, so a rebuild —
 * which is what a reduced-motion switch does — drops the queue before
 * context.revert() runs.
 */
export function initStaged(root: ParentNode, onDrained: () => void): () => void {
  const queue: Array<() => void> = [];

  for (const act of Array.from(root.querySelectorAll<HTMLElement>('section[data-act]'))) {
    if (act.style.visibility === 'hidden') queue.push(() => initAll(act));
    else initAll(act);
  }

  // Safety net. Every [data-anim] on this page is inside an act — measured, 96
  // of 96 — but nothing enforces that, and a stray one outside would otherwise
  // never initialise at all. The claim marks in util.ts make this a no-op for
  // everything already built, so it costs one query per module.
  queue.push(() => initAll(root));

  let cancelled = false;
  let drained = false;

  // Splitting an act changes its height, and tunnel.ts measures the whole
  // schedule from those heights. Building the far acts asynchronously means
  // the last of app.ts's refresh signals can land BEFORE they are split, which
  // measured the shaft 21px short in every local run until this existed. Fire
  // once, when the queue is genuinely empty.
  const finish = (): void => {
    if (drained || cancelled) return;
    drained = true;
    onDrained();
  };

  const drain = (): void => {
    while (queue.length) queue.shift()?.();
    finish();
  };

  // A visitor who scrolls before the queue has drained would meet an act the
  // tunnel is about to un-hide while it is still fully composed. Finishing the
  // rest synchronously on the first scroll trades a one-off task for that never
  // being possible. By then the reveals are what the frame budget is for.
  const onScroll = (): void => {
    if (!cancelled) drain();
  };
  window.addEventListener('scroll', onScroll, { once: true, passive: true });

  const post = (fn: () => void): void => {
    const sched = (window as Window & { scheduler?: Scheduler }).scheduler;
    if (sched?.postTask) void sched.postTask(fn, { priority: 'user-blocking' });
    else window.setTimeout(fn, 0);
  };

  const pump = (): void => {
    if (cancelled) return;
    queue.shift()?.();
    if (queue.length) post(pump);
    else finish();
  };

  post(pump);

  return () => {
    cancelled = true;
    queue.length = 0;
    window.removeEventListener('scroll', onScroll);
  };
}
