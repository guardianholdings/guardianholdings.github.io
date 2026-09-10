/**
 * data-anim="scramble"
 * Mono labels decode from instrument glyphs into words on enter. The element's
 * own text is the target; a signal flash cools to its styled colour while it locks in.
 * Optional: data-scramble-delay="0.2" (seconds).
 * Optional: data-scramble-hot="G" — characters that stay in the signal colour
 * once the word lands, instead of cooling with the rest of it.
 */
import { DECODE_GLYPHS, gsap } from '../gsap';
import { enterTrigger, fresh, inContext, token } from './util';

/**
 * Put the hot glyphs back.
 *
 * ScrambleText owns the element's content while it runs and leaves it as flat
 * text, so any markup authored inside the word is gone by the first frame.
 * This rebuilds it from the decoded text — the same string the tween targeted,
 * so what goes back is exactly what was there.
 */
function rehot(el: HTMLElement, text: string, chars: string): void {
  const want = new Set([...chars.toUpperCase()]);
  const out = document.createDocumentFragment();
  let run = '';
  const flush = () => {
    if (run) out.append(document.createTextNode(run));
    run = '';
  };
  for (const ch of text) {
    if (want.has(ch.toUpperCase())) {
      flush();
      const span = document.createElement('span');
      span.className = 'hot-glyph';
      span.textContent = ch;
      out.append(span);
    } else {
      run += ch;
    }
  }
  flush();
  el.replaceChildren(out);
}

/**
 * Re-assert the hot glyphs on any element that has lost them.
 *
 * gsap.Context.revert() puts back the plain text ScrambleText recorded when
 * its tween started, which strips decoration the document was AUTHORED with.
 * Going back to full motion that heals itself, because init() runs again and
 * completes another decode — but a switch INTO reduced motion tears the
 * context down and builds nothing, so without this the wordmark would sit
 * there grey until the next reload.
 *
 * Idempotent: an element that still has its glyphs is left alone, so this is
 * safe to call on a fresh reduced-motion load where nothing was ever reverted.
 */
export function restoreHot(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-scramble-hot]').forEach((el) => {
    const chars = el.dataset.scrambleHot ?? '';
    if (!chars || el.querySelector('.hot-glyph')) return;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) rehot(el, text, chars);
  });
}

export function init(root: ParentNode): void {
  const els = fresh<HTMLElement>(root, '[data-anim="scramble"]', 'scramble');
  if (!els.length) return;

  // Hoisted: this is a getComputedStyle on <html> and it returns the same
  // value for every element. Inside the loop it ran once per element, each
  // read landing after the previous iteration had written styles — a forced
  // layout per element. anims/word.ts already reads it this way.
  const signal = token('--signal-hi');

  // Every per-element read happens here, before any tween is built, so the
  // reads cannot interleave with the writes that tween construction makes.
  const settledColours = els.map((el) => getComputedStyle(el).color);

  els.forEach((el, i) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const delay = parseFloat(el.dataset.scrambleDelay ?? '0') || 0;
    const hot = el.dataset.scrambleHot ?? '';
    const settled = settledColours[i];

    inContext(() => {
      const tl = gsap.timeline({
        delay,
        scrollTrigger: enterTrigger(el, 'top 90%'),
        onComplete: () => {
          // Hand the colour back to the stylesheet so a later theme switch still applies.
          gsap.set(el, { clearProps: 'color' });
          if (hot) rehot(el, text, hot);
        },
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
