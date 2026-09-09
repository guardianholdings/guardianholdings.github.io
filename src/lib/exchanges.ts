/**
 * Market-hours logic for the vigilance ring and the hero rim.
 * CONTRACT (do not change signatures; the ring, the hero and tests depend on them):
 *   EXCHANGES, getStatus, statusAll, utcOffsetMinutes, utcAngle, nextChange, localTime
 * Implementation is owned by the vigilance agent; this file ships as a compiling stub.
 *
 * Implementation notes (vigilance agent):
 *   - Every wall-clock value is derived from Intl (cached formatters, hourCycle 'h23'),
 *     never from offset arithmetic, so DST is handled by the platform tz database.
 *   - Durations that cross midnight (weekends, overnight) are first estimated in
 *     wall-clock minutes and then corrected by probing the zoned wall-clock at the
 *     estimated instant, so a DST switch between now and the next open yields the
 *     true number of real minutes.
 */
import raw from '../data/exchanges.json';

export type HHMM = `${number}:${number}` | string;
export interface Exchange {
  id: string; code: string; city: string; exchange: string; tz: string;
  sessions: [HHMM, HHMM][]; days: number[];
}
export type MarketState = 'open' | 'lunch' | 'pre-open' | 'closed';
export interface ExchangeStatus {
  exchange: Exchange;
  state: MarketState;
  /** local wall-clock in minutes since midnight */
  localMinutes: number;
  /** minutes until the next state change, or null if unknown */
  nextChangeIn: number | null;
  nextChangeKind: 'opens' | 'closes' | 'resumes' | null;
}

export const EXCHANGES: Exchange[] = raw as Exchange[];

