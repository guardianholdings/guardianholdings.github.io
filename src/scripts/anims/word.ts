/**
 * data-anim="word"
 * The huge section openers (READINGS, PROVIDE, UNIVERSE …). Each glyph is
 * wrapped in an overflow-clipped mask; on enter the glyphs rise from 110% below
 * the baseline, left to right (stagger 0.03), flashing signal as they clear the
 * mask and cooling to the element's own colour over 0.9s (power3.out).
 * ScrollTrigger 'top 80%', once. The split happens immediately — the words are
 * single tokens, so no line re-breaking can occur when the web font lands.
 * Optional: data-word-delay (seconds).
 */
import { gsap, SplitText } from '../gsap';
import { enterTrigger, fresh, inContext, token } from './util';

const STAGGER = 0.03;
const DURATION = 0.9;
const EASE = 'power3.out';

export function init(root: ParentNode): void {
  const els = fresh<HTMLElement>(root, '[data-anim="word"]', 'word');
  if (!els.length) return;
  const signal = token('--signal-hi');

  els.forEach((el) => {
    // Chars split one at a time lose kerning; freezing it avoids a shift when the split reverts.
    el.style.fontKerning = 'none';
    const delay = parseFloat(el.dataset.wordDelay ?? '0') || 0;
    const ink = getComputedStyle(el).color;

    inContext(() => {
      const split = SplitText.create(el, {
        type: 'words,chars',
        mask: 'chars',
        charsClass: 'word-char',
        wordsClass: 'word-word',
        aria: 'auto',
        // The openers carry their kicker as an .sr-only span inside the
        // heading. Left unsplit, it stays out of the stagger and out of the
        // masks, while the aria-label SplitText writes (the element's whole
        // textContent) still includes it — which is the point of it.
        ignore: '.sr-only',
      });
      const chars = split.chars;
      if (!chars.length) return;

      // Masks are inline-block clips; the glyph inside slides up through them.
      gsap.set(split.masks, { display: 'inline-block', verticalAlign: 'top' });
      gsap.set(chars, { display: 'inline-block', yPercent: 110, color: signal });

      const tl = gsap.timeline({
        delay,
        defaults: { ease: EASE, duration: DURATION },
        scrollTrigger: enterTrigger(el, 'top 80%'),
        // will-change belongs to the tween, not to the page. Setting it in the
        // init gsap.set promoted every glyph from build() until its reveal
        // fired — and since most openers are acts down the shaft that a visitor
        // reaches minutes later, 63 of 63 .word-char elements were still
        // holding a composited layer at scroll 0.
        onStart: () => {
          gsap.set(chars, { willChange: 'transform' });
        },
        onComplete: () => {
          // Hand colour and transform back to the stylesheet (theme switches still recolour).
          gsap.set(chars, { clearProps: 'color,transform,willChange' });
          el.classList.add('is-lit');
        },
      });
      tl.to(chars, { yPercent: 0, stagger: { each: STAGGER, from: 'start' } }, 0);
      tl.to(chars, { color: ink, stagger: { each: STAGGER, from: 'start' } }, 0.12);
    });
  });
}
