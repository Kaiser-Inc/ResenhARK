/**
 * Builds the built-in Hitline deck from `candidates.json`:
 *   pnpm --filter api exec tsx src/scripts/default-deck/build.ts
 * Looks each song up on Deezer (track id, ISRC, clip) and MusicBrainz (first release year),
 * then writes `src/app/games/hitline/default-deck.json` and `report.md` next to this file.
 * Answers are cached in node_modules/.cache, so a re-run after fixing the list is quick.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type Candidate,
  type DeezerHit,
  type DeezerTrack,
  type Outcome,
  artistKey,
  decide,
  pickTrack,
  report,
  select,
} from "./deck.js";

const DECK_SIZE = 500;
const here = import.meta.dirname;
const apiRoot = path.join(here, "../../..");
const cacheFile = path.join(apiRoot, "node_modules/.cache/default-deck.json");
// MusicBrainz asks for a meaningful User-Agent; no personal data in it.
const USER_AGENT = "ResenhARK/0.1 (https://github.com/Kaiser-Inc/ResenhARK)";

type Cache = Record<string, unknown>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function cached<T>(cache: Cache, key: string, load: () => Promise<T>): Promise<T> {
  if (key in cache) return cache[key] as T;
  const value = await load();
  cache[key] = value;
  return value;
}

async function getJson(url: string, pauseMs: number): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(pauseMs * (attempt + 1));
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
  }
  throw new Error(`GET ${url} kept failing`);
}

async function deezerHits(c: Candidate): Promise<DeezerHit[]> {
  const q = encodeURIComponent(`${c.artists[0]} ${c.title}`);
  const body = (await getJson(`https://api.deezer.com/search?q=${q}&limit=25`, 150)) as {
    data?: { id: number; title: string; artist: { name: string } }[];
  } | null;
  return (body?.data ?? []).map((t) => ({ id: t.id, title: t.title, artist: t.artist.name }));
}

/** The artist's 100 most played tracks: the studio version often ranks below live ones in search. */
async function artistTop(name: string): Promise<DeezerHit[]> {
  const found = (await getJson(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`,
    150,
  )) as { data?: { id: number; name: string }[] } | null;
  const artist = found?.data?.find((a) => artistKey(a.name) === artistKey(name));
  if (!artist) return [];
  const top = (await getJson(`https://api.deezer.com/artist/${artist.id}/top?limit=100`, 150)) as {
    data?: { id: number; title: string; artist: { name: string } }[];
  } | null;
  return (top?.data ?? []).map((t) => ({ id: t.id, title: t.title, artist: t.artist.name }));
}

async function deezerTrack(id: number): Promise<DeezerTrack | null> {
  const t = (await getJson(`https://api.deezer.com/track/${id}`, 150)) as {
    id?: number;
    isrc?: string;
    preview?: string;
  } | null;
  return t?.id ? { id: t.id, isrc: t.isrc ?? "", preview: t.preview ?? "" } : null;
}

async function firstReleaseYear(isrc: string): Promise<number | null> {
  const body = (await getJson(
    `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?fmt=json`,
    1100,
  )) as { recordings?: { "first-release-date"?: string }[] } | null;
  const years = (body?.recordings ?? [])
    .map((r) => Number.parseInt(r["first-release-date"]?.slice(0, 4) ?? "", 10))
    .filter((y) => Number.isFinite(y));
  return years.length ? Math.min(...years) : null;
}

async function main() {
  const candidates = JSON.parse(
    await readFile(path.join(here, "candidates.json"), "utf8"),
  ) as Candidate[];
  const cache: Cache = JSON.parse(await readFile(cacheFile, "utf8").catch(() => "{}"));
  const outcomes: Outcome[] = [];
  for (const [index, c] of candidates.entries()) {
    const key = `${c.artists.join(",")}|${c.title}`;
    const hits = [
      ...(await cached(cache, `search:${key}`, () => deezerHits(c))),
      ...(await cached(cache, `top:${c.artists[0]}`, () => artistTop(c.artists[0]))),
    ];
    const hit = pickTrack(c, hits);
    const track = hit ? await cached(cache, `track:${hit.id}`, () => deezerTrack(hit.id)) : null;
    const mbYear = track?.isrc
      ? await cached(cache, `mb:${track.isrc}`, () => firstReleaseYear(track.isrc))
      : null;
    const outcome = decide(c, track, mbYear);
    outcomes.push(outcome);
    console.log(
      `${index + 1}/${candidates.length} ${outcome.kind === "accepted" ? (outcome.divergent ? "~" : "ok") : outcome.reason} ${key}`,
    );
    if (index % 20 === 0) {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(cache));
    }
  }
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache));
  const deck = select(outcomes, DECK_SIZE);
  await writeFile(
    path.join(apiRoot, "src/app/games/hitline/default-deck.json"),
    `${JSON.stringify(deck, null, 2)}\n`,
  );
  await writeFile(path.join(here, "report.md"), report(outcomes, deck.length));
  console.log(`deck: ${deck.length} songs, ${deck.filter((s) => s.br).length} Brazilian`);
}

await main();
