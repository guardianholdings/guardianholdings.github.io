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
