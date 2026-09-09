/**
 * data-anim="draw"
 * Hairlines, arcs and reticles draw themselves in on enter (DrawSVG 0% → 100%).
 * Applies to every stroked shape under the element (or the element itself).
 * Optional: data-draw-duration (seconds).
 */
import { gsap } from '../gsap';
import { enterTrigger, fresh, inContext } from './util';

const SHAPES = 'path, line, circle, polyline, polygon, rect, ellipse';

export function init(root: ParentNode): void {
  fresh<Element>(root, '[data-anim="draw"]', 'draw').forEach((el) => {
    const found = Array.from(el.querySelectorAll(SHAPES));
    if (el.matches(SHAPES)) found.unshift(el);
    const shapes = found.filter((s) => {
      const stroke = getComputedStyle(s).stroke;
      return stroke && stroke !== 'none';
    });
    if (!shapes.length) return;
    const duration = parseFloat((el as HTMLElement).dataset?.drawDuration ?? '1.4') || 1.4;

    inContext(() => {
      gsap.fromTo(
        shapes,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration, ease: 'power3.inOut', stagger: 0.05, scrollTrigger: enterTrigger(el, 'top 85%') },
      );
    });
  });
}
