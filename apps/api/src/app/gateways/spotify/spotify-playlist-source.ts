import type { Card } from "../../games/hitline/engine.js";
import type { ImportedPlaylist, PlaylistError, PlaylistSource } from "../ports/playlist-source.js";
import type { SpotifyAuth } from "./spotify-auth.js";

const ID_RE = /^[A-Za-z0-9]{22}$/;
const MAX_RETRIES_429 = 3;
const MAX_RETRY_AFTER_S = 10;
const RETRY_BUDGET_MS = 30_000;
const MAX_PAGES = 50;
const TIMEOUT_MS = 10_000;
const API = "https://api.spotify.com/v1";

export function parsePlaylistId(link: string): string | null {
  const s = link.trim();
  let id: string | undefined;
  const uri = /^spotify:playlist:([^:?]+)$/.exec(s);
  if (uri) id = uri[1];
  else {
    try {
      const u = new URL(s);
      if (u.hostname === "open.spotify.com")
        id = /^\/(?:intl-[a-z]+\/)?playlist\/([^/]+)/.exec(u.pathname)?.[1];
    } catch {
      return null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

class NoAccess extends Error {}
class Disconnected extends Error {}

type SpotifyTrack = {
  id?: string | null;
  type?: string;
  name?: string;
  is_local?: boolean;
  artists?: { name: string }[];
  album?: { release_date?: string };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
};
type Page = {
  next?: string | null;
  items?: { item?: SpotifyTrack | null; track?: SpotifyTrack | null; is_local?: boolean }[];
};

export class SpotifyPlaylistSource implements PlaylistSource {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly deps: {
      auth: SpotifyAuth;
      fetchFn?: typeof fetch;
      newId: () => string;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async load(
    link: string,
  ): Promise<{ ok: true; playlist: ImportedPlaylist } | { ok: false; error: PlaylistError }> {
    const id = parsePlaylistId(link);
    if (!id) return { ok: false, error: "playlist-invalid-link" };
    try {
      const meta = (await this.get(`${API}/playlists/${id}?fields=name`)) as { name?: string };
      const cards: Card[] = [];
      const seen = new Set<string>();
      let url: string | null | undefined =
        `${API}/playlists/${id}/items?limit=50&additional_types=track`;
      for (let pages = 0; url; pages++) {
        if (pages >= MAX_PAGES) throw new Error("spotify playlist has too many pages");
        if (!url.startsWith(`${API}/`)) throw new Error("spotify next link has a foreign origin");
        const page = (await this.get(url)) as Page;
        for (const entry of page.items ?? []) {
          const t = entry.item ?? entry.track;
          if (!t || t.is_local || entry.is_local || t.type !== "track" || !t.id) continue;
          const year = Number((t.album?.release_date ?? "").slice(0, 4));
          if (!Number.isInteger(year) || year < 1000) continue;
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          cards.push({
            id: this.deps.newId(),
            title: t.name ?? "",
            artists: (t.artists ?? []).map((a) => a.name),
            year,
            isrc: t.external_ids?.isrc ?? null,
            spotifyUrl: t.external_urls?.spotify ?? null,
          });
        }
        url = page.next;
      }
      if (cards.length === 0) return { ok: false, error: "playlist-empty" };
      return { ok: true, playlist: { name: meta.name ?? "", cards } };
    } catch (e) {
      if (e instanceof NoAccess) return { ok: false, error: "playlist-no-access" };
      if (e instanceof Disconnected) return { ok: false, error: "spotify-disconnected" };
      throw e;
    }
  }

  /** GET with 401 -> one refresh retry and 429 -> Retry-After with exponential backoff. */
  private async get(url: string): Promise<unknown> {
    let refreshed = false;
    let backoffs = 0;
    let waited = 0;
    for (;;) {
      const token = await this.deps.auth.accessToken();
      if (!token) throw new Disconnected();
      const res = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res.json();
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        this.deps.auth.invalidate();
        continue;
      }
      if (res.status === 403 || res.status === 404) throw new NoAccess();
      if (res.status === 429 && backoffs < MAX_RETRIES_429) {
        const raw = Number(res.headers.get("Retry-After"));
        const base = raw > 0 ? raw : 1; // missing or HTTP-date -> NaN -> 1 s
        const wait = base * 1000 * 2 ** backoffs;
        if (base > MAX_RETRY_AFTER_S || waited + wait > RETRY_BUDGET_MS) {
          throw new Error("spotify rate limit: Retry-After too long");
        }
        backoffs++;
        waited += wait;
        await this.sleep(wait);
        continue;
      }
      throw new Error(`spotify request failed (${res.status})`);
    }
  }
}
