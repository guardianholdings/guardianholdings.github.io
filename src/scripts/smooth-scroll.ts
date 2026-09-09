/**
 * Lenis smooth scroll wired into GSAP's ticker so ScrollTrigger and Lenis share
 * one clock. Returns null when motion is not allowed or the primary pointer is
 * coarse — native scrolling stays untouched there.
 */
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';
import { isCoarsePointer, motionAllowed } from '../lib/motion-policy';

export interface SmoothScroll {
  lenis: Lenis;
  destroy(): void;
}

export function createSmoothScroll(): SmoothScroll | null {
  if (typeof window === 'undefined') return null;
  if (!motionAllowed() || isCoarsePointer()) return null;

  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: false,
    anchors: true,
    // Slightly heavier than Lenis' default 0.1 — the camera should feel weighted.
    lerp: 0.09,
  });

  const offScroll = lenis.on('scroll', () => ScrollTrigger.update());
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  // Disable lag smoothing so a stall is not replayed as one huge delta into
  // the scrub. Restored in destroy() — leaving it at 0 globally means any
  // time-based tween created later jumps to completion after a long frame.
  gsap.ticker.lagSmoothing(0);

  let destroyed = false;
  return {
    lenis,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      offScroll();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // GSAP's documented default
      lenis.destroy();
    },
  };
}
