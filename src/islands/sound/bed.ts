/**
 * The music bed — a recording, played under the page.
 *
 * This sits beside the synthesised cavity in Sound.tsx, and the toggle prefers
 * it when a file is actually present. It is a separate path rather than a
 * layer, for a reason that is musical and not architectural: the synth walks
 * the cavity ratios up A dorian, and Mozart's Lacrimosa is in D minor. A
 * dorian carries F♯ and B natural, D minor carries F natural and B♭. Played
 * together those are not two beds, they are a wrong note held for three
 * minutes. One or the other.
 *
 * Three things this deliberately does NOT do:
 *
 *   · NO REVERB. The synth generates a 2.6 s room because it has none of its
 *     own. A recording arrives with the hall it was recorded in already on it.
 *     Sending it through a second room is mud, not depth.
 *   · NO DECODING INTO MEMORY. decodeAudioData on a three-minute file is tens
 *     of megabytes of Float32 held for the whole session. A media element
 *     streams it and the graph taps the element instead.
 *   · NO PRELOAD. `preload="none"`, and the element is not even created until
 *     the visitor presses the control. Nobody downloads a requiem to read a
 *     page about private equity.
 */

/**
 * Which file the bed plays is resolved at BUILD time, in Base.astro, and
 * handed down as a prop. It is not probed here.
 *
 * The obvious alternative — HEAD each candidate extension on first click —
 * works, and puts a 404 in the console of every visitor whose file is not the
 * first candidate. A 404 on a live marketing site reads as a broken site even
 * when it is a deliberate miss. The filesystem already knows the answer at
 * build time, so it is answered there, and the runtime is handed a path or
 * null.
 */

/**
 * Playback level. THIS IS THE NUMBER TO TUNE. The synth's master is 0.105, but
 * that drives raw oscillators; a mastered recording peaks near full scale, so
 * the same figure here would be roughly ten times louder. 0.22 is about -13 dB
 * — present under the type, gone under a conversation.
 */
export const BED_MASTER = 0.22;

/** Fade in, and fade out, in seconds. Matched to the synth's own envelope so
 *  the two paths feel like one control. */
const FADE_IN = 1.6;
const FADE_OUT = 0.6;

export interface Bed {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  /** Fade down and release everything. Safe to call twice. */
  stop(): void;
}


/**
 * Build the bed and start it. Resolves to null when there is nothing to play,
 * which is the signal to fall back to the synth.
 *
 * Must be called from a user gesture: creating the context and calling play()
 * outside one is what autoplay policy exists to stop.
 */
export async function load(src: string | null): Promise<Bed | null> {
  if (!src) return null;

  const el = new Audio();
  el.src = src;
  el.loop = true;
  el.preload = 'none';
  // Same origin, so no CORS dance — but a tainted element would silently give
  // the analyser nothing but zeroes, and this says why it is not set.
  el.crossOrigin = null;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);

  // Gentle top roll-off. A bed sitting under text should not be fighting the
  // reader with cymbal-range detail it does not need.
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 4200;
  shelf.gain.value = -4;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;

  const source = ctx.createMediaElementSource(el);
  source.connect(shelf).connect(master).connect(analyser);
  analyser.connect(ctx.destination);

  await ctx.resume();
  try {
    await el.play();
  } catch {
    // Blocked or unplayable. Tear down rather than leaving a dead context and
    // a muted element behind, and let the caller fall back.
    try { ctx.close(); } catch { /* already closing */ }
    return null;
  }

  master.gain.setTargetAtTime(BED_MASTER, ctx.currentTime, FADE_IN / 3);

  let stopped = false;
  return {
    ctx,
    master,
    analyser,
    stop() {
      if (stopped) return;
      stopped = true;
      master.gain.setTargetAtTime(0, ctx.currentTime, FADE_OUT / 3);
      // Let the fade finish before the element and the context go, or the
      // release is a click rather than a decay.
      window.setTimeout(() => {
        el.pause();
        el.src = '';
        try { ctx.close(); } catch { /* already closed */ }
      }, FADE_OUT * 1000 + 400);
    },
  };
}

/**
 * Four bars, from what is actually coming out.
 *
 * The synth path draws these from the solver's modal envelopes. There are no
 * modes in a recording, so they are drawn from four bands of the spectrum
 * instead — the control still shows the sound it is making, which is the only
 * property of those bars that matters.
 */
export function levels(analyser: AnalyserNode, out: number[]): void {
  const bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  const band = Math.max(1, Math.floor(bins.length / out.length));
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    for (let j = i * band; j < (i + 1) * band && j < bins.length; j += 1) sum += bins[j];
    out[i] = sum / band / 255;
  }
}
