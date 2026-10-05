import type { Card } from "../../games/hitline/engine.js";

export type ImportedPlaylist = { name: string; cards: Card[] };
export type PlaylistError =
  | "spotify-disconnected"
  | "playlist-invalid-link"
  | "playlist-no-access"
  | "playlist-empty";
export interface PlaylistSource {
  load(
    link: string,
  ): Promise<{ ok: true; playlist: ImportedPlaylist } | { ok: false; error: PlaylistError }>;
}
