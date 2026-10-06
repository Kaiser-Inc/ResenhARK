/** Pure rules of the built-in deck builder; `build.ts` does the network calls around them. */

export type Candidate = { title: string; artists: string[]; year: number; br: boolean };
export type DeezerHit = { id: number; title: string; artist: string };
export type DeezerTrack = { id: number; isrc: string; preview: string };
export type RemovedReason = "no-track" | "no-preview" | "no-isrc";
export type Outcome =
  | { kind: "removed"; candidate: Candidate; reason: RemovedReason }
  | {
      kind: "accepted";
      candidate: Candidate;
      deezerId: number;
      isrc: string;
      mbYear: number | null;
      /** The list year and the MusicBrainz first release differ by more than one year. */
      divergent: boolean;
    };
export type DeckSong = {
  title: string;
  artists: string[];
  year: number;
  isrc: string;
  deezerId: number;
  br: boolean;
};

const REJECTED =
  /\b(live|ao vivo|en vivo|remix|mix|karaok[eê]|cover|tribute|acoustic|ac[uú]stico|instrumental|cifra|playback|sped up|slowed|8-bit)\b/;

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const EXTRAS = /\s*[([].*?[)\]]|\s+-\s+.*$/g;

/** The title without "(…)", "[…]" or " - …" extras: "Song - Remastered 2011" → "Song". */
function baseTitle(title: string): string {
  return title.replace(EXTRAS, "");
}

/** Only the extras, so a song called "Cover Me" is not taken for a cover. */
function extras(title: string): string {
  return (title.match(EXTRAS) ?? []).join(" ");
}

/** The studio recording of the candidate among the search hits, plain title first. */
export function pickTrack(candidate: Candidate, hits: DeezerHit[]): DeezerHit | null {
  const title = normalize(candidate.title);
  const artists = candidate.artists.map(normalize);
  const matches = hits.filter(
    (hit) =>
      normalize(baseTitle(hit.title)) === title &&
      artists.includes(normalize(hit.artist)) &&
      !REJECTED.test(normalize(extras(hit.title))),
  );
  return matches.find((hit) => normalize(hit.title) === title) ?? matches[0] ?? null;
}

export function decide(
  candidate: Candidate,
  track: DeezerTrack | null,
  mbYear: number | null,
): Outcome {
  if (!track) return { kind: "removed", candidate, reason: "no-track" };
  if (!track.preview) return { kind: "removed", candidate, reason: "no-preview" };
  if (!track.isrc) return { kind: "removed", candidate, reason: "no-isrc" };
  return {
    kind: "accepted",
    candidate,
    deezerId: track.id,
    isrc: track.isrc,
    mbYear,
    divergent: mbYear !== null && Math.abs(mbYear - candidate.year) > 1,
  };
}

const BR_SHARE = 0.25;

/** Up to `max` accepted songs, a quarter Brazilian when possible, in list order, without repeats. */
export function select(outcomes: Outcome[], max: number): DeckSong[] {
  const seen = new Set<string>();
  const songs: DeckSong[] = [];
  for (const o of outcomes) {
    if (o.kind !== "accepted") continue;
    const key = `${normalize(o.candidate.title)}|${o.candidate.artists.map(normalize).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { title, artists, year, br } = o.candidate;
    songs.push({ title, artists, year, isrc: o.isrc, deezerId: o.deezerId, br });
  }
  const br = songs.filter((s) => s.br);
  const intl = songs.filter((s) => !s.br);
  const brCount = Math.min(br.length, Math.max(Math.round(max * BR_SHARE), max - intl.length));
  const keep = new Set([...br.slice(0, brCount), ...intl.slice(0, max - brCount)]);
  return songs.filter((s) => keep.has(s));
}

export function report(outcomes: Outcome[], deckSize: number): string {
  const label = (c: Candidate) => `${c.title} · ${c.artists.join(", ")}`;
  const removed = outcomes.filter((o) => o.kind === "removed");
  const divergent = outcomes.filter((o) => o.kind === "accepted" && o.divergent);
  return [
    "# Default deck report",
    "",
    `${outcomes.length} candidates, ${deckSize} songs in the deck, ${removed.length} removed, ${divergent.length} with a divergent year.`,
    "",
    "## Removed",
    "",
    ...removed.map(
      (o) =>
        `- ${label(o.candidate)} (${o.candidate.year}): ${o.kind === "removed" ? o.reason : ""}`,
    ),
    "",
    "## Divergent year (kept with the list year)",
    "",
    ...divergent.map(
      (o) =>
        `- ${label(o.candidate)}: lista ${o.candidate.year}, MusicBrainz ${o.kind === "accepted" ? o.mbYear : ""}`,
    ),
    "",
  ].join("\n");
}
