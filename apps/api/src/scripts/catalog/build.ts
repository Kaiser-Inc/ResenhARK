/**
 * Grows the Hitline catalog from the Deezer playlists in `sources.json`:
 *   pnpm --filter api exec tsx src/scripts/catalog/build.ts [--limit N]
 * Songs already in `catalog.json` are never looked up again or removed. New ones get the album
 * genre from Deezer and the first release year from MusicBrainz (1 request per second).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cached, firstReleaseYear, getJson } from "../lib/music-apis.js";
import {
  type CatalogEntry,
  type PlaylistTrack,
  catalogReport,
  mergeCatalog,
  newCandidates,
  rejectedByCut,
  resolveGenre,
  resolveYear,
} from "./catalog-build.js";

const here = import.meta.dirname;
const apiRoot = path.join(here, "../../..");
const catalogFile = path.join(apiRoot, "src/app/games/hitline/catalog.json");
const cacheFile = path.join(apiRoot, "node_modules/.cache/catalog.json");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Number.POSITIVE_INFINITY;

type Sources = { minRank: number; genres: Record<string, number[]>; decades: number[] };

async function tracksOf(url: string): Promise<PlaylistTrack[]> {
  try {
    const body = (await getJson(url, 150)) as { data?: PlaylistTrack[] } | null;
    return body?.data ?? [];
  } catch (err) {
    console.warn(`skipped ${url}: ${(err as Error).message}`);
    return [];
  }
}
const playlistTracks = (id: number) =>
  tracksOf(`https://api.deezer.com/playlist/${id}/tracks?limit=2000`);
const chartTracks = (genreId: string) =>
  tracksOf(`https://api.deezer.com/chart/${genreId}/tracks?limit=100`);

async function save(cache: Record<string, unknown>) {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache));
}

async function main() {
  const sources = JSON.parse(await readFile(path.join(here, "sources.json"), "utf8")) as Sources;
  const existing = JSON.parse(await readFile(catalogFile, "utf8")) as CatalogEntry[];
  const cache: Record<string, unknown> = JSON.parse(
    await readFile(cacheFile, "utf8").catch(() => "{}"),
  );

  const tracks: PlaylistTrack[] = [];
  for (const [genreId, playlists] of Object.entries(sources.genres)) {
    tracks.push(...(await chartTracks(genreId)));
    for (const id of playlists) tracks.push(...(await playlistTracks(id)));
  }
  for (const id of sources.decades) tracks.push(...(await playlistTracks(id)));

  const known = new Set(existing.map((e) => e.isrc));
  const fresh = newCandidates(tracks, sources.minRank, known).slice(0, limit);
  const skipped = rejectedByCut(tracks, sources.minRank);
  const added: CatalogEntry[] = [];
  for (const [index, t] of fresh.entries()) {
    const isrc = t.isrc as string;
    try {
      const full = (await cached(cache, `track:${t.id}`, () =>
        getJson(`https://api.deezer.com/track/${t.id}`, 150),
      )) as { release_date?: string; contributors?: { name: string }[] } | null;
      const album = (await cached(cache, `album:${t.album.id}`, () =>
        getJson(`https://api.deezer.com/album/${t.album.id}`, 150),
      )) as { genre_id?: number } | null;
      const mbYear = await cached(cache, `mb:${isrc}`, () => firstReleaseYear(isrc));
      const year = resolveYear(full?.release_date, mbYear);
      if (year) {
        const artists = [...new Set((full?.contributors ?? []).map((c) => c.name))];
        added.push({
          id: `cat-${t.id}`,
          deezerId: t.id,
          isrc,
          title: t.title_short,
          artists: artists.length ? artists : [t.artist.name],
          year: year.year,
          genre: resolveGenre(album?.genre_id),
          rank: t.rank,
          yearVerified: year.verified,
        });
      }
    } catch (err) {
      // One failing lookup must not lose hours of work: the song is retried on the next run.
      console.warn(`skipped ${t.artist.name} - ${t.title_short}: ${(err as Error).message}`);
    }
    console.log(`${index + 1}/${fresh.length} ${t.artist.name} - ${t.title_short}`);
    if (index % 20 === 0) await save(cache);
  }
  await save(cache);
  const catalog = mergeCatalog(existing, added);
  await writeFile(catalogFile, `${JSON.stringify(catalog, null, 1)}\n`);
  await writeFile(path.join(here, "report.md"), catalogReport(catalog, added, skipped));
  console.log(`catalog: ${catalog.length} songs, ${added.length} new`);
}

await main();