/** Minutes since midnight and weekday (0=Sun) in the exchange's zone. */
export function zonedNow(tz: string, now: Date = new Date()): { weekday: number; minutes: number } {
  const parts = getFormatter(tz).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  const h = parseInt(get('hour'), 10) % 24; const m = parseInt(get('minute'), 10);
  return { weekday, minutes: h * 60 + m };
}
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function getFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); fmtCache.set(tz, f); }
  return f;
}
export function toMinutes(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

/* ------------------------------------------------------------------ */
/* Private helpers                                                     */
/* ------------------------------------------------------------------ */

const MINUTES_PER_DAY = 24 * 60;
const PRE_OPEN_WINDOW = 30;
const LOOKAHEAD_DAYS = 7;

interface Session { start: number; end: number }

/** Sessions in minutes since midnight, sorted by start; cached per exchange. */
const sessionCache = new WeakMap<Exchange, Session[]>();
function sessionsOf(ex: Exchange): Session[] {
  let s = sessionCache.get(ex);
  if (!s) {
    s = ex.sessions
      .map(([a, b]) => ({ start: toMinutes(a), end: toMinutes(b) }))
      .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
      .sort((a, b) => a.start - b.start);
    sessionCache.set(ex, s);
  }
  return s;
}

/**
 * Real minutes from `now` until the zoned wall-clock reads `targetMinutes`
 * on the day `daysAhead` days from the zoned today. The first estimate assumes
 * 1440-minute days; the probe loop then reads the wall-clock back via Intl at
 * the estimated instant and corrects the residual (a DST switch shifts it by
 * ±60). Two passes cover a correction that itself lands across the switch.
 */
function minutesUntilWallClock(tz: string, now: Date, currentMinutes: number, daysAhead: number, targetMinutes: number): number {
  let estimate = daysAhead * MINUTES_PER_DAY + targetMinutes - currentMinutes;
  for (let pass = 0; pass < 2; pass++) {
    const probe = new Date(now.getTime() + estimate * 60_000);
    const { minutes } = zonedNow(tz, probe);
    let residual = targetMinutes - minutes;
    if (residual > MINUTES_PER_DAY / 2) residual -= MINUTES_PER_DAY;
    else if (residual <= -MINUTES_PER_DAY / 2) residual += MINUTES_PER_DAY;
    if (residual === 0) break;
    estimate += residual;
  }
  return estimate;
}

/** Minutes until the first session open on the next trading day (1..7 days ahead), or null. */
function minutesUntilNextTradingOpen(ex: Exchange, now: Date, weekday: number, currentMinutes: number): number | null {
  const sessions = sessionsOf(ex);
  if (sessions.length === 0 || ex.days.length === 0) return null;
  for (let d = 1; d <= LOOKAHEAD_DAYS; d++) {
    if (ex.days.includes((weekday + d) % 7)) {
      return minutesUntilWallClock(ex.tz, now, currentMinutes, d, sessions[0].start);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Market state at `now`:
 *   'open'      inside a session,
 *   'lunch'     between two sessions of the same trading day,
 *   'pre-open'  within 30 minutes before the day's first session,
 *   'closed'    otherwise (incl. non-trading days).
 * nextChangeIn / nextChangeKind walk today's remaining boundaries, then up to
 * seven days ahead to the next trading day's first open (holidays ignored).
 */
export function getStatus(ex: Exchange, now: Date = new Date()): ExchangeStatus {
  const { weekday, minutes } = zonedNow(ex.tz, now);
  const sessions = sessionsOf(ex);
  const base = { exchange: ex, localMinutes: minutes };

  if (sessions.length > 0 && ex.days.includes(weekday)) {
    const first = sessions[0];

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (minutes >= s.start && minutes < s.end) {
        return { ...base, state: 'open', nextChangeIn: minutesUntilWallClock(ex.tz, now, minutes, 0, s.end), nextChangeKind: 'closes' };
      }
      const next = sessions[i + 1];
      if (next && minutes >= s.end && minutes < next.start) {
        return { ...base, state: 'lunch', nextChangeIn: minutesUntilWallClock(ex.tz, now, minutes, 0, next.start), nextChangeKind: 'resumes' };
      }
    }

    if (minutes < first.start) {
      const until = minutesUntilWallClock(ex.tz, now, minutes, 0, first.start);
      const state: MarketState = first.start - minutes <= PRE_OPEN_WINDOW ? 'pre-open' : 'closed';
      return { ...base, state, nextChangeIn: until, nextChangeKind: 'opens' };
    }
  }

  const until = minutesUntilNextTradingOpen(ex, now, weekday, minutes);
  return { ...base, state: 'closed', nextChangeIn: until, nextChangeKind: until === null ? null : 'opens' };
}
export function statusAll(now: Date = new Date()): ExchangeStatus[] { return EXCHANGES.map((e) => getStatus(e, now)); }

const offsetFmtCache = new Map<string, Intl.DateTimeFormat>();
function getOffsetFormatter(tz: string): Intl.DateTimeFormat {
  let f = offsetFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    offsetFmtCache.set(tz, f);
  }
  return f;
}
/** UTC offset of the zone at `now`, in minutes (DST-aware). */
export function utcOffsetMinutes(tz: string, now: Date = new Date()): number {
  const p: Record<string, number> = {};
  for (const part of getOffsetFormatter(tz).formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUTC - now.getTime()) / 60_000);
}
/** Angle in degrees clockwise from 12 o'clock for a 24h dial (UTC offset → position). */
export function utcAngle(tz: string, now: Date = new Date()): number {
  const off = utcOffsetMinutes(tz, now);
  return ((off / MINUTES_PER_DAY) * 360 + 360) % 360;
}
/** The next state boundary for `ex` (opens / closes / resumes) or null when none is known. */
export function nextChange(ex: Exchange, now: Date = new Date()): { kind: 'opens' | 'closes' | 'resumes'; inMinutes: number } | null {
  const s = getStatus(ex, now);
  if (s.nextChangeIn === null || s.nextChangeKind === null) return null;
  return { kind: s.nextChangeKind, inMinutes: s.nextChangeIn };
}
const localTimeFmtCache = new Map<string, Intl.DateTimeFormat>();
export function localTime(tz: string, now: Date = new Date()): string {
  let f = localTimeFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    localTimeFmtCache.set(tz, f);
  }
  return f.format(now);
}
