/**
 * The audio bed — the cavity, heard.
 *
 * There is no second sound design here. The synth is a readout of the same six
 * modal oscillators that resonance.ts is integrating and the field is drawing:
 * partial n is mode n, at n·f₀, and its gain is that mode's instantaneous
 * envelope √(qₙ² + (q̇ₙ/ωₙ)²). Three antinodes visible on screen is the third
 * harmonic loud in your ears, because it is the same number arriving in two
 * places.
 *
 * f₀ is 110 Hz here where the field's is 0.55 Hz. Nothing is faked by that: the
 * ratios between partials, their relative amplitudes and their decay envelopes
 * are the ones the solver produced. It is the same instrument at an audible
 * scale — see the note in resonance.ts.
 *
 * ── Why it sounds the way it does ───────────────────────────────────────────
 * A harmonic series IS a major chord — 1, 8ve, 8ve+5th, 2×8ve, 2×8ve+M3,
 * 2×8ve+5th — and the cavity ratios in resonance.ts walk that chord up the
 * degrees of A dorian, arriving an octave above where it started. The pitches
 * were never the problem. Four things are doing the work of making it warm
 * rather than clinical, and each is something a real resonator does:
 *
 *   · UNISON. Two extra strings a few cents off the root and the octave. Every
 *     piano, harp and twelve-string is built this way, and the slow beat it
 *     produces — about one swell every three seconds here — is most of what
 *     separates "warm" from "organ".
 *   · A ROOM. A generated impulse response, dark and 2.6 s long. A cavity you
 *     can hear the size of is an instrument; one with no space around it is a
 *     test tone.
 *   · A RADIATION CURVE. A real soundboard is a poor radiator at its own
 *     fundamental and best two partials up, so the root, the octave and the
 *     fifth come out level and the top rolls off hard. That is an open chord
 *     rather than a bass note with fur on it — see RADIATION.
 *   · AN OPENING FILTER. The bed starts muffled and opens with SNR, so the
 *     resolve you are watching is one you can also hear.
 *
 * What is deliberately NOT here any more is the resonant peak that used to
 * track the dominant mode with a Q of 17 and +13 dB of gain. It was true to the
 * physics — a resonator does colour its own noise — and it was a scream.
 *
 * ── Two beds, one control ───────────────────────────────────────────────────
 * The toggle prefers a recording when one is present (see bed.ts) and plays
 * the cavity above when it is not. They do not layer: the reason is in bed.ts
 * and it is a key clash, not a preference. Everything below — the modal
 * automation, the act-boundary strike — belongs to the synth path only, and is
 * gated accordingly. The synth is still the default and still the fallback, so
 * removing the audio file restores this file's original behaviour exactly.
 *
 * Off by default and gated behind a real click, both because autoplay policy
 * requires a gesture and because a site that starts making noise on its own is
 * closed immediately.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { bus } from '../../lib/bus';
import { getSnr } from '../../scripts/snr';
import { MODES, getResonance, pluck } from '../../scripts/resonance';
import { motionAllowed } from '../../lib/motion-policy';
import { load as loadBed, levels, BED_MASTER, type Bed } from './bed';

const MASTER = 0.105;

/** Audible fundamental at cavity ratio 1. A2. */
const F0_AUDIO = 110;
/**
 * Radiation curve — how much of each mode actually leaves the instrument.
 *
 * It is not a monotonic tilt, and that is not a liberty. A real soundboard
 * radiates its fundamental POORLY: the plate is small compared to a 110 Hz
 * wavelength, so it loses the bottom and radiates the second and third partials
 * best. Every piano ever measured looks like this. Musically it is also the
 * only voicing that works — root, octave and fifth level with each other is an
 * open chord you can hear as a chord, where a monotonic roll-off is a bass note
 * with some fur on it. Modes 4 upward are shimmer; at full weight they turn the
 * cavity into a reed organ.
 */
const RADIATION = [0.85, 1, 1, 0.4, 0.2, 0.1] as const;
/** Unison detune, cents. 6 cents at 110 Hz beats about once every 2.6 s — felt
 *  as breathing rather than heard as an interference. */
const DETUNE = 6;
/** Parameter update rate. Fast enough to track an envelope, slow enough that
 *  it is nowhere near the audio thread's problem. */
