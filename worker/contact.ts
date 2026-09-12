/**
 * The contact endpoint, at /api/contact on the site's own origin.
 *
 * It lived in a separate Worker (repo root `worker/`) that was written but
 * never deployed, so the form has only ever opened a mail draft. Now that the
 * site itself runs a Worker — added for the /audio/* range shim — the endpoint
 * belongs here: same origin, so there is no CORS preflight, no ALLOWED_ORIGINS
 * list to keep in step with the domains, and one deploy instead of two.
 *
 * TWO MAILS GO OUT PER SUBMISSION:
 *   1. the enquiry, to CONTACT_TO, with the visitor as Reply-To;
 *   2. an acknowledgement, to the visitor, with CONTACT_TO as Reply-To.
 * The second is what FORM.sent has always promised — "Sent. A reply comes to
 * the address you gave." — and until now nothing delivered it.
 *
 * THE ENQUIRY FORMAT IS A CONTRACT. `admin/src/lib/enquiries.ts` parses it back
 * by splitting on the em-dash line:
 *   subject: `Investor · ${name}` | `Founder · ${name}`
 *   body:    `${message}\n\n—\n${name}\n${email}\n${role}`
 * It is unchanged here on purpose. Change it and the admin inbox stops reading
 * its own mail; the two move together or not at all.
 */

export interface ContactEnv {
  /** `wrangler secret put RESEND_API_KEY`. Unset is a supported state — see below. */
  RESEND_API_KEY?: string;
  /** `wrangler secret put TURNSTILE_SECRET`. Unset skips the bot check. */
  TURNSTILE_SECRET?: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
  /** Cloudflare rate-limit binding, keyed by IP. */
  CONTACT_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

const LIMITS = { name: 120, email: 200, message: 5000 } as const;
/** A form filled faster than this was not filled by a person. */
const MIN_FILL_MS = 2_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The address the site publishes (COMPANY.email in src/data/content.ts).
    CONTACT_TO is where the enquiry is delivered and is nobody's business but
    the desk's; every string a visitor sees names this one instead. */
const PUBLISHED_ADDRESS = 'office@guardianholdingsjsc.com';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * The no-JavaScript path.
 *
 * The form carries `method="post" action="/api/contact"`, which is what stops
 * it defaulting to GET and writing the visitor's message into a URL. But a
 * plain POST from a browser with no script running lands here expecting a
 * PAGE, and answering it with raw JSON would trade a privacy bug for a broken
 * one. So a form-encoded submission gets a real page, and the form works
 * without JavaScript at all.
 *
 * Nothing the visitor typed is echoed back, which is why there is no escaping
 * here to get wrong.
 */
const page = (heading: string, body: string, status: number) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} — Guardian Holdings JSC</title>
<meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100svh;display:grid;align-content:center;justify-items:start;
gap:20px;max-width:56ch;padding:32px;background:#0a0907;color:#ede8de;
font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:1.5rem;font-weight:500;letter-spacing:-0.02em;margin:0}
p{margin:0;color:#9a9287}
a{color:#e8503f;text-decoration:underline;text-underline-offset:5px;
display:inline-block;padding-block:11px}
</style></head><body>
<h1>${heading}</h1>
<p>${body}</p>
<p><a href="/">Home &rarr;</a></p>
</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

/** Verify a Turnstile token. True when no secret is configured. */
async function passesTurnstile(env: ContactEnv, token: unknown, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

interface Mail {
  from: string;
  to: string[];
  reply_to: string[];
  subject: string;
  text: string;
}

async function send(key: string, mail: Mail): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(mail),
    });
    if (res.ok) return true;
    // Logged for `wrangler tail`, never returned: it can carry account detail
    // and the visitor can act on none of it.
    console.error('resend', res.status, await res.text().catch(() => ''));
    return false;
  } catch (err) {
    console.error('resend threw', String(err));
    return false;
  }
}

/**
 * The acknowledgement.
 *
 * Deliberately NOT "we will reach out soon". The copy deck retired every
 * timeframe promise on this property — it called the old "We'll be in touch
 * within 24 hours" the promise most likely to be broken — and it bans future
 * tense about Guardian, because "we will" is a promise where the present tense
 * is a description of how the firm actually works. These three sentences are
 * the deck's own approved "what happens next" strings, which say something
 * stronger than a deadline: a person reads it, and the answer is written and
 * reasoned either way.
 */
function acknowledgement(name: string, message: string, to: string): string {
  return `${name},

Thank you — your message reached us.

Every message is read by a principal, not a mailbox. It lands on the desk that
does the work itself, and the reply comes from there.

You can reply to this email directly; it reaches the same desk.

This is what you sent:

${message}

—
Guardian Holdings JSC
Simeonovsko Shose 33, fl. 3, Sofia, Bulgaria
${to}
https://guardianholdingsjsc.com`;
}

