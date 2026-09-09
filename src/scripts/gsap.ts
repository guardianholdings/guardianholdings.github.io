/**
 * Single GSAP entry point. Every script and island imports gsap from here so the
 * plugins are registered exactly once and the bundle contains one GSAP core.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, Flip);
  // House defaults: slow, heavy, no bounce.
  gsap.defaults({ ease: 'power3.out', duration: 0.8, overwrite: 'auto' });
  gsap.config({ nullTargetWarn: false });
  // Mobile address-bar show/hide must not re-layout every pin.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/** Mono glyph set used by every decode effect on the site (preloader, labels). */
export const DECODE_GLYPHS = '01/·—│┼';

export { gsap, ScrollTrigger, SplitText, Flip };
