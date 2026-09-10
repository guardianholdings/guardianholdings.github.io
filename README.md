# guardianholdingsjsc.com

The Guardian Holdings JSC site: one page, scroll-only, built with Astro and
deployed to GitHub Pages by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

```bash
pnpm install
pnpm dev      # http://localhost:4321
pnpm test     # unit tests for the resonance solver and the exchange clocks
pnpm check    # astro check
pnpm build    # static output in dist/
```

## Copy

Every string on the site lives in [`src/data/content.ts`](src/data/content.ts).
Its header states the three rules that govern edits; the comments through the
file record why individual lines read the way they do. Change copy there, not
in components.

Counts written into prose are **not** derived from the data. "4 strategies" and
"12 cells" appear in several strings each, and nothing fails if one is missed —
grep before changing a number.

## Background music

The sound control plays a recording when one is present, and the synthesised
cavity when it is not. Drop the file in as:

```
public/audio/lacrimosa.mp3      # or .m4a, or .ogg
```

`.ogg` is listed last because Safari cannot play it. Which file shipped is
resolved at build time in [`src/layouts/Base.astro`](src/layouts/Base.astro),
so nothing is probed from the browser and no deliberate miss reaches a
visitor's console. Remove the file and the site returns to the synth exactly as
before — that is the supported empty state, not a broken one.

Nothing is downloaded until someone presses the control (`preload="none"`), so
a visitor who never asks for sound never pays for the file.

Playback level is `BED_MASTER` in [`src/islands/sound/bed.ts`](src/islands/sound/bed.ts).
It is the one number to tune, and it is not the synth's `MASTER`: that figure
drives raw oscillators, where a mastered recording arrives near full scale.

The two beds do not layer, and that is musical rather than technical. The synth
walks the cavity ratios up A dorian; Lacrimosa is in D minor. A dorian carries
F♯ and B natural, D minor carries F natural and B♭.

### Licensing

**Mozart's score is public domain. Recordings of it are not.** He died in 1791,
so the composition is free to use, but every performance carries its own
copyright — the performers' and the producer's, generally 70 years from
publication in the EU. Taking an arbitrary recording from the web and shipping
it on a company site is an infringement, whatever the age of the music.

Use a recording that is explicitly free: Musopen publishes public-domain and
CC0 classical recordings, and there are Creative Commons uploads on Wikimedia
Commons and IMSLP. Check the licence on the individual recording, not on the
work, and keep a note of where it came from and under what terms.

## Contact form

The form posts JSON to a Cloudflare Worker, which relays the enquiry by email.
Two build-time variables configure it, both public by design (see
[`.env.example`](.env.example)):

| Variable | Effect when empty |
| --- | --- |
| `PUBLIC_CONTACT_ENDPOINT` | The form falls back to opening a prepared mail draft. |
| `PUBLIC_TURNSTILE_SITE_KEY` | No bot check is rendered. |

The subject line and the signature block under the em-dash are a contract: they
are parsed back into structured enquiries downstream. Change the shape in one
place and it must change in the other.
