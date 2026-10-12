import { z } from "zod";

/** Deezer genre ids the Hitline catalog plays, in the order the lobby lists them. */
export const HITLINE_GENRES = [
  { id: 132, name: "Pop" },
  { id: 152, name: "Rock" },
  { id: 80, name: "Sertanejo" },
  { id: 78, name: "MPB" },
  { id: 472, name: "Rap/Funk Brasileiro" },
  { id: 116, name: "Rap/Hip Hop" },
  { id: 122, name: "Reggaeton" },
  { id: 113, name: "Dance" },
  { id: 165, name: "R&B" },
  { id: 85, name: "Alternativo" },
  { id: 79, name: "Samba/Pagode" },
  { id: 106, name: "Electro" },
  { id: 76, name: "Axé/Forró" },
  { id: 466, name: "Folk" },
  { id: 144, name: "Reggae" },
  { id: 129, name: "Jazz" },
  { id: 464, name: "Metal" },
  { id: 169, name: "Soul & Funk" },
  { id: 153, name: "Blues" },
  { id: 173, name: "Filmes/Games" },
  { id: 98, name: "Clássica" },
  { id: -1, name: "Outros" },
] as const;
export const OTHER_GENRE = -1;
const GENRE_IDS = new Set<number>(HITLINE_GENRES.map((g) => g.id));
export const isHitlineGenre = (id: number): boolean => GENRE_IDS.has(id);

export const DECADES = [
  "pre60",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
] as const;
export type Decade = (typeof DECADES)[number];
export const DECADE_LABELS: Record<Decade, string> = {
  pre60: "Antes dos 60s",
  "1960s": "Anos 60",
  "1970s": "Anos 70",
  "1980s": "Anos 80",
  "1990s": "Anos 90",
  "2000s": "Anos 2000",
  "2010s": "Anos 2010",
  "2020s": "Anos 2020",
};
export const DEFAULT_DECADES: Decade[] = DECADES.filter((d) => d !== "pre60");

export function decadeOf(year: number): Decade {
  if (year < 1960) return "pre60";
  return `${Math.min(Math.floor(year / 10) * 10, 2020)}s` as Decade;
}

export type HitlineSource = "genres" | "galera" | "playlist";

const genreId = z.number().int().refine(isHitlineGenre);
export const genresInputSchema = z.object({
  genres: z.array(genreId).max(HITLINE_GENRES.length),
});
export const decadesInputSchema = z.object({ decades: z.array(z.enum(DECADES)).min(1) });
export const sourceInputSchema = z.object({ source: z.enum(["genres", "galera"]) });
