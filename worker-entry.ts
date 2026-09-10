/**
 * Byte-range shim for /audio/*, and nothing else.
 *
 * WHY THIS EXISTS. Cloudflare Workers Static Assets answers a `Range` request
 * with `200` and the whole body — no `Accept-Ranges`, no `206`. Measured on
 * 2026-09-10 against both the custom domain and the workers.dev origin, and on
 * every file type, so it is the platform's behaviour and not a misconfiguration:
 *
 *   curl -I -H 'Range: bytes=0-1' .../audio/lacrimosa.m4a
 *   HTTP/2 200 · content-length: 2313413 · (no accept-ranges, no content-range)
 *
 * iOS Safari's HTMLMediaElement requires byte-range support. A media element
 * pointed at a server that ignores Range is the classic "plays everywhere
 * except on iPhone" failure, which is one of the two independent causes of the
 * reported bug — the other being the user-gesture ordering, fixed in
 * islands/sound/bed.ts. Both had to go.
 *
 * COST. `main` means Worker code can run, which is metered — but `[assets]
 * run_worker_first` scopes that to /audio/* alone. Every other request on the
 * site still hits the asset store directly and stays free and unmetered, which
 * is the property wrangler.toml was chosen for. Audio is fetched only when a
 * visitor actually presses the sound control.
 */

/** Structural, so this file needs no Cloudflare type package. */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const RANGE = /^bytes=(\d*)-(\d*)$/;

function unsatisfiable(total: number): Response {
  return new Response(null, {
    status: 416,
    headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const asset = await env.ASSETS.fetch(request);

    // Anything the asset layer did not serve as a plain 200 — a 404, a
    // redirect, a conditional 304 — is passed through untouched. Rewriting a
    // 304 into a 206 would be worse than the bug this fixes.
    if (asset.status !== 200) return asset;

    const headers = new Headers(asset.headers);
    // Advertised on every response, not just ranged ones: a client that cannot
    // see Accept-Ranges will not ask for a range in the first place.
    headers.set('Accept-Ranges', 'bytes');

    // HEAD has no body to slice, and its Content-Length is already correct.
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });

    const range = request.headers.get('Range');
    const body = await asset.arrayBuffer();
    const total = body.byteLength;

    if (!range) {
      headers.set('Content-Length', String(total));
      return new Response(body, { status: 200, headers });
    }

    const m = RANGE.exec(range.trim());
    // Multi-range ("bytes=0-9,20-29") is legal and nothing here needs it; the
    // spec allows answering the whole resource instead of parsing it.
    if (!m) {
      headers.set('Content-Length', String(total));
      return new Response(body, { status: 200, headers });
    }

    let start: number;
    let end: number;
    if (m[1] === '') {
      // Suffix form: "bytes=-500" means the LAST 500 bytes. Media players use
      // it to read a trailing MP4 index, so it is not a theoretical branch.
      const len = Number(m[2]);
      if (!Number.isFinite(len) || len <= 0) return unsatisfiable(total);
      start = Math.max(0, total - len);
      end = total - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      return unsatisfiable(total);
    }

    headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(body.slice(start, end + 1), { status: 206, headers });
  },
};
