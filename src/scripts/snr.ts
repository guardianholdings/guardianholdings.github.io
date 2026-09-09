/**
 * SNR — the spine of the site.
 *
 * One master ScrollTrigger produces a single scalar, signal-to-noise, that runs
 * 0 -> 1 across the whole document. Everything else on the site is a *reader* of
 * this value: the WebGL field, the grain, the hairlines, the HUD, the audio bed.
 * Nothing else is allowed to own a scroll-global progress value.
 *
 * Two delivery channels, deliberately different:
 *
 *   1. A JS store (`getSnr`, `onSnr`). Exact, every frame, zero style cost.
 *      This is what the shader and the audio graph read.
 *   2. A CSS custom property `--snr` on <html>. Throttled, because writing a
 *      custom property on the root invalidates style for the whole subtree —
 *      cheap per write, but not something to do 120x/second for free. Only
 *      genuinely CSS-side consumers (grain amplitude, vignette) should read it.
 */
import { gsap, ScrollTrigger } from './gsap';
import { bus } from '../lib/bus';

/** Minimum change before we touch the DOM or notify subscribers. */
const CSS_EPSILON = 0.004;
const BUS_EPSILON = 0.002;

let value = 0;
let raw = 0;
let lastCss = -1;
let lastBus = -1;

const subscribers = new Set<(snr: number) => void>();

/** Current signal-to-noise, 0..1. Safe to call every frame. */
export function getSnr(): number {
  return value;
}

/**
 * Raw, unshaped document progress, 0..1 — the same trigger, before the easing.
 * The shaft travels on this rather than on SNR: SNR is deliberately non-linear
 * so the hero holds the page at the noise floor, and a tunnel whose speed
 * followed that curve would stall at both ends of the document. Still one
 * trigger and still one owner of scroll-global progress.
 */
export function getProgress(): number {
  return raw;
}

/** Subscribe to SNR changes. Returns an unsubscribe function. */
export function onSnr(fn: (snr: number) => void): () => void {
  subscribers.add(fn);
  fn(value);
  return () => subscribers.delete(fn);
}

/**
 * Shaping curve. Raw document progress is linear, but the *experience* should
 * not be: the pinned hero holds the page at a low SNR far longer than its share
 * of scroll distance, and the last act should sit at a clean 1.0 rather than
 * creeping up to it. power2.inOut gives the slow start and settled tail.
 */
const shape = gsap.parseEase('power2.inOut');

function publish(next: number, progress = next): void {
  value = next;
  raw = progress;

  if (Math.abs(next - lastBus) >= BUS_EPSILON || next === 0 || next === 1) {
    lastBus = next;
    subscribers.forEach((fn) => fn(next));
    bus.emit('snr', next);
  }

  if (Math.abs(next - lastCss) >= CSS_EPSILON || next === 0 || next === 1) {
    lastCss = next;
    document.documentElement.style.setProperty('--snr', next.toFixed(3));
  }
}

/**
 * Create the master trigger. Call once, after the acts are in the DOM and
 * inside the page's gsap.context so ctx.revert() tears it down.
 */
export function createSnr(): void {
  publish(0);

  ScrollTrigger.create({
    trigger: document.documentElement,
    start: 'top top',
    end: 'bottom bottom',
    // No scrub: this trigger owns no tween, it only reports.
    onUpdate: (self) => publish(shape(self.progress), self.progress),
    onRefresh: (self) => publish(shape(self.progress), self.progress),
    invalidateOnRefresh: true,
  });
}

/**
 * Reduced-motion / no-JS-motion path: the document is already "resolved", so
 * pin the scalar at 1 and never listen to scroll.
 */
export function resolveSnr(): void {
  publish(1);
}
