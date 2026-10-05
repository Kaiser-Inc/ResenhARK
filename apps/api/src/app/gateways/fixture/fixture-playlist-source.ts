import devDeck from "../../games/hitline/dev-deck.json" with { type: "json" };
import type { PlaylistSource } from "../ports/playlist-source.js";

// Two example tracks carry a Spotify link so e2e can see the reveal QR code.
const SPOTIFY_URLS = [
  "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
];

/**
 * Dev and e2e source: ignores the link, except that a link without "playlist" is invalid and
 * "private" / "empty" in the link give the no-access and empty errors.
 */
export class FixturePlaylistSource implements PlaylistSource {
  constructor(private readonly newId: () => string) {}

  async load(link: string) {
    if (!link.includes("playlist")) return { ok: false, error: "playlist-invalid-link" } as const;
    if (link.includes("private")) return { ok: false, error: "playlist-no-access" } as const;
    if (link.includes("empty")) return { ok: false, error: "playlist-empty" } as const;
    return {
      ok: true,
      playlist: {
        name: "Baralho de desenvolvimento",
        // "tiny" gives a 3-card deck so e2e can reach the end of the pile.
        cards: (link.includes("tiny") ? devDeck.slice(0, 3) : devDeck).map((song, index) => ({
          id: this.newId(),
          title: song.title,
          artists: song.artists,
          year: song.year,
          isrc: null,
          spotifyUrl: SPOTIFY_URLS[index] ?? null,
        })),
      },
    } as const;
  }
}
