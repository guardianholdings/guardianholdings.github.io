/** Tiny typed event bus shared by islands and vanilla scripts. */
export type BusEvents = {
  /** Master signal-to-noise scalar, 0..1 across the whole document. */
  'snr': number;
  /** Index of the act currently occupying the viewport, 0..ACT_COUNT-1. */
  'act': number;
  /** The field island has mounted and drawn its first frame. */
  'field:ready': void;
  /** Motion runtime finished building for this document. */
  'page:load': void;
  'sound:toggle': boolean;
};

type Handler<T> = (payload: T) => void;
const handlers = new Map<keyof BusEvents, Set<Handler<any>>>();

export const bus = {
  on<K extends keyof BusEvents>(event: K, fn: Handler<BusEvents[K]>): () => void {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn);
    return () => handlers.get(event)?.delete(fn);
  },
  emit<K extends keyof BusEvents>(event: K, payload?: BusEvents[K]): void {
    handlers.get(event)?.forEach((fn) => fn(payload as BusEvents[K]));
  },
  clear(event: keyof BusEvents): void {
    handlers.delete(event);
  },
};
