import devDeck from "../../games/hitline/dev-deck.json" with { type: "json" };
import type { PlaylistSource } from "../ports/playlist-source.js";

/** Dev and e2e source: ignores the link, except that a link without "playlist" is invalid. */
export class FixturePlaylistSource implements PlaylistSource {
  constructor(private readonly newId: () => string) {}

  async load(link: string) {
    if (!link.includes("playlist")) return { ok: false, error: "playlist-invalid-link" } as const;
    return {
      ok: true,
      playlist: {
        name: "Baralho de desenvolvimento",
        cards: devDeck.map((song) => ({
          id: this.newId(),
          title: song.title,
          artists: song.artists,
          year: song.year,
          isrc: null,
          spotifyUrl: null,
        })),
      },
    } as const;
  }
}
