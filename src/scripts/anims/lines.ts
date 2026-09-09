/**
 * data-anim="lines"
 * Paragraph lines rise out of an overflow mask on enter. autoSplit re-splits
 * after font load and on width changes so line breaks always match the layout.
 */
import { gsap, SplitText } from '../gsap';
import { enterTrigger, fresh, inContext } from './util';

export function init(root: ParentNode): void {
  fresh<HTMLElement>(root, '[data-anim="lines"]', 'lines').forEach((el) => {
    inContext(() => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'split-line',
        autoSplit: true,
        aria: 'auto',
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration: 1.2,
            ease: 'expo.out',
            stagger: 0.08,
            scrollTrigger: enterTrigger(el, 'top 85%'),
          }),
      });
    });
  });
}
