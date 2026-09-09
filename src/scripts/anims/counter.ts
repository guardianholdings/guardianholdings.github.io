/**
 * data-anim="counter" data-count-to="360" data-count-suffix="°"
 * Optional: data-count-decimals, data-count-prefix, data-count-from, data-count-pad.
 * Counts up on enter, 1.6s power2.out, snapped to the requested precision.
 */
import { gsap } from '../gsap';
import { enterTrigger, fresh, inContext } from './util';

export function formatCount(el: HTMLElement, value: number): string {
  const decimals = Math.max(0, parseInt(el.dataset.countDecimals ?? '0', 10) || 0);
  const pad = parseInt(el.dataset.countPad ?? '0', 10) || 0;
  let s = value.toFixed(decimals);
  if (pad > 0) {
    const [int, frac] = s.split('.');
    s = int.padStart(pad, '0') + (frac ? `.${frac}` : '');
  }
  return `${el.dataset.countPrefix ?? ''}${s}${el.dataset.countSuffix ?? ''}`;
}

export function init(root: ParentNode): void {
  fresh<HTMLElement>(root, '[data-anim="counter"]', 'counter').forEach((el) => {
    const to = parseFloat(el.dataset.countTo ?? '');
    if (!Number.isFinite(to)) return;
    const from = parseFloat(el.dataset.countFrom ?? '0') || 0;
    const decimals = Math.max(0, parseInt(el.dataset.countDecimals ?? '0', 10) || 0);
    const state = { v: from };

    el.textContent = formatCount(el, from);
    inContext(() => {
      gsap.to(state, {
        v: to,
        duration: 1.6,
        ease: 'power2.out',
        snap: { v: 1 / 10 ** decimals },
        onUpdate: () => {
          el.textContent = formatCount(el, state.v);
        },
        scrollTrigger: enterTrigger(el, 'top 85%'),
      });
    });
  });
}
