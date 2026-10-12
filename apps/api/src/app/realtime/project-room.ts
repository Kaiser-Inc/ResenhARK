import {
  DECADES,
  DECADE_LABELS,
  type GameView,
  HITLINE_GENRES,
  type LobbyView,
  type RoomView,
  decadeOf,
} from "@resenhark/shared";
import { settings } from "../core/settings.js";
import {
  type Room,
  deckOf,
  effectiveGenres,
  isOnline,
  playablePool,
  playedKey,
  sourceCards,
} from "../domain/room/room.js";
import type { CatalogCard } from "../games/hitline/catalog.js";
import type { Card } from "../games/hitline/engine.js";
import { inDecades } from "../games/hitline/pool.js";
import { isRunning, projectGame } from "../games/registry.js";
import { audioPath } from "../http/audio-tickets.js";

type LobbyCounts = {
  source: ReturnType<typeof sourceCards>;
  remaining: number;
  byGenre: Map<number, number>;
  byDecade: Map<string, number>;
};

// Every viewer of a broadcast gets the same counts, so scan the catalog once per room state.
// The room object is replaced on each mutation, which is what invalidates an entry.
const counted = new WeakMap<Room, { catalog: CatalogCard[]; counts: LobbyCounts }>();

function lobbyCounts(room: Room, catalog: CatalogCard[]): LobbyCounts {
  const hit = counted.get(room);
  if (hit && hit.catalog === catalog) return hit.counts;
  const { lobby } = room;
  const source = sourceCards(room, catalog);
  const played = new Set(lobby.played);
  const unplayed = (cards: Card[]) => cards.filter((card) => !played.has(playedKey(card)));
  const byGenre = new Map<number, number>();
  for (const card of unplayed(inDecades(catalog, lobby.decades))) {
    const genre = (card as CatalogCard).genre;
    byGenre.set(genre, (byGenre.get(genre) ?? 0) + 1);
  }
  const byDecade = new Map<string, number>();
  for (const card of unplayed(source.cards)) {
    const decade = decadeOf(card.year);
    byDecade.set(decade, (byDecade.get(decade) ?? 0) + 1);
  }
  const counts = { source, remaining: playablePool(room, catalog).length, byGenre, byDecade };
  counted.set(room, { catalog, counts });
  return counts;
}

/** What `viewerId` is allowed to see of the room. Never add hidden game data here. */
export function projectRoom(
  room: Room,
  viewerId: string,
  now: number,
  catalog: CatalogCard[],
): RoomView {
  const { game, lobby } = room;
  const onlineCount = room.members.filter(isOnline).length;
  const cap = Math.min(onlineCount, lobby.config.maxPlayers);
  const { source, remaining, byGenre, byDecade } = lobbyCounts(room, catalog);
  const listed = new Set(effectiveGenres(room));
  const chosenDecades = new Set(lobby.decades);
  const lobbyView: LobbyView = {
    selectedGame: lobby.game,
    config: { ...lobby.config },
    huehintConfig: { ...lobby.huehintConfig },
    taleclueConfig: { ...lobby.taleclueConfig },
    playlist: {
      source: lobby.source === "playlist" ? "playlist" : "default",
      name: source.genres ? "Catálogo de gêneros" : deckOf(lobby).name,
      count: source.cards.length,
    },
    remaining,
    smallPlaylist: remaining < cap * lobby.config.targetCards * 2,
    source: lobby.source,
    genres: HITLINE_GENRES.map((g) => ({
      id: g.id,
      name: g.name,
      votes: room.members.filter((m) => lobby.genreVotes[m.id]?.includes(g.id)).length,
      selected: listed.has(g.id),
      available: byGenre.get(g.id) ?? 0,
    })),
    myGenres: lobby.genreVotes[viewerId] ?? [],
    genreMode: lobby.ownerGenres ? "manual" : "votes",
    decades: DECADES.map((id) => ({
      id,
      label: DECADE_LABELS[id],
      selected: chosenDecades.has(id),
      available: byDecade.get(id) ?? 0,
    })),
    available: remaining,
    galeraFallback: lobby.source === "genres" && listed.size === 0,
  };
  const active = isRunning(game);
  let gameView: GameView | null = null;
  if (game) {
    gameView = projectGame(game, viewerId);
    if (gameView.type === "hitline" && gameView.view.draw) {
      const draw = gameView.view.draw;
      draw.audioUrl = audioPath(settings.SESSION_SECRET, draw.id, viewerId);
    }
  }
  return {
    code: room.code,
    you: viewerId,
    ownerId: room.ownerId,
    members: room.members.map((member) => ({
      id: member.id,
      name: member.name,
      avatar: member.avatar,
      online: isOnline(member),
      isOwner: member.id === room.ownerId,
      role:
        active && game ? (game.playerIds.includes(member.id) ? "player" : "spectator") : "member",
    })),
    lobby: lobbyView,
    game: gameView,
    serverNow: now,
  };
}
