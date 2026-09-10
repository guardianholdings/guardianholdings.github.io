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
  /** Owned by the CALLER, not by the bed. See load(). */
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  /** Fade down and release the element. Safe to call twice. Does NOT close the
   *  context: the caller created it inside the click and closes it on teardown. */
  stop(): void;
}


/**
 * Build the bed and start it. Resolves to null when there is nothing to play,
 * which is the signal to fall back to the synth.
 *
 * Must be called from a user gesture: creating the context and calling play()
 * outside one is what autoplay policy exists to stop.
 */
/**
 * MIME types for the encodings the build may have shipped, so the browser can
 * be asked what it can decode before anything is fetched. Safari plays no Ogg;
 * some Firefox builds ship without an AAC decoder. Asking is two lines and
 * saves a download that would end in silence.
 */
const MIME: Record<string, string> = {
  '.m4a': 'audio/mp4; codecs="mp4a.40.2"',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg; codecs="vorbis"',
};

/** First source this browser claims it can play. */
function playable(sources: readonly string[], el: HTMLAudioElement): string | null {
  for (const src of sources) {
    const type = MIME[src.slice(src.lastIndexOf('.'))];
    // canPlayType returns '', 'maybe' or 'probably'; only '' is a no.
    if (!type || el.canPlayType(type)) return src;
  }
  // Nothing claimed, but a claim is not a guarantee in either direction. Try
  // the first anyway: a failure here falls back to the synth, same as silence.
  return sources[0] ?? null;
}

/**
 * ── THE GESTURE RULE — READ BEFORE EDITING ─────────────────────────────────
 * Everything from the top of this function down to `el.play()` MUST stay
 * synchronous, and `ctx` must have been constructed synchronously inside the
 * click too — which is why it is a parameter and not built here.
 *
 * WebKit gates media on the gesture *currently being dispatched*: a
 * stack-scoped indicator that is gone the moment the listener's task returns.
 * Chromium gates on STICKY user activation instead — once you have clicked
 * anywhere, a play() from any later microtask is allowed. Code written against
 * Chromium therefore appears to work everywhere and is silently dead on iOS,
 * which is exactly what happened here: this used to `await ctx.resume()` first,
 * so play() landed a task later and WebKit rejected it. The recording failed,
 * the synth fallback was then also built outside the gesture and could not
 * start either, and an iPhone got a button that lit up and played nothing.
 *
 * So: no `await` above the play() call. Not one.
 */
export async function load(sources: readonly string[], ctx: AudioContext): Promise<Bed | null> {
  if (!sources.length) return null;

  const el = new Audio();
  const src = playable(sources, el);
  if (!src) return null;
  el.src = src;
  el.loop = true;
  // 'auto', not 'none'. On iOS the media LOAD is gesture-gated as well as the
  // playback, so with preload='none' the fetch has not even started when
  // play() is called and the single gesture has to buy both.
  el.preload = 'auto';
  // Same origin, so no CORS dance — but a tainted element would silently give
  // the analyser nothing but zeroes, and this says why it is not set.
  el.crossOrigin = null;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);

  // Gentle top roll-off. A bed sitting under text should not be fighting the
  // reader with cymbal-range detail it does not need.
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 4200;
  shelf.gain.value = -4;

  const analyser = ctx.createAnalyser();
  // 1024 gives 43 Hz bins. At 256 the lowest band was a bin and a half wide,
  // which is not enough resolution to see a piano's left hand at all.
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;

  const source = ctx.createMediaElementSource(el);
  source.connect(shelf).connect(master).connect(ctx.destination);
  // The analyser is a TAP taken before the master gain, and is deliberately
  // not connected onward — a node with no output still analyses. Reading after
  // the gain would make the meter a readout of the volume setting rather than
  // of the music, and it would flatten as the bed fades.
  shelf.connect(analyser);

  // ── the last synchronous statements, and the order matters ──────────────
  // Both calls are made while the gesture is still on the stack. resume() is
  // deliberately NOT awaited: its promise only settles once the audio thread
  // has acknowledged the state change, which is a whole task later, and
  // awaiting it here is precisely the bug described above.
  let playing: Promise<void>;
  try {
    playing = el.play();
  } catch {
    // Some WebKit builds throw synchronously rather than rejecting.
    el.src = '';
    return null;
  }
  void ctx.resume();

  try {
    await playing;
  } catch {
    // Blocked or unplayable. Release the element and let the caller fall back
    // to the synth. The context is the caller's and is left alone — it was
    // created in the gesture and is the fallback's only chance of starting.
    el.pause();
    el.src = '';
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

  // Log-spaced bands, not equal slices of the spectrum. Splitting 0–22 kHz
  // into four equal parts puts every note a piano plays inside the first one
  // and leaves the other three reading zero for the whole piece — which is
  // what the first version of this did, and it looked like a frozen meter.
  const nyquist = analyser.context.sampleRate / 2;
  const perBin = bins.length / nyquist;
  // 40 Hz to 8 kHz, not to Nyquist. A piano's fundamentals stop at 4186 Hz and
  // a lossy encode has little left above 8 k, so a band reaching to 16 k is a
  // bar that never moves — which reads as a broken meter, not as quiet.
  const LOW = 40;
  const HIGH = 8000;

  for (let i = 0; i < out.length; i += 1) {
    const lo = LOW * (HIGH / LOW) ** (i / out.length);
    const hi = LOW * (HIGH / LOW) ** ((i + 1) / out.length);
    const from = Math.max(1, Math.floor(lo * perBin));
    const to = Math.max(from + 1, Math.min(bins.length, Math.ceil(hi * perBin)));

    let sum = 0;
    for (let j = from; j < to; j += 1) sum += bins[j];
    // The top bands of a lossy encode are genuinely near-empty, so a fixed
    // tilt lifts them into the same visual range rather than pinning them low.
    const tilt = 1 + i * 0.5;
    out[i] = Math.min(1, (sum / (to - from) / 255) * tilt);
  }
}