export async function handleContact(request: Request, env: ContactEnv): Promise<Response> {
  // A health check, so a deploy can be verified without sending mail. It
  // names no address: this URL is public, and CONTACT_TO is a mailbox the
  // site itself does not print.
  if (request.method === 'GET') {
    return json(
      {
        ok: true,
        service: 'guardian-contact',
        configured: Boolean(env.RESEND_API_KEY),
        botCheck: Boolean(env.TURNSTILE_SECRET),
        rateLimited: typeof env.CONTACT_LIMIT?.limit === 'function',
        hasIp: Boolean(request.headers.get('cf-connecting-ip')),
      },
      200,
    );
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);


  // Same-origin only. The endpoint now shares the site's origin, so this is an
  // exact match rather than an allow-list that has to track every domain.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: 'Origin not allowed.' }, 403);
  }

  /* A form-encoded body means the browser submitted the <form> itself, with no
     script running. Everything below answers in whichever shape the caller
     can actually use. */
  const contentType = request.headers.get('content-type') ?? '';
  const asPage =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  const fail = (message: string, status: number, heading = 'That did not send.') =>
    asPage ? page(heading, message, status) : json({ ok: false, error: message }, status);

  let data: Record<string, unknown>;
  try {
    data = asPage
      ? (Object.fromEntries((await request.formData()).entries()) as Record<string, unknown>)
      : ((await request.json()) as Record<string, unknown>);
  } catch {
    return fail('Malformed request.', 400);
  }

  // Honeypot and timing. Both answer 200 on purpose: a bot that learns which
  // signal tripped it is a bot that gets past the next version. Note this is
  // ALSO the branch that stops the acknowledgement being used as an amplifier,
  // because nothing is sent from here.
  const trap = String(data.company ?? '').trim();
  const elapsed = Number(data.elapsed ?? 0);
  if (trap || (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS)) {
    return asPage ? page('Sent.', 'Thank you — your message reached us.', 200) : json({ ok: true }, 200);
  }

  const ip = request.headers.get('cf-connecting-ip');
  if (env.CONTACT_LIMIT) {
    // Falling back to a shared key rather than skipping: an absent
    // CF-Connecting-IP used to mean NO limit at all, which is exactly the
    // request an abuser would craft. A shared bucket is blunt, but the failure
    // mode is "too strict for a rare anonymous caller", not "wide open".
    const { success } = await env.CONTACT_LIMIT.limit({ key: ip ?? 'no-ip' });
    if (!success) return fail('Too many messages. Try again shortly.', 429);
  }

  if (!(await passesTurnstile(env, data.token, ip))) {
    return fail('The bot check did not pass.', 400);
  }

  // Newlines stripped from single-line fields: they end up in a subject and a
  // Reply-To, where a stray line break is a header injection.
  const clean = (v: unknown) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
  const name = clean(data.name);
  const email = clean(data.email);
  const message = String(data.message ?? '').replace(/\r\n/g, '\n').trim();

  if (!name || !email || !message) {
    return fail('Name, address and message are all required.', 400);
  }

  /* The consent tick. This site has no cookie banner by decision, so the box on
     the form is the only thing a visitor ever agrees to, and it is checked here
     as well as in the page script — a form-encoded POST arriving with no JS
     never ran that script, and `novalidate` on the <form> means the browser did
     not enforce `required` either.

     No consent flag is written into the mail. The subject and body are a
     contract with admin/src/lib/enquiries.ts and changing their shape breaks
     the parser; it is also unnecessary, because an enquiry cannot exist without
     this check passing, and the message carries its own date. */
  if (!data.consent) {
    return fail(
      'The message was not sent, because the agreement box was not ticked.',
      400,
      'Nothing was sent.',
    );
  }
  if (!EMAIL_RE.test(email)) return fail('A reply cannot reach that address.', 400);

  /* A role is picked, not defaulted. The form used to pre-tick "A founder", so
     a visitor who skipped the row was filed as one; the page now ships the
     radios unchecked, and this is the no-JS half of the same rule. Same words
     as FORM.roleRequired. */
  const roleRaw = clean(data.role);
  const isInvestor = /investor/i.test(roleRaw);
  if (!isInvestor && !/founder/i.test(roleRaw)) {
    return fail('Say which you are: a founder or an investor.', 400);
  }
  if (name.length > LIMITS.name || email.length > LIMITS.email || message.length > LIMITS.message) {
    return fail('That message is too long to send.', 413);
  }

  // Unset key is a SUPPORTED state, not an error: the site is deployed before
  // the mail account exists, and this is what tells the form to fall back to
  // the prepared mail draft silently rather than showing the visitor a failure.
  if (!env.RESEND_API_KEY) {
    return asPage
      ? page(
          'Write to us directly.',
          `This form is not connected to a mailbox yet. Send your message to ${PUBLISHED_ADDRESS} and it reaches the same desk.`,
          503,
        )
      : json({ ok: false, unconfigured: true }, 503);
  }

  const role = isInvestor ? 'An investor' : 'A founder';

  // 1. The enquiry. If this does not go, nothing else matters.
  const delivered = await send(env.RESEND_API_KEY, {
    from: env.CONTACT_FROM,
    to: [env.CONTACT_TO],
    reply_to: [email],
    subject: `${isInvestor ? 'Investor' : 'Founder'} · ${name}`,
    text: `${message}\n\n—\n${name}\n${email}\n${role}`,
  });
  if (!delivered) return fail('The message did not send.', 502);

  // 2. The acknowledgement. Sent after, and its failure is NOT the visitor's
  // problem: the enquiry is already on the desk, so reporting a failure here
  // would invite a duplicate submission of a message that arrived fine.
  const acked = await send(env.RESEND_API_KEY, {
    from: env.CONTACT_FROM,
    to: [email],
    reply_to: [env.CONTACT_TO],
    subject: 'Guardian Holdings JSC — your message',
    text: acknowledgement(name, message, PUBLISHED_ADDRESS),
  });
  if (!acked) console.error('acknowledgement failed for', email);

  return asPage
    ? page(
        'Sent.',
        'Thank you — your message reached us. A reply comes to the address you gave.',
        200,
      )
    : json({ ok: true, acknowledged: acked }, 200);
}
