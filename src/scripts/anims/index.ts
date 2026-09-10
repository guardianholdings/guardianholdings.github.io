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
