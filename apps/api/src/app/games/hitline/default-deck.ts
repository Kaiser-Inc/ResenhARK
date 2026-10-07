import type { ImportedPlaylist } from "../../gateways/ports/playlist-source.js";
import songs from "./default-deck.json" with { type: "json" };

/**
 * The deck every room plays until the owner imports a playlist. Loaded once and never copied
 * into a room: `lobby.deck === null` means this deck. Ids are stable by position, so the
 * played-set and a finished game's cards keep matching across games.
 */
export const DEFAULT_DECK: ImportedPlaylist = {
  name: "Baralho ResenhARK",
  cards: songs.map((song, index) => ({
    id: `default-${index}`,
    title: song.title,
    artists: song.artists,
    year: song.year,
    isrc: song.isrc,
    spotifyUrl: null,
    deezerId: song.deezerId,
  })),
};
