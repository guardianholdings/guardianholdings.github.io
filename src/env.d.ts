/// <reference types="astro/client" />

/**
 * Build-time configuration. Both are PUBLIC_ and therefore land in the shipped
 * bundle — that is correct for what they are. The endpoint is public by
 * definition, and a Turnstile site key is meant to be read by the page. The
 * secret halves (Resend key, Turnstile secret) live only in the Worker.
 */
interface ImportMetaEnv {
  /** Contact Worker URL. Empty means the form falls back to a mail draft. */
  readonly PUBLIC_CONTACT_ENDPOINT?: string;
  /** Cloudflare Turnstile site key. Empty means no bot check is rendered. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
