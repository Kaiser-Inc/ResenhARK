import entries from "./catalog.json" with { type: "json" };
import type { Card } from "./engine.js";

export type CatalogCard = Card & { genre: number };

type Entry = {
  id: string;
  deezerId: number;
  isrc: string;
  title: string;
  artists: string[];
  year: number;
  genre: number;
};

/** The genre catalog, built by `scripts/catalog/build.ts`. Loaded once and never copied into a room. */
export const CATALOG: CatalogCard[] = (entries as Entry[]).map((e) => ({
  id: e.id,
  title: e.title,
  artists: e.artists,
  year: e.year,
  isrc: e.isrc,
  spotifyUrl: null,
  deezerId: e.deezerId,
  genre: e.genre,
}));
