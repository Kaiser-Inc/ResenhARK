import {
  DECADES,
  DECADE_LABELS,
  HITLINE_GENRES,
  OTHER_GENRE,
  decadeOf,
  isHitlineGenre,
} from "@resenhark/shared";

/** A track as `/playlist/{id}/tracks` and `/chart/{genre}/tracks` list it. */
export type PlaylistTrack = {
  id: number;
  title_short: string;
  isrc?: string;
  rank: number;
  preview: string;
  artist: { name: string };
  album: { id: number };
};
export type CatalogEntry = {
  id: string;
  deezerId: number;
  isrc: string;
  title: string;
  artists: string[];
  year: number;
  genre: number;
  rank: number;
  /** True when MusicBrainz knew the recording, so the year is the first release. */
  yearVerified: boolean;
};

/** Tracks worth looking up: playable, popular enough, one per recording, not in the catalog yet. */
export function newCandidates(
  tracks: PlaylistTrack[],
  minRank: number,
  known: Set<string>,
): PlaylistTrack[] {
  const seen = new Set(known);
  const out: PlaylistTrack[] = [];
  for (const t of tracks) {
    if (!t.preview || !t.isrc || t.rank < minRank || seen.has(t.isrc)) continue;
    seen.add(t.isrc);
    out.push(t);
  }
  return out;
}

/** Tracks the cut turns away: no clip, no ISRC or too little popularity. Repeats and known songs do not count. */
export function rejectedByCut(tracks: PlaylistTrack[], minRank: number): number {
  const seen = new Set<string>();
  let rejected = 0;
  for (const t of tracks) {
    if (!t.preview || !t.isrc || t.rank < minRank) {
      if (!seen.has(`${t.id}`)) rejected++;
      seen.add(`${t.id}`);
    }
  }
  return rejected;
}

/** Years before this are placeholders (Deezer and MusicBrainz sometimes send 1900), not releases. */
export const MIN_YEAR = 1920;

/** A release year is plausible from 1920 up to `maxYear`, which is the current year by default. */
export function isPlausibleYear(year: number, maxYear = new Date().getFullYear()): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= maxYear;
}

/** Remasters and compilations only ever date later, so the earlier year is the closer one. */
export function resolveYear(
  deezerDate: string | undefined,
  mbYear: number | null,
  maxYear = new Date().getFullYear(),
): { year: number; verified: boolean } | null {
  const valid = (y: number | null): y is number => y !== null && isPlausibleYear(y, maxYear);
  const parsed = Number.parseInt(deezerDate?.slice(0, 4) ?? "", 10);
  const deezerYear = valid(Number.isFinite(parsed) ? parsed : null) ? parsed : null;
  const mb = valid(mbYear) ? mbYear : null;
  const years = [deezerYear, mb].filter((y): y is number => y !== null);
  if (years.length === 0) return null;
  return { year: Math.min(...years), verified: mb !== null };
}

export const resolveGenre = (albumGenreId: number | undefined): number =>
  albumGenreId !== undefined && isHitlineGenre(albumGenreId) ? albumGenreId : OTHER_GENRE;

/** The catalog only grows: existing songs stay, new ISRCs are added. */
export function mergeCatalog(existing: CatalogEntry[], added: CatalogEntry[]): CatalogEntry[] {
  const known = new Set(existing.map((e) => e.isrc));
  const fresh = added.filter((e) => !known.has(e.isrc));
  return [...existing, ...fresh].sort((a, b) => a.deezerId - b.deezerId);
}

export function catalogReport(
  catalog: CatalogEntry[],
  added: CatalogEntry[],
  skipped: number,
): string {
  const count = <K>(key: (e: CatalogEntry) => K) => {
    const m = new Map<K, number>();
    for (const e of catalog) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
    return m;
  };
  const byGenre = count((e) => e.genre);
  const byDecade = count((e) => decadeOf(e.year));
  const unverified = added.filter((e) => !e.yearVerified);
  return [
    "# Catálogo do Hitline",
    "",
    `Total: ${catalog.length}`,
    `Novas nesta execução: ${added.length}`,
    `Descartadas pelo corte: ${skipped}`,
    "",
    "| Gênero | Músicas |",
    "|---|---|",
    ...HITLINE_GENRES.map((g) => `| ${g.name} | ${byGenre.get(g.id) ?? 0} |`),
    "",
    "| Década | Músicas |",
    "|---|---|",
    ...DECADES.map((d) => `| ${DECADE_LABELS[d]} | ${byDecade.get(d) ?? 0} |`),
    "",
    `## Novas sem ano verificado (${unverified.length})`,
    "",
    ...unverified.map((e) => `- ${e.artists.join(", ")} - ${e.title} (${e.year})`),
    "",
  ].join("\n");
}
