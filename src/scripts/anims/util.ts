/**
 * Shared helpers for the anims/* modules: idempotency marks, context plumbing,
 * token resolution and per-page cleanups.
 */
/** Attribute holding the space-separated keys of every module that claimed an element. */
export const READY_ATTR = 'data-anim-ready';

/**
 * Claim an element for one module. Returns false only if THAT module already
 * claimed it.
 *
 * The key is not decoration. Claims used to be keyless, so the first module to
 * take an element locked out every later one — and because `data-hscroll` and
 * `data-act` sit on the same <section>, hscroll (registered first) silently
 * stole #process and #provide from acts.ts. Those two acts then had no act
 * trigger at all: the HUD kept reporting a stale act while you were inside
 * them and the field never morphed to their states.
 */
export function claim(el: Element, key: string): boolean {
  const held = (el.getAttribute(READY_ATTR) ?? '').split(/\s+/).filter(Boolean);
  if (held.includes(key)) return false;
  held.push(key);
  el.setAttribute(READY_ATTR, held.join(' '));
  return true;
}

/** Query elements not yet claimed by `key` under `root` and claim them in one pass. */
export function fresh<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
  key: string,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector)).filter((el) => claim(el, key));
}

/** Remove every claim under `root` so a rebuilt page can re-initialize. */
export function unclaimAll(root: ParentNode): void {
  root.querySelectorAll(`[${READY_ATTR}]`).forEach((el) => el.removeAttribute(READY_ATTR));
}

/** Resolve a CSS custom property (e.g. '--signal') to its computed value. */
export function token(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/* ---------- reveal triggers ---------- */

/**
 * How a reveal decides when to fire. Set by tunnel.ts while the shaft is up.
 *
 * This indirection is the seam that let the site move into a 3D shaft without
 * touching any of the six reveal modules. In the shaft nothing scrolls in
 * document flow, so an element trigger is meaningless — every act sits at the
 * same document position and every reveal would fire at once, near scroll 0.
 * The shaft knows the scroll position of each act's arrival instead, so it
 * hands that in and `enterTrigger` returns an absolute start.
 */
let revealMarker: ((el: Element) => Element | null) | null = null;

export function setRevealResolver(fn: ((el: Element) => Element | null) | null): void {
  revealMarker = fn;
}

/** A standard "enter once" ScrollTrigger config. */
export function enterTrigger(el: Element, start = 'top 85%'): ScrollTrigger.Vars {
  const marker = revealMarker?.(el);
  if (marker) {
    // A real element in normal flow, parked at the scroll position where this
    // act arrives. Absolute numeric start/end was the obvious thing to return
    // instead, and it does not fire for the act sitting at scroll 0 — the very
    // first screen anyone sees, whose headline then stays frozen on the `from`
    // state of its own reveal. A marker keeps ScrollTrigger's ordinary
    // semantics, including "already scrolled past, so fire on refresh".
    // The range is a full viewport tall, and that is not cosmetic. The marker
    // is 1px, so with the default `end` of 'bottom top' the end resolves BELOW
    // the start and ScrollTrigger collapses the range to zero length — which a
    // scroll can step straight over without the trigger ever being active. Every
    // act but the first one, whose marker sits at -1 and is unambiguously in the
    // past, silently never revealed: philosophy arrived as a blank bone panel.
    //
    // No invalidateOnRefresh either. ScrollTrigger re-measures the marker on
    // every refresh by itself, and on a `fromTo` tween that flag ALSO re-records
    // the start values, so each of the four refreshes app.ts schedules would
    // drag an already-played reveal back to its `from` state.
    return { trigger: marker, start: 'top bottom', end: 'top top', once: true };
  }
  return { trigger: el, start, once: true };
}

/** Resolves when web fonts are ready (immediately when the API is missing). */
export async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  await document.fonts.ready;
}

/* ---------- gsap.context plumbing ---------- */

let current: gsap.Context | null = null;

/** Called by app.ts so async initializers can record into the page context. */
export function setContext(ctx: gsap.Context | null): void {
  current = ctx;
}

/**
 * Identity of the active page context. Async initializers capture it and bail
 * out when it changed before they resumed (the page was swapped or rebuilt).
 */
export function currentContext(): gsap.Context | null {
  return current;
}

/**
 * Run `fn` inside the active page context (so ctx.revert() undoes everything it
 * creates — tweens, ScrollTriggers, SplitText instances). Falls back to running
 * it directly when no context is active.
 */
export function inContext(fn: () => void): void {
  if (current) current.add(fn);
  else fn();
}

/* ---------- per-page cleanups (bus subscriptions, inline styles, timers) ---------- */

const cleanups: Array<() => void> = [];

export function onCleanup(fn: () => void): void {
  cleanups.push(fn);
}

export function runCleanups(): void {
  while (cleanups.length) {
    const fn = cleanups.pop();
    try {
      fn?.();
    } catch {
      /* a failing cleanup must never block the page swap */
    }
  }
}
