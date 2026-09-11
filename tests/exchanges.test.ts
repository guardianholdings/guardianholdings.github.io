import {
  EXCHANGES,
  getStatus,
  statusAll,
  nextChange,
  utcAngle,
  utcOffsetMinutes,
  localTime,
  zonedNow,
  toMinutes,
  type Exchange,
} from '../src/lib/exchanges';

const byId = (id: string): Exchange => {
  const ex = EXCHANGES.find((e) => e.id === id);
  if (!ex) throw new Error(`missing exchange ${id}`);
  return ex;
};
const at = (iso: string) => new Date(iso);

const SOF = byId('bse');
const FRA = byId('xetra');
const LON = byId('lse');
const NYC = byId('nyse');
const TYO = byId('tse');
const HKG = byId('hkex');

describe('data', () => {
  it('ships six exchanges in rim order', () => {
    expect(EXCHANGES.map((e) => e.code)).toEqual(['SOF', 'FRA', 'LON', 'NYC', 'TYO', 'HKG']);
  });
  it('statusAll preserves order and length', () => {
    const all = statusAll(at('2026-09-08T10:00:00Z'));
    expect(all).toHaveLength(6);
    expect(all.map((s) => s.exchange.id)).toEqual(EXCHANGES.map((e) => e.id));
  });
  it('toMinutes parses HH:MM', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('17:30')).toBe(1050);
  });
});

