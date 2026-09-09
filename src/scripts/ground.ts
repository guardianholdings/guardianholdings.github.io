/**
 * GROUND — how much of the screen an inverted act is currently covering.
 *
 * Two acts (#philosophy, #advisory) stand on bone instead of the warm
 * near-black. In the shaft that is no longer a wipe: the act is a panel with a
 * bone background, and it arrives out of the dark, grows to fill the frame, and
 * sweeps past. The fixed sheet that used to be clipped to the section's
 * document box is gone, and so is all the geometry that went with it.
 *
 * What is still needed is the COVERAGE, because three fixed layers sit above
 * every act and have to know what they are lying on top of:
 *
 *   --bone-cover   the grain, the scanlines and the vignette are authored in
 *                  black and have to taper off over bone
 *   --g-top        the HUD's top scrim, 76px tall, re-grounds from this
 *   --g-bot        and its bottom scrim from this
 *
 * Coverage is a real AREA fraction, not the vertical band it used to be: a
 * panel one act ahead is a small lit rectangle in the middle of the frame, and
 * treating its rows as fully bone would grey out the grain across the whole
 * width of a screen that is mostly still dark.
 *
 * getBoundingClientRect() reports the projected box of a 3D-transformed
 * element, so this reads the panel exactly where it appears.
 */
import { gsap } from './gsap';
import { onCleanup } from './anims/util';

/** Height of the HUD's scrim bands, top and bottom. Mirrors Hud.astro. */
const CHROME = 76;

const EPS = 0.004;

let lastCover = -9;
let lastTop = -9;
let lastBot = -9;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Overlap of [lo, hi] with [a, b], as a fraction of (hi - lo). */
function span(lo: number, hi: number, a: number, b: number): number {
  if (hi <= lo) return 0;
  return clamp01((Math.min(hi, b) - Math.max(lo, a)) / (hi - lo));
}

export function createGround(root: ParentNode): void {
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-invert]'));
  if (!sections.length) return;

  const style = document.documentElement.style;

  const step = (): void => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Read every rect first, write afterwards — never interleave, or each write
    // invalidates layout for the next read.
    let cover = 0;
    let top = 0;
    let bot = 0;

    for (const section of sections) {
      // A culled plane has had its transform left alone, so its raw layout box
      // still starts at the top of the viewport and is taller than it — read as
      // full coverage, which paints the HUD scrims bone while the act it
      // belongs to is three stations away and invisible.
      if (section.style.visibility === 'hidden') continue;
      const r = section.getBoundingClientRect();
      const wide = span(0, vw, r.left, r.right);
      if (wide <= 0) continue;
      // A panel is only opaque where it is actually drawn, and it fades with
      // depth, so its own opacity is part of how much ground it provides.
      const alpha = Number(section.style.opacity || '1');
      const tall = span(0, vh, r.top, r.bottom);
      const area = wide * tall * alpha;
      if (area <= cover) continue;
      cover = area;
      top = span(0, CHROME, r.top, r.bottom) * wide * alpha;
      bot = span(vh - CHROME, vh, r.top, r.bottom) * wide * alpha;
    }

    if (Math.abs(cover - lastCover) >= EPS) {
      lastCover = cover;
      style.setProperty('--bone-cover', cover.toFixed(3));
    }
    if (Math.abs(top - lastTop) >= EPS) {
      lastTop = top;
      style.setProperty('--g-top', top.toFixed(3));
    }
    if (Math.abs(bot - lastBot) >= EPS) {
      lastBot = bot;
      style.setProperty('--g-bot', bot.toFixed(3));
    }
  };

  step();
  gsap.ticker.add(step);

  onCleanup(() => {
    gsap.ticker.remove(step);
    for (const name of ['--bone-cover', '--g-top', '--g-bot']) style.removeProperty(name);
    lastCover = lastTop = lastBot = -9;
  });
}
