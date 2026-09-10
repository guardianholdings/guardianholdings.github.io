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
        /* NOT 'auto'. That writes aria-label onto the split element AND
           aria-hidden onto every line wrapper. These targets are <p> (role
           paragraph), where naming is PROHIBITED — so the label was discarded
           while the lines stayed hidden, and 21 paragraphs of body copy were
           announced as nothing. 'none' adds neither: the text reads from the
           line wrappers, which is what line-level splitting is safe for.
           anims/word.ts must keep 'auto' — its targets are <h2>, where naming
           is legal, and nine <section> landmarks take their accessible name
           from those labels via aria-labelledby. */
        aria: 'none',
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