const UPDATE_HZ = 30;
/** Envelope follow, seconds. This is the sound's articulation, so it cannot be
 *  slow; but at 0.035 the solver's own jitter came through as a burble. */
const FOLLOW = 0.11;
/** Reverb length, seconds, and how much of the bed goes through it. */
const IR_SECONDS = 2.6;
const WET = 0.38;
/** One-pole coefficient darkening the tail. Below this the room turns to hiss;
 *  above it, to mud. */
const IR_DAMP = 0.45;

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  send: GainNode;
  airGain: GainNode;
  airFilter: BiquadFilterNode;
  toneGain: GainNode;
  toneFilter: BiquadFilterNode;
  partials: Array<{ osc: OscillatorNode; gain: GainNode }>;
  unison: Array<{ osc: OscillatorNode; gain: GainNode; mode: number }>;
  stop(): void;
}

/**
 * A room, generated rather than downloaded. Dark noise — white through a
 * one-pole, because a bright tail on a bed this quiet reads as hiss — under an
 * exponential decay, with the two channels run separately so the tail is
 * genuinely stereo and not a mono blur sitting between the speakers.
 */
function impulseResponse(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const pre = Math.floor(rate * 0.018);
  const len = Math.floor(rate * IR_SECONDS);
  const buffer = ctx.createBuffer(2, pre + len, rate);
  for (let c = 0; c < 2; c += 1) {
    const ch = buffer.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i += 1) {
      lp += IR_DAMP * (Math.random() * 2 - 1 - lp);
      const t = i / len;
      ch[pre + i] = lp * (1 - t) ** 2.4;
    }
  }
  return buffer;
}

function buildGraph(): Graph {
  const ctx = new AudioContext();

  const master = ctx.createGain();
  master.gain.value = 0;

  // Six partials, two unison strings and an air bed can sum past unity on a
  // hard transient. The gains below are normalised to prevent it, and this is
  // the belt to that pair of braces — a limiter, not a colour, so it is set
  // gently enough that nothing here ever actually reaches it.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.008;
  limiter.release.value = 0.35;
  master.connect(limiter).connect(ctx.destination);

  /* ── the room ───────────────────────────────────────────────────────────
     Everything feeds `send`; `send` is the only thing feeding the convolver.
     A transient added later (the act bloom) joins the same room by connecting
     to the same node, which is why it exists as a bus and not as a tap. */
  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = WET;
  const send = ctx.createGain();
  send.gain.value = 1;
  send.connect(master);
  send.connect(convolver).connect(wet).connect(master);

  /* ── air ────────────────────────────────────────────────────────────────
     Two seconds of white noise, looped. Long enough that the loop point is
     inaudible, short enough to be cheap to generate. Loudest at the noise
     floor, all but gone once the page resolves. */
  const frames = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const airFilter = ctx.createBiquadFilter();
  airFilter.type = 'lowpass';
  airFilter.frequency.value = 240;
  airFilter.Q.value = 0.4;

  const airGain = ctx.createGain();
  airGain.gain.value = 0.2;

  noise.connect(airFilter).connect(airGain).connect(send);

  /* ── cavity ─────────────────────────────────────────────────────────────
     The tone bus opens with SNR: muffled at the noise floor, open once the
     site has resolved. Q under 1 so it is a veil lifting, not a sweep. */
  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 520;
  toneFilter.Q.value = 0.7;

  const toneGain = ctx.createGain();
  toneGain.gain.value = 0;
  toneGain.connect(toneFilter).connect(send);

  const partials = Array.from({ length: MODES }, (_, n) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = F0_AUDIO * (n + 1);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(toneGain);
    osc.start();
    return { osc, gain };
  });

  // The unison strings: one on the root, one on the octave, each riding its
  // own partial's envelope at half weight so they can never be heard as
  // separate notes — only as the width they give the two that matter.
  const unison = [0, 1].map((mode, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = F0_AUDIO * (mode + 1);
    osc.detune.value = i === 0 ? DETUNE : -DETUNE;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(toneGain);
    osc.start();
    return { osc, gain, mode };
  });

  noise.start();

  return {
    ctx,
    master,
    send,
    airGain,
    airFilter,
    toneGain,
    toneFilter,
    partials,
    unison,
    stop() {
      try {
        noise.stop();
        partials.forEach((p) => p.osc.stop());
        unison.forEach((u) => u.osc.stop());
      } catch {
        /* already stopped */
      }
      void ctx.close();
    },
  };
}

