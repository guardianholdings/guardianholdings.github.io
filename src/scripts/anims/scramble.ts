/**
 * data-anim="scramble"
 * Mono labels decode from instrument glyphs into words on enter. The element's
 * own text is the target; a signal flash cools to its styled colour while it locks in.
 * Optional: data-scramble-delay="0.2" (seconds).
 */
import { DECODE_GLYPHS, gsap } from '../gsap';
import { enterTrigger, fresh, inContext, token } from './util';

export function init(root: ParentNode): void {
  fresh<HTMLElement>(root, '[data-anim="scramble"]', 'scramble').forEach((el) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const delay = parseFloat(el.dataset.scrambleDelay ?? '0') || 0;
    const signal = token('--signal-hi');
    const settled = getComputedStyle(el).color;

    inContext(() => {
      const tl = gsap.timeline({
        delay,
        scrollTrigger: enterTrigger(el, 'top 90%'),
        // Hand the colour back to the stylesheet so a later theme switch still applies.
        onComplete: () => gsap.set(el, { clearProps: 'color' }),
      });
      tl.fromTo(el, { color: signal }, { color: settled, duration: 0.9, ease: 'power2.in' }, 0);
      tl.to(
        el,
        {
          duration: 0.9,
          ease: 'none',
          scrambleText: { text, chars: DECODE_GLYPHS, speed: 0.5, revealDelay: 0.15, tweenLength: false },
        },
        0,
      );
    });
  });
}
