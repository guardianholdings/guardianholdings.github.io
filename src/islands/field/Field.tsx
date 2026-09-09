/**
 * Gatekeeper for the WebGL centrepiece.
 *
 * Imports nothing from three or r3f itself, so the heavy chunk is only fetched
 * once the device has been judged capable and the browser is idle. If anything
 * about that judgement fails — reduced motion, no WebGL2, a low tier, a lost
 * context — the field simply never mounts and the static fallback stands in.
 */
import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { deviceTier, hasWebGL2, motionAllowed } from '../../lib/motion-policy';

const FieldScene = lazy(() => import('./FieldScene'));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Field() {
  const [tier, setTier] = useState<'high' | 'medium' | null>(null);

  useEffect(() => {
    if (!motionAllowed() || !hasWebGL2()) return;
    const t = deviceTier();
    if (t === 'low') return;

    // Never compete with first paint or with the font swap.
    let cancelled = false;
    const mount = () => {
      if (!cancelled) setTier(t === 'high' ? 'high' : 'medium');
    };

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const handle = idle ? idle(mount) : window.setTimeout(mount, 1200);

    return () => {
      cancelled = true;
      if (!idle) window.clearTimeout(handle as number);
    };
  }, []);

  // A lost context is not recoverable here; drop back to the static fallback
  // rather than leaving a dead canvas over the page.
  useEffect(() => {
    const onLost = () => setTier(null);
    window.addEventListener('webglcontextlost', onLost, true);
    return () => window.removeEventListener('webglcontextlost', onLost, true);
  }, []);

  // The motion policy can change after mount — from the OS setting or the site's
  // own data-motion attribute — and it has to be honoured in BOTH directions.
  // Only unmounting was asymmetric: turning reduced motion back off left the
  // page permanently on the static fallback until a reload.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const check = () => {
      if (!motionAllowed() || !hasWebGL2()) {
        setTier(null);
        return;
      }
      const t = deviceTier();
      setTier(t === 'low' ? null : t === 'high' ? 'high' : 'medium');
    };
    query.addEventListener('change', check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      query.removeEventListener('change', check);
      observer.disconnect();
    };
  }, []);

  if (!tier) return null;

  return (
    <SceneBoundary>
      <Suspense fallback={null}>
        <FieldScene tier={tier} />
      </Suspense>
    </SceneBoundary>
  );
}
