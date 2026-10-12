// MusicBrainz asks for a meaningful User-Agent; no personal data in it.
export const USER_AGENT = "ResenhARK/0.1 (https://github.com/Kaiser-Inc/ResenhARK)";

export type Cache = Record<string, unknown>;
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function cached<T>(cache: Cache, key: string, load: () => Promise<T>): Promise<T> {
  if (key in cache) return cache[key] as T;
  const value = await load();
  cache[key] = value;
  return value;
}

export async function getJson(url: string, pauseMs: number): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(pauseMs * (attempt + 1));
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
  }
  throw new Error(`GET ${url} kept failing`);
}

/** First release year of a recording, from MusicBrainz (about 1 request per second). */
export async function firstReleaseYear(isrc: string): Promise<number | null> {
  const body = (await getJson(
    `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?fmt=json`,
    1100,
  )) as { recordings?: { "first-release-date"?: string }[] } | null;
  const years = (body?.recordings ?? [])
    .map((r) => Number.parseInt(r["first-release-date"]?.slice(0, 4) ?? "", 10))
    .filter((y) => Number.isFinite(y));
  return years.length ? Math.min(...years) : null;
}
