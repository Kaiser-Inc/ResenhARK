import { readFile } from "node:fs/promises";
import { FIXTURE_AUDIO_URL } from "./fixture-preview.js";

// apps/api/assets, reached from src/app/gateways/audio and from dist/app/gateways/audio alike.
export const SILENCE_MP3_URL = new URL("../../../../assets/silence.mp3", import.meta.url);

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const AUDIO_TIMEOUT_MS = 10_000;

const ALLOWED_HOSTS = [/(^|\.)dzcdn\.net$/, /(^|\.)itunes\.apple\.com$/, /(^|\.)mzstatic\.com$/];

export function isAllowedAudioUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

async function readCapped(res: Response, max: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) throw new Error("audio too large");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!res.body) return Buffer.alloc(0);
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > max) throw new Error("audio too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Fetches provider preview bytes. Throws on anything outside the allowlist, limits or timeout. */
export function createFetchAudio(
  fetchFn: typeof fetch = fetch,
  max = MAX_AUDIO_BYTES,
  timeoutMs = AUDIO_TIMEOUT_MS,
): (url: string) => Promise<Response> {
  return async (url) => {
    if (url === FIXTURE_AUDIO_URL) {
      return new Response(await readFile(SILENCE_MP3_URL), {
        headers: { "content-type": "audio/mpeg" },
      });
    }
    if (!isAllowedAudioUrl(url)) throw new Error("audio host not allowed");
    const res = await fetchFn(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return new Response(null, { status: 404 });
    const body = await readCapped(res, max);
    return new Response(new Uint8Array(body), {
      headers: { "content-type": res.headers.get("content-type") ?? "audio/mpeg" },
    });
  };
}
