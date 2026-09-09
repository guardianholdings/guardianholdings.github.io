/** Motion and device policy — the single source of truth for "should this animate?". */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.motion === 'reduced';
}
export function motionAllowed(): boolean { return !prefersReducedMotion(); }
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
}
export function hasWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}
export type DeviceTier = 'low' | 'medium' | 'high';
export function deviceTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'low';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return 'low';
  if ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4) return 'low';
  if (!hasWebGL2()) return 'low';
  return isCoarsePointer() ? 'medium' : 'high';
}
