/**
 * data-anim="fade-up"
 * y 24 → 0 with opacity over 1s on enter. Elements sharing a data-anim-group
 * value are triggered together by the first member and staggered 0.1s.
 * Optional: data-anim-delay (seconds).
 *
 * `[data-magnetic]` elements belong to the cursor island, which writes
 * style.transform directly — those only fade (no y), and every target hands its
 * inline styles back to the stylesheet once it has settled.
 */
import { gsap } from '../gsap';
import { enterTrigger, fresh, inContext } from './util';

const DURATION = 1;
const EASE = 'power3.out';

function isMagnetic(el: Element): boolean {
  return el.hasAttribute('data-magnetic');
}

function reveal(targets: HTMLElement[], trigger: HTMLElement, stagger: number): void {
  const movable = targets.filter((el) => !isMagnetic(el));
  const fixed = targets.filter(isMagnetic);
  const delay = parseFloat(trigger.dataset.animDelay ?? '0') || 0;

  const tl = gsap.timeline({
    delay,
    scrollTrigger: enterTrigger(trigger),
    onComplete: () => gsap.set(targets, { clearProps: 'transform,opacity,visibility' }),
  });
  if (movable.length) {
    tl.fromTo(movable, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: DURATION, ease: EASE, stagger }, 0);
  }
  if (fixed.length) {
    // Keep the group rhythm: a magnetic member starts where it would have in the stagger.
    fixed.forEach((el) => {
      const at = targets.indexOf(el) * stagger;
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: DURATION, ease: EASE }, at);
    });
  }
}

export function init(root: ParentNode): void {
  const els = fresh<HTMLElement>(root, '[data-anim="fade-up"]', 'fade-up');
  if (!els.length) return;

  const groups = new Map<string, HTMLElement[]>();
  const singles: HTMLElement[] = [];
  els.forEach((el) => {
    const g = el.dataset.animGroup;
    if (g) groups.set(g, [...(groups.get(g) ?? []), el]);
    else singles.push(el);
  });

  inContext(() => {
    singles.forEach((el) => reveal([el], el, 0));
    groups.forEach((list) => reveal(list, list[0]!, 0.1));
  });
}
