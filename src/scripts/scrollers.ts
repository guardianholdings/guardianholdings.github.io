/**
 * Horizontally scrolling panels — keyboard reachability and an edge cue.
 *
 * Three acts hold a track wider than the frame below 768px: the process and
 * provide step tracks, and the universe matrix. Touch scrolls them, and both
 * step tracks snap. A keyboard could not move them at all: a plain overflow
 * box is not focusable, so arrow keys never reach it, and on a 375px viewport
 * that put 80% of act 06 behind a gesture a keyboard cannot make.
 *
 * The attributes are set from measured overflow rather than authored into the
 * markup, because above 768px these same elements are `overflow: hidden` and
 * a permanent tabindex would be a tab stop that does nothing on every desktop
 * visit. Re-measured on resize, so rotating a phone is enough to change it.
 */

const OVERFLOW_EPSILON = 2;

function measure(el: HTMLElement, label: string): void {
  // Both tests are needed. Above 768px these panels are `overflow: hidden` and
  // the tunnel pans the track with a transform instead — so the content is
  // still wider than the frame and an overflow-only test would hand every
  // desktop visitor a tab stop that cannot move anything.
  const overflows = el.scrollWidth - el.clientWidth > OVERFLOW_EPSILON;
  const overflowX = getComputedStyle(el).overflowX;
  const scrollable = overflows && (overflowX === 'auto' || overflowX === 'scroll');

  if (scrollable) {
    // role=region needs an accessible name or it is not exposed as a landmark
    // at all, so the two are set together and removed together.
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', `${label} — scrolls sideways`);
    el.dataset.scrollable = '';
  } else {
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    delete el.dataset.scrollable;
  }

  edges(el, scrollable);
}

/** Which edges are still hiding content — drives the mask that fades them. */
function edges(el: HTMLElement, scrollable: boolean): void {
  if (!scrollable) {
    delete el.dataset.edge;
    return;
  }
  const max = el.scrollWidth - el.clientWidth;
  const start = el.scrollLeft > OVERFLOW_EPSILON;
  const end = el.scrollLeft < max - OVERFLOW_EPSILON;
  el.dataset.edge = `${start ? 'start' : ''} ${end ? 'end' : ''}`.trim();
}

export function initScroller(selector: string, label: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;

  el.classList.add('gh-scroller');
  measure(el, label);

  el.addEventListener('scroll', () => edges(el, 'scrollable' in el.dataset), { passive: true });

  // The track's own width changes with the breakpoint, not just the window's,
  // so observe the element rather than listening for window resize.
  new ResizeObserver(() => measure(el, label)).observe(el);
}
