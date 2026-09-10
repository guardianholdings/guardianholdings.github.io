/**
 * Which background recording shipped — answered from the filesystem at BUILD
 * time, never probed from the browser.
 *
 * SERVER ONLY. This imports node:fs, so it may be used from .astro frontmatter
 * and nowhere else. Importing it from an island would put it in the client
 * bundle and the build would fail on the node: specifier.
 *
 * Two callers need the same answer for different reasons: Base.astro passes
 * the list to the sound island, and ActChannel.astro decides whether to print
 * the attribution line. A recording under a CC licence and a credit for it
 * must appear or vanish together, so they read one function rather than two
 * copies of the same list.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Preferred order. AAC first because it is the one format Safari and Chrome
 * both play; Ogg last because Safari plays none of it, and it is here to cover
 * Firefox builds shipped without an AAC decoder.
 */
const CANDIDATES = ['lacrimosa.m4a', 'lacrimosa.mp3', 'lacrimosa.ogg'] as const;

/**
 * Every shipped encoding of the bed, in preference order. Empty is the normal
 * state before a recording is added, and the sound control then plays the
 * synthesised cavity instead.
 *
 * process.cwd(), not import.meta.url: .astro frontmatter is compiled into
 * Astro's cache before it runs, so a module-relative path resolves somewhere
 * that is not src/. Astro is always invoked at the project root.
 */
export function bedSources(): string[] {
  return CANDIDATES.filter((name) =>
    existsSync(join(process.cwd(), 'public', 'audio', name)),
  ).map((name) => `/audio/${name}`);
}