export interface SoundProps {
  /** Every shipped encoding of the recording, resolved at build time in
   *  Base.astro, in preference order. Empty means no recording shipped and the
   *  control plays the synthesised cavity instead. */
  bedSources?: readonly string[];
}

const NO_BED: readonly string[] = [];

export default function Sound({ bedSources = NO_BED }: SoundProps) {
  const [on, setOn] = useState(false);
  /** True when the recording is what is playing. Gates every synth-only effect. */
  const [music, setMusic] = useState(false);
  const graph = useRef<Graph | null>(null);
  const bed = useRef<Bed | null>(null);
  /** A second click while the recording is still opening would start a second
      one. The first press owns the toggle until it has finished. */
  const busy = useRef(false);
  const barsRef = useRef<HTMLSpanElement | null>(null);

  /* The session's choice used to be kept in sessionStorage — but the only
     thing it was ever used for was a third button label ("Resume sound"), and
     one control now carries one label. Restoring "on" could never start the
     audio anyway: that needs a gesture. Nothing reads the value, so nothing
     writes it. */

  const teardown = useCallback(() => {
    graph.current?.stop();
    graph.current = null;
    bed.current?.stop();
    bed.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  /* ── parameter automation (synth path only) ───────────────────────────── */
  useEffect(() => {
    if (!on || music) return;

    let frame = 0;
    let last = 0;
    const weights = new Float32Array(MODES);
    const bars = barsRef.current
      ? Array.from(barsRef.current.querySelectorAll('i'))
      : [];

    const apply = () => {
      const g = graph.current;
      if (!g) return;

      const res = getResonance();
      const snr = getSnr();
      const t = g.ctx.currentTime;
      const f0 = F0_AUDIO * res.cavity;

      // setTargetAtTime, not .value: writing a parameter straight from the
      // scroll thread is what produces zipper noise on a filter sweep.
      g.airFilter.frequency.setTargetAtTime(220 + snr * 1200, t, 0.2);
      g.airGain.gain.setTargetAtTime(0.2 * (1 - snr) + 0.03, t, 0.25);

      // The tone emerges with SNR and brightens where the drive locks onto a
      // mode — the same `lock` the vignette blooms on, so the screen warms and
      // the bed opens at the same instant.
      g.toneGain.gain.setTargetAtTime(0.5 * snr, t, 0.25);
      g.toneFilter.frequency.setTargetAtTime(520 + snr * 2600 + res.lock * 500, t, 0.3);

      // Normalise the partial set rather than clamping each one: the sum is
      // bounded, and the SPECTRUM the solver produced survives intact.
      let total = 0;
      for (let n = 0; n < MODES; n += 1) {
        weights[n] = res.env[n] * RADIATION[n];
        total += weights[n];
      }
      const norm = total > 1 ? 1 / total : 1;

      for (let n = 0; n < MODES; n += 1) {
        const p = g.partials[n];
        p.osc.frequency.setTargetAtTime(f0 * (n + 1), t, 0.2);
        p.gain.gain.setTargetAtTime(weights[n] * norm, t, FOLLOW);
      }
      for (const u of g.unison) {
        u.osc.frequency.setTargetAtTime(f0 * (u.mode + 1), t, 0.2);
        u.gain.gain.setTargetAtTime(weights[u.mode] * norm * 0.5, t, FOLLOW);
      }

      // The toggle's four bars, showing the four lowest partials it is playing.
      if (bars.length) {
        let max = 1e-4;
        for (let n = 0; n < bars.length; n += 1) max = Math.max(max, res.env[n]);
        for (let n = 0; n < bars.length; n += 1) {
          bars[n].style.height = `${(2 + (res.env[n] / max) * 8).toFixed(1)}px`;
        }
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / UPDATE_HZ) return;
      last = now;
      apply();
    };

    apply();
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      // Hand the bars back to their resting height, or they freeze mid-reading.
      bars.forEach((b) => { b.style.height = ''; });
    };
  }, [on]);

  /* ── act boundary (synth path only) ───────────────────────────────────── */
  useEffect(() => {
    if (!on || music) return;
    return bus.on('act', () => {
      const g = graph.current;
      if (!g) return;
      // Strike the cavity for real: the swell that follows is the six modes
      // ringing down, not a sample played over the top of them.
      pluck(2.0);

      // The physics gives the tail; this gives the arrival. An open fifth two
      // octaves up — the octave and the twelfth, both already in the series, so
      // it lands inside the chord rather than on top of it — with a ninety
      // millisecond attack and a two-and-a-half second release. The old
      // transient swept a triangle down from f₀·8 in six milliseconds, which is
      // a doorbell, and at a station boundary every ninety seconds a doorbell
      // is the thing you close the tab over.
      const t = g.ctx.currentTime;
      const f0 = F0_AUDIO * getResonance().cavity;
      [
        { ratio: 2, peak: 0.055 },
        { ratio: 3, peak: 0.032 },
      ].forEach(({ ratio, peak }) => {
        const osc = g.ctx.createOscillator();
        const env = g.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * ratio, t);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(peak, t + 0.09);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        osc.connect(env).connect(g.send);
        osc.start(t);
        osc.stop(t + 2.5);
      });
    });
  }, [on]);

  /* ── the four bars, music path ────────────────────────────────────────── */
  useEffect(() => {
    if (!on || !music) return;
    const bars = barsRef.current ? Array.from(barsRef.current.querySelectorAll('i')) : [];
    if (!bars.length) return;

    const out = new Array<number>(bars.length).fill(0);
    let frame = 0;
    let last = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / UPDATE_HZ) return;
      last = now;
      const b = bed.current;
      if (!b) return;
      levels(b.analyser, out);
      // Absolute level, not normalised against the loudest band this frame:
      // dividing by the frame max pins one bar at full height forever and
      // makes the other three a ratio to it, which reads as a stuck meter.
      for (let n = 0; n < bars.length; n += 1) {
        bars[n].style.height = `${(2 + Math.min(1, out[n]) * 8).toFixed(1)}px`;
      }
    };

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      bars.forEach((b) => { b.style.height = ''; });
    };
  }, [on, music]);

  /* ── pause when the tab is hidden ─────────────────────────────────────── */
  useEffect(() => {
    if (!on) return;
    const onVisibility = () => {
      const b = bed.current;
      if (b) {
        b.master.gain.setTargetAtTime(document.hidden ? 0 : BED_MASTER, b.ctx.currentTime, 0.25);
        return;
      }
      const g = graph.current;
      if (!g) return;
      const t = g.ctx.currentTime;
      g.master.gain.setTargetAtTime(document.hidden ? 0 : MASTER, t, 0.25);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [on]);

  const toggle = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (on) {
        const b = bed.current;
        if (b) {
          // The bed fades and releases itself; it owns its own timing.
          b.stop();
          bed.current = null;
        }
        const g = graph.current;
        if (g) {
          // Fade out before tearing down, or the cut is a click. Long enough
          // for the room to fall away with it rather than being sliced off.
          g.master.gain.setTargetAtTime(0, g.ctx.currentTime, 0.3);
          window.setTimeout(teardown, 1200);
        }
        setOn(false);
        setMusic(false);
        bus.emit('sound:toggle', false);
        return;
      }

      // Prefer the recording. A missing or unplayable file resolves to null,
      // and the cavity below is the fallback — so the control always sounds.
      const next = await loadBed(bedSources);
      if (next) {
        bed.current = next;
        setMusic(true);
        setOn(true);
        bus.emit('sound:toggle', true);
        return;
      }

      graph.current = buildGraph();
      const g = graph.current;
      void g.ctx.resume();
      g.master.gain.setTargetAtTime(MASTER, g.ctx.currentTime, 0.9);
      // Open on a struck cavity rather than on silence.
      pluck(1.6);
      setMusic(false);
      setOn(true);
      bus.emit('sound:toggle', true);
    } finally {
      busy.current = false;
    }
  }, [on, teardown, bedSources]);

  // Reduced motion is also a reduced-stimulus preference; do not offer it.
  if (typeof window !== 'undefined' && !motionAllowed()) return null;

  return (
    <button
      type="button"
      className="sound gh-reground"
      onClick={() => void toggle()}
      aria-pressed={on}
      data-cursor-label={on ? 'Mute' : 'Listen'}
    >
      <span className="sound__bars" ref={barsRef} aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      {/* One control, one label. State is already carried three other ways —
          aria-pressed, the live bars, and the cursor label. */}
      Sound
    </button>
  );
}