describe('normal weekday (Tue 2026-09-08, EU summer time, US DST)', () => {
  it('Sofia open at 13:00 local, closes in 4h', () => {
    const s = getStatus(SOF, at('2026-09-08T10:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(13 * 60);
    expect(s.nextChangeKind).toBe('closes');
    expect(s.nextChangeIn).toBe(240);
  });
  it('Frankfurt open at 12:00 local, closes in 5h30', () => {
    const s = getStatus(FRA, at('2026-09-08T10:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(12 * 60);
    expect(s.nextChangeIn).toBe(330);
    expect(s.nextChangeKind).toBe('closes');
  });
  it('London open at 11:00 local, closes in 5h30', () => {
    const s = getStatus(LON, at('2026-09-08T10:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(11 * 60);
    expect(s.nextChangeIn).toBe(330);
  });
  it('New York open at 11:00 local, closes in 5h', () => {
    const s = getStatus(NYC, at('2026-09-08T15:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(11 * 60);
    expect(s.nextChangeIn).toBe(300);
    expect(s.nextChangeKind).toBe('closes');
  });
  it('Tokyo open in the morning session, closes for lunch in 1h30', () => {
    const s = getStatus(TYO, at('2026-09-08T01:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(10 * 60);
    expect(s.nextChangeIn).toBe(90);
    expect(s.nextChangeKind).toBe('closes');
  });
  it('Hong Kong open in the morning session, closes for lunch in 2h', () => {
    const s = getStatus(HKG, at('2026-09-08T02:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(10 * 60);
    expect(s.nextChangeIn).toBe(120);
  });
  it('a full day sweep never yields more than the six known exchanges open', () => {
    for (let h = 0; h < 24; h++) {
      const open = statusAll(at(`2026-09-08T${String(h).padStart(2, '0')}:15:00Z`)).filter((s) => s.state === 'open');
      expect(open.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('Saturday (2026-09-12)', () => {
  const now = at('2026-09-12T10:00:00Z');
  it('everything is closed', () => {
    for (const s of statusAll(now)) expect(s.state).toBe('closed');
  });
  it('next change is the Monday open, in real minutes', () => {
    // Sofia Mon 10:00 EEST = 07:00Z -> 45h
    expect(getStatus(SOF, now).nextChangeKind).toBe('opens');
    expect(getStatus(SOF, now).nextChangeIn).toBe(45 * 60);
    // Tokyo Mon 09:00 JST = Sun 00:00Z... i.e. 2026-09-14T00:00Z -> 38h
    expect(getStatus(TYO, now).nextChangeIn).toBe(38 * 60);
    // New York Mon 09:30 EDT = 13:30Z -> 51h30
    expect(getStatus(NYC, now).nextChangeIn).toBe(51 * 60 + 30);
  });
  it('Sunday also walks to Monday', () => {
    const sun = at('2026-09-13T10:00:00Z');
    expect(getStatus(LON, sun).state).toBe('closed');
    expect(getStatus(LON, sun).nextChangeIn).toBe(21 * 60); // Mon 08:00 BST = 07:00Z
  });
});

describe('lunch breaks', () => {
  it('Tokyo is at lunch at 12:00 local and resumes in 30m', () => {
    const s = getStatus(TYO, at('2026-09-09T03:00:00Z'));
    expect(s.state).toBe('lunch');
    expect(s.localMinutes).toBe(12 * 60);
    expect(s.nextChangeKind).toBe('resumes');
    expect(s.nextChangeIn).toBe(30);
  });
  it('Tokyo lunch starts exactly at 11:30 and ends exactly at 12:30', () => {
    expect(getStatus(TYO, at('2026-09-09T02:29:00Z')).state).toBe('open');
    const start = getStatus(TYO, at('2026-09-09T02:30:00Z'));
    expect(start.state).toBe('lunch');
    expect(start.nextChangeIn).toBe(60);
    const resume = getStatus(TYO, at('2026-09-09T03:30:00Z'));
    expect(resume.state).toBe('open');
    expect(resume.nextChangeKind).toBe('closes');
    expect(resume.nextChangeIn).toBe(180);
  });
  it('Hong Kong is at lunch at 12:30 local and resumes in 30m', () => {
    const s = getStatus(HKG, at('2026-09-09T04:30:00Z'));
    expect(s.state).toBe('lunch');
    expect(s.localMinutes).toBe(12 * 60 + 30);
    expect(s.nextChangeKind).toBe('resumes');
    expect(s.nextChangeIn).toBe(30);
  });
  it('after the afternoon session the next change is tomorrow\'s open', () => {
    const s = getStatus(HKG, at('2026-09-09T08:00:00Z')); // 16:00 HKT Wednesday
    expect(s.state).toBe('closed');
    expect(s.nextChangeKind).toBe('opens');
    expect(s.nextChangeIn).toBe(17 * 60 + 30); // Thu 09:30 HKT
  });
});

describe('pre-open', () => {
  it('Sofia is pre-open 15 minutes before the bell', () => {
    const s = getStatus(SOF, at('2026-09-09T06:45:00Z')); // 09:45 EEST
    expect(s.state).toBe('pre-open');
    expect(s.nextChangeKind).toBe('opens');
    expect(s.nextChangeIn).toBe(15);
  });
  it('the window is exactly 30 minutes', () => {
    expect(getStatus(SOF, at('2026-09-09T06:30:00Z')).state).toBe('pre-open'); // 09:30
    const before = getStatus(SOF, at('2026-09-09T06:29:00Z')); // 09:29
    expect(before.state).toBe('closed');
    expect(before.nextChangeKind).toBe('opens');
    expect(before.nextChangeIn).toBe(31);
  });
  it('pre-open never applies before the afternoon session', () => {
    expect(getStatus(TYO, at('2026-09-09T03:15:00Z')).state).toBe('lunch'); // 12:15 JST
  });
  it('the bell flips pre-open to open', () => {
    const s = getStatus(SOF, at('2026-09-09T07:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.nextChangeIn).toBe(7 * 60);
  });
});

describe('EU DST switch 2026-03-29 (CET -> CEST at 01:00Z)', () => {
  it('Saturday before the switch: Frankfurt reopens Monday 09:00 CEST, 43h later (not 44)', () => {
    const s = getStatus(FRA, at('2026-03-28T12:00:00Z'));
    expect(s.state).toBe('closed');
    expect(s.nextChangeKind).toBe('opens');
    expect(s.nextChangeIn).toBe(43 * 60);
  });
  it('Sunday of the switch: Frankfurt and Sofia open in 19h', () => {
    expect(getStatus(FRA, at('2026-03-29T12:00:00Z')).nextChangeIn).toBe(19 * 60);
    expect(getStatus(SOF, at('2026-03-29T12:00:00Z')).nextChangeIn).toBe(19 * 60);
  });
  it('Monday after the switch: Frankfurt pre-open at 06:59Z, open at 07:00Z', () => {
    const pre = getStatus(FRA, at('2026-03-30T06:59:00Z'));
    expect(pre.state).toBe('pre-open');
    expect(pre.nextChangeIn).toBe(1);
    const open = getStatus(FRA, at('2026-03-30T07:00:00Z'));
    expect(open.state).toBe('open');
    expect(open.localMinutes).toBe(9 * 60);
    expect(open.nextChangeIn).toBe(8 * 60 + 30);
  });
  it('offsets and angles move with the switch', () => {
    expect(utcOffsetMinutes('Europe/Sofia', at('2026-03-28T12:00:00Z'))).toBe(120);
    expect(utcAngle('Europe/Sofia', at('2026-03-28T12:00:00Z'))).toBe(30);
    expect(utcOffsetMinutes('Europe/Sofia', at('2026-03-29T12:00:00Z'))).toBe(180);
    expect(utcAngle('Europe/Sofia', at('2026-03-29T12:00:00Z'))).toBe(45);
    expect(utcOffsetMinutes('Europe/London', at('2026-03-29T00:30:00Z'))).toBe(0);
    expect(utcOffsetMinutes('Europe/London', at('2026-03-29T01:30:00Z'))).toBe(60);
  });
});

describe('EU DST switch day itself (Sun 2026-03-29)', () => {
  it('before the 01:00Z switch: Frankfurt opens Mon 09:00 CEST (07:00Z) in 30h30', () => {
    const s = getStatus(FRA, at('2026-03-29T00:30:00Z')); // 01:30 CET
    expect(s.state).toBe('closed');
    expect(s.localMinutes).toBe(90);
    expect(s.nextChangeKind).toBe('opens');
    expect(s.nextChangeIn).toBe(30 * 60 + 30);
  });
  it('before the switch London sits at +0, after it at +60', () => {
    expect(getStatus(LON, at('2026-03-29T00:30:00Z')).nextChangeIn).toBe(30 * 60 + 30); // Mon 08:00 BST = 07:00Z
    expect(getStatus(LON, at('2026-03-29T01:30:00Z')).nextChangeIn).toBe(29 * 60 + 30);
    expect(utcAngle('Europe/London', at('2026-03-29T00:30:00Z'))).toBe(0);
    expect(utcAngle('Europe/London', at('2026-03-29T01:30:00Z'))).toBe(15);
  });
  it('Tokyo is untouched by the European switch', () => {
    const s = getStatus(TYO, at('2026-03-29T00:30:00Z')); // Sun 09:30 JST
    expect(s.state).toBe('closed');
    expect(s.localMinutes).toBe(9 * 60 + 30);
    expect(s.nextChangeIn).toBe(23 * 60 + 30); // Mon 09:00 JST = 2026-03-30T00:00Z
    expect(utcOffsetMinutes('Asia/Tokyo', at('2026-03-29T00:30:00Z'))).toBe(540);
  });
});

describe('EU DST switch 2026-10-25 (CEST -> CET at 01:00Z)', () => {
  it('on the switch Sunday, before 01:00Z, all three European rims read summer time', () => {
    const now = at('2026-10-25T00:30:00Z');
    expect(getStatus(LON, now).localMinutes).toBe(90); // 01:30 BST
    expect(getStatus(SOF, now).localMinutes).toBe(3 * 60 + 30); // 03:30 EEST
    // Mon opens: LON 08:00 GMT, FRA 09:00 CET, SOF 10:00 EET — all 08:00Z on 10-26 -> 31h30
    for (const ex of [LON, FRA, SOF]) {
      const s = getStatus(ex, now);
      expect(s.state).toBe('closed');
      expect(s.nextChangeKind).toBe('opens');
      expect(s.nextChangeIn).toBe(31 * 60 + 30);
    }
  });
  it('on the switch Sunday, after 01:00Z, the walk is plain wall-clock again', () => {
    const now = at('2026-10-25T12:00:00Z'); // 12:00 GMT
    expect(getStatus(LON, now).localMinutes).toBe(12 * 60);
    expect(getStatus(LON, now).nextChangeIn).toBe(20 * 60);
    expect(utcOffsetMinutes('Europe/Sofia', now)).toBe(120);
    expect(utcAngle('Europe/Sofia', now)).toBe(30);
  });
  it('Friday close before the switch', () => {
    const open = getStatus(LON, at('2026-10-23T15:29:00Z')); // 16:29 BST
    expect(open.state).toBe('open');
    expect(open.nextChangeIn).toBe(1);
    const closed = getStatus(LON, at('2026-10-23T15:30:00Z'));
    expect(closed.state).toBe('closed');
    // Monday 08:00 GMT = 08:00Z on 10-26 -> 64h30 (a wall-clock walk would say 63h30)
    expect(closed.nextChangeIn).toBe(64 * 60 + 30);
  });
  it('Saturday before the switch: London reopens in 44h, not 43h', () => {
    expect(getStatus(LON, at('2026-10-24T12:00:00Z')).nextChangeIn).toBe(44 * 60);
  });
  it('Monday after the switch opens on GMT', () => {
    const s = getStatus(LON, at('2026-10-26T08:00:00Z'));
    expect(s.state).toBe('open');
    expect(s.localMinutes).toBe(8 * 60);
    expect(utcOffsetMinutes('Europe/London', at('2026-10-26T08:00:00Z'))).toBe(0);
    expect(utcAngle('Europe/London', at('2026-10-26T08:00:00Z'))).toBe(0);
  });
});

describe('US DST switch 2026-03-08 (EST -> EDT at 07:00Z)', () => {
  it('Friday close before the switch', () => {
    const open = getStatus(NYC, at('2026-03-06T20:00:00Z')); // 15:00 EST
    expect(open.state).toBe('open');
    expect(open.nextChangeIn).toBe(60);
    const closed = getStatus(NYC, at('2026-03-06T21:00:00Z')); // 16:00 EST
    expect(closed.state).toBe('closed');
    // Monday 09:30 EDT = 13:30Z on 03-09 -> 64h30
    expect(closed.nextChangeIn).toBe(64 * 60 + 30);
  });
  it('Saturday before the switch: New York reopens in 49h30 (not 50h30)', () => {
    const s = getStatus(NYC, at('2026-03-07T12:00:00Z'));
    expect(s.state).toBe('closed');
    expect(s.nextChangeIn).toBe(49 * 60 + 30);
  });
  it('the switch Sunday itself: midnight EST before, 08:00 EDT after; both reach Mon 13:30Z', () => {
    const before = getStatus(NYC, at('2026-03-08T05:00:00Z')); // Sun 00:00 EST
    expect(before.localMinutes).toBe(0);
    expect(before.nextChangeIn).toBe(32 * 60 + 30);
    expect(utcOffsetMinutes('America/New_York', at('2026-03-08T05:00:00Z'))).toBe(-300);
    const after = getStatus(NYC, at('2026-03-08T12:00:00Z')); // Sun 08:00 EDT
    expect(after.localMinutes).toBe(8 * 60);
    expect(after.nextChangeIn).toBe(25 * 60 + 30);
    expect(utcOffsetMinutes('America/New_York', at('2026-03-08T12:00:00Z'))).toBe(-240);
    expect(utcAngle('America/New_York', at('2026-03-08T12:00:00Z'))).toBe(300);
  });
  it('Monday after the switch opens on EDT', () => {
    const pre = getStatus(NYC, at('2026-03-09T13:00:00Z'));
    expect(pre.state).toBe('pre-open');
    expect(pre.nextChangeIn).toBe(30);
    const open = getStatus(NYC, at('2026-03-09T13:30:00Z'));
    expect(open.state).toBe('open');
    expect(open.localMinutes).toBe(9 * 60 + 30);
    expect(open.nextChangeIn).toBe(6 * 60 + 30);
  });
});

describe('US DST switch 2026-11-01 (EDT -> EST at 06:00Z)', () => {
  it('Saturday before the switch: New York reopens in 50h30 (not 49h30)', () => {
    const s = getStatus(NYC, at('2026-10-31T12:00:00Z'));
    expect(s.state).toBe('closed');
    expect(s.nextChangeIn).toBe(50 * 60 + 30);
  });
  it('the switch Sunday itself: 23:00 EDT Saturday before, 07:00 EST after; both reach Mon 14:30Z', () => {
    const before = getStatus(NYC, at('2026-11-01T03:00:00Z')); // Sat 23:00 EDT
    expect(before.localMinutes).toBe(23 * 60);
    expect(before.nextChangeIn).toBe(35 * 60 + 30);
    expect(utcAngle('America/New_York', at('2026-11-01T03:00:00Z'))).toBe(300);
    const after = getStatus(NYC, at('2026-11-01T12:00:00Z')); // Sun 07:00 EST
    expect(after.localMinutes).toBe(7 * 60);
    expect(after.nextChangeIn).toBe(26 * 60 + 30);
    expect(utcAngle('America/New_York', at('2026-11-01T12:00:00Z'))).toBe(285);
  });
  it('the Friday close before the switch: 16:00 EDT (20:00Z) -> Mon 09:30 EST (14:30Z) is 66h30', () => {
    const s = getStatus(NYC, at('2026-10-30T20:00:00Z'));
    expect(s.state).toBe('closed');
    expect(s.nextChangeKind).toBe('opens');
    expect(s.nextChangeIn).toBe(66 * 60 + 30);
  });
  it('Monday after the switch runs on EST', () => {
    const pre = getStatus(NYC, at('2026-11-02T14:00:00Z'));
    expect(pre.state).toBe('pre-open');
    expect(pre.nextChangeIn).toBe(30);
    const open = getStatus(NYC, at('2026-11-02T14:30:00Z'));
    expect(open.state).toBe('open');
    expect(open.localMinutes).toBe(9 * 60 + 30);
    expect(open.nextChangeIn).toBe(6 * 60 + 30);
    expect(utcOffsetMinutes('America/New_York', at('2026-11-02T14:30:00Z'))).toBe(-300);
    expect(utcAngle('America/New_York', at('2026-11-02T14:30:00Z'))).toBe(285);
  });
});

describe('midnight in every zone (h23: hour 24 never appears)', () => {
  const midnights: Record<string, string> = {
    'Europe/Sofia': '2026-09-08T21:00:00Z',
    'Europe/Berlin': '2026-09-08T22:00:00Z',
    'Europe/London': '2026-09-08T23:00:00Z',
    'America/New_York': '2026-09-09T04:00:00Z',
    'Asia/Tokyo': '2026-09-08T15:00:00Z',
    'Asia/Hong_Kong': '2026-09-08T16:00:00Z',
  };
  for (const ex of EXCHANGES) {
    it(`${ex.code} midnight reads 00:00 / minute 0`, () => {
      const now = at(midnights[ex.tz]);
      expect(zonedNow(ex.tz, now).minutes).toBe(0);
      expect(getStatus(ex, now).localMinutes).toBe(0);
      expect(localTime(ex.tz, now)).toBe('00:00');
    });
  }
  it('every hour of a day formats as 00..23', () => {
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const ex of EXCHANGES) {
      for (let h = 0; h < 48; h++) {
        const now = new Date(Date.UTC(2026, 8, 8, h, 0, 0));
        expect(localTime(ex.tz, now)).toMatch(re);
        expect(zonedNow(ex.tz, now).minutes).toBeLessThan(24 * 60);
        expect(getStatus(ex, now).localMinutes).toBeLessThan(24 * 60);
      }
    }
  });
  it('the minute just before midnight is 23:59', () => {
    expect(localTime('Europe/Sofia', at('2026-09-08T20:59:00Z'))).toBe('23:59');
    expect(zonedNow('Europe/Sofia', at('2026-09-08T20:59:00Z')).minutes).toBe(23 * 60 + 59);
  });
});

describe('utcAngle (degrees clockwise from 12 o\'clock on a 24h dial)', () => {
  it('Europe/Sofia in summer: +180 -> 45 deg', () => {
    const now = at('2026-07-01T12:00:00Z');
    expect(utcOffsetMinutes('Europe/Sofia', now)).toBe(180);
    expect(utcAngle('Europe/Sofia', now)).toBe(45);
  });
  it('America/New_York in summer: -240 -> 300 deg', () => {
    const now = at('2026-07-01T12:00:00Z');
    expect(utcOffsetMinutes('America/New_York', now)).toBe(-240);
    expect(utcAngle('America/New_York', now)).toBe(300);
  });
  it('Asia/Tokyo: +540 -> 135 deg; Asia/Hong_Kong: +480 -> 120 deg; UTC -> 0', () => {
    const now = at('2026-07-01T12:00:00Z');
    expect(utcAngle('Asia/Tokyo', now)).toBe(135);
    expect(utcAngle('Asia/Hong_Kong', now)).toBe(120);
    expect(utcAngle('UTC', now)).toBe(0);
  });
  it('is always within [0, 360)', () => {
    for (const ex of EXCHANGES) {
      const a = utcAngle(ex.tz, at('2026-01-15T12:00:00Z'));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    }
  });
});

describe('nextChange', () => {
  it('open -> closes', () => {
    expect(nextChange(SOF, at('2026-09-08T10:00:00Z'))).toEqual({ kind: 'closes', inMinutes: 240 });
  });
  it('lunch -> resumes', () => {
    expect(nextChange(TYO, at('2026-09-09T03:00:00Z'))).toEqual({ kind: 'resumes', inMinutes: 30 });
  });
  it('pre-open -> opens', () => {
    expect(nextChange(SOF, at('2026-09-09T06:45:00Z'))).toEqual({ kind: 'opens', inMinutes: 15 });
  });
  it('closed (same day, before the bell) -> opens', () => {
    expect(nextChange(NYC, at('2026-09-08T12:00:00Z'))).toEqual({ kind: 'opens', inMinutes: 90 });
  });
  it('closed (weekend) -> opens', () => {
    expect(nextChange(LON, at('2026-09-12T10:00:00Z'))).toEqual({ kind: 'opens', inMinutes: 45 * 60 });
  });
  it('mirrors getStatus for every exchange', () => {
    const now = at('2026-09-09T03:00:00Z');
    for (const ex of EXCHANGES) {
      const s = getStatus(ex, now);
      expect(nextChange(ex, now)).toEqual({ kind: s.nextChangeKind, inMinutes: s.nextChangeIn });
    }
  });
  it('returns null when an exchange never trades', () => {
    const ghost: Exchange = { ...SOF, id: 'ghost', code: 'GHO', days: [] };
    expect(nextChange(ghost, at('2026-09-08T10:00:00Z'))).toBeNull();
    const s = getStatus(ghost, at('2026-09-08T10:00:00Z'));
    expect(s.state).toBe('closed');
    expect(s.nextChangeIn).toBeNull();
    expect(s.nextChangeKind).toBeNull();
  });
  it('is always positive when known', () => {
    for (let h = 0; h < 24 * 7; h++) {
      const now = new Date(Date.UTC(2026, 8, 7, h, 7, 0));
      for (const ex of EXCHANGES) {
        const n = nextChange(ex, now);
        expect(n).not.toBeNull();
        expect(n!.inMinutes).toBeGreaterThan(0);
      }
    }
  });
});

describe('holidays (the `closed` list in exchanges.json)', () => {
  it('Christmas Day 2026: New York is closed and reopens Monday 28th', () => {
    const s = getStatus(NYC, at('2026-12-25T15:00:00Z')); // Fri 10:00 EST
    expect(s.state).toBe('closed');
    expect(s.nextChangeKind).toBe('opens');
    expect(s.nextChangeIn).toBe(3 * 24 * 60 - 30); // Mon 09:30 EST = 14:30Z
  });
  it('Boxing Day substitute 2026-12-28: London is closed and reopens Tuesday', () => {
    const s = getStatus(LON, at('2026-12-28T10:00:00Z'));
    expect(s.state).toBe('closed');
    expect(s.nextChangeIn).toBe(22 * 60); // Tue 08:00 GMT
  });
  it('Tokyo year end: closed on 31 December, reopens 4 January', () => {
    const s = getStatus(TYO, at('2026-12-31T01:00:00Z')); // Thu 10:00 JST
    expect(s.state).toBe('closed');
    expect(s.nextChangeIn).toBe(4 * 24 * 60 - 60); // Mon 2027-01-04 09:00 JST = 00:00Z
  });
  it('a plain weekday between holidays is untouched', () => {
    expect(getStatus(NYC, at('2026-12-23T15:00:00Z')).state).toBe('open');
    expect(getStatus(FRA, at('2026-12-23T10:00:00Z')).state).toBe('open');
  });
  it('every closed date is a weekday, well formed and sorted', () => {
    for (const ex of EXCHANGES) {
      const list = ex.closed ?? [];
      expect(list.length).toBeGreaterThan(0);
      expect([...list].sort()).toEqual(list);
      for (const d of list) {
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
        expect(dow).not.toBe(0);
        expect(dow).not.toBe(6);
      }
    }
  });
});
