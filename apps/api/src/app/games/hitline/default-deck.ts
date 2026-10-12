import type { ImportedPlaylist } from "../../gateways/ports/playlist-source.js";
import songs from "./default-deck.json" with { type: "json" };

/**
 * The Baralho da galera: the songs the team collected, played when the owner picks it or when
 * no genre is chosen. Loaded once and never copied into a room: `lobby.deck === null` means this
 * deck. Ids come from the Deezer track, so they survive reordering and rebuilding the list.
 */
export const DEFAULT_DECK: ImportedPlaylist = {
  name: "Baralho da galera",
  cards: songs.map((song) => ({
    id: `default-${song.deezerId}`,
    title: song.title,
    artists: song.artists,
    year: song.year,
    isrc: song.isrc,
    spotifyUrl: null,
    deezerId: song.deezerId,
  })),
};
