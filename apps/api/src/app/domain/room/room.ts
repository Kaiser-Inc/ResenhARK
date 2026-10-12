import {
  type Avatar,
  DEFAULT_DECADES,
  DEFAULT_HITLINE_CONFIG,
  DEFAULT_HUEHINT_CONFIG,
  DEFAULT_TALECLUE_CONFIG,
  type Decade,
  type GameType,
  HITLINE_GENRES,
  type HitlineConfig,
  type HitlineSource,
  type Hsb,
  type HuehintConfig,
  ROOM_CODE_ALPHABET,
  type TaleclueConfig,
  normalizeName,
} from "@resenhark/shared";
import type { CatalogCard } from "../../games/hitline/catalog.js";
import { DEFAULT_DECK } from "../../games/hitline/default-deck.js";
import type { Card } from "../../games/hitline/engine.js";
import { normalizeTitle } from "../../games/hitline/normalize.js";
import { inDecades } from "../../games/hitline/pool.js";
import { type ActiveGame, gameDeadline } from "../../games/registry.js";
import type { ImportedPlaylist } from "../../gateways/ports/playlist-source.js";

export type Member = {
  id: string;
  name: string;
  avatar: Avatar;
  joinedAt: number;
  connections: number;
  offlineSince: number | null;
  /** True once the member's first connection was announced in the chat. */
  greeted: boolean;
};

export type Lobby = {
  /** The game `game:start` starts. */
  game: GameType;
  /** Hitline config. */
  config: HitlineConfig;
  huehintConfig: HuehintConfig;
  taleclueConfig: TaleclueConfig;
  /** Where Hitline songs come from. `playlist` exactly when `deck` is set. */
  source: HitlineSource;
  /** Genres each member voted for, by member id. */
  genreVotes: Record<string, number[]>;
  /** The owner's own genre list; null follows the votes. */
  ownerGenres: number[] | null;
  /** Decades that may be drawn, whatever the source. */
  decades: Decade[];
  /** The imported playlist; null plays DEFAULT_DECK. */
  deck: ImportedPlaylist | null;
  /** Stable keys (see playedKey) of every song already played in this room. */
  played: string[];
  /** The colors Huehint drew in this room, oldest first, so a new game avoids them. */
  colors: Hsb[];
  /** Card ids Taleclue dealt in this room, so a new game prefers cards not seen yet. */
  taleclueUsed: string[];
};
export type { ActiveGame };

export type Room = {
  code: string;
  ownerId: string;
  members: Member[];
  lastActivityAt: number;
  lobby: Lobby;
  game: ActiveGame | null;
};

export type RoomError = "name-taken" | "room-full" | "not-owner" | "invalid-target";

export type RoomResult = { ok: true; room: Room } | { ok: false; error: RoomError };

export const MAX_MEMBERS = 20;
export const OWNER_GRACE_MS = 60_000;
/** About 15 games of 4 rounds (more players draw more colors a game); the palette relaxes its distance with age, so older ones weigh less. */
export const MAX_COLORS = 60;

export function generateRoomCode(rng: () => number): string {
  return Array.from(
    { length: 5 },
    () => ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)],
  ).join("");
}

export function createRoom(code: string, owner: Member, now: number): Room {
  return {
    code,
    ownerId: owner.id,
    members: [owner],
    lastActivityAt: now,
    lobby: {
      game: "hitline",
      config: DEFAULT_HITLINE_CONFIG,
      huehintConfig: DEFAULT_HUEHINT_CONFIG,
      taleclueConfig: DEFAULT_TALECLUE_CONFIG,
      source: "genres",
      genreVotes: {},
      ownerGenres: null,
      decades: [...DEFAULT_DECADES],
      deck: null,
      played: [],
      colors: [],
      taleclueUsed: [],
    },
    game: null,
  };
}

export function addMember(room: Room, member: Member, now: number): RoomResult {
  if (room.members.some(({ name }) => normalizeName(name) === normalizeName(member.name))) {
    return { ok: false, error: "name-taken" };
  }

  if (room.members.length >= MAX_MEMBERS) {
    return { ok: false, error: "room-full" };
  }

  return {
    ok: true,
    room: { ...room, members: [...room.members, member], lastActivityAt: now },
  };
}

/** Card ids are regenerated per import, so identity is the Spotify URL, else the ISRC, else title|artists. */
export function playedKey(card: Card): string {
  return (
    card.spotifyUrl ??
    card.isrc ??
    `${normalizeTitle(card.title)}|${card.artists.map(normalizeTitle).join(",")}`
  );
}

/** The deck the room plays: the imported playlist, else the default deck. */
export function deckOf(lobby: Lobby): ImportedPlaylist {
  return lobby.source === "playlist" && lobby.deck ? lobby.deck : DEFAULT_DECK;
}

/** The owner's list, else every genre a current member voted for, in the lobby's order. */
export function effectiveGenres(room: Room): number[] {
  const { ownerGenres, genreVotes } = room.lobby;
  if (ownerGenres) return ownerGenres;
  const voted = new Set(room.members.flatMap((m) => genreVotes[m.id] ?? []));
  return HITLINE_GENRES.map((g) => g.id).filter((id) => voted.has(id));
}

/**
 * Where the next game draws from: the genre catalog narrowed to the listed genres, or the
 * room's deck. `genres` is set only for a genre game; no listed genre plays the Baralho da galera.
 */
export function sourceCards(
  room: Room,
  catalog: CatalogCard[],
): { cards: Card[]; genres: number[] | null } {
  const { lobby } = room;
  if (lobby.source !== "genres") return { cards: deckOf(lobby).cards, genres: null };
  const genres = effectiveGenres(room);
  if (genres.length === 0) return { cards: DEFAULT_DECK.cards, genres: null };
  const listed = new Set(genres);
  return { cards: catalog.filter((card) => listed.has(card.genre)), genres };
}

/** Cards the next game can draw: the source minus what this room already played. */
export function playablePool(room: Room, catalog: CatalogCard[]): Card[] {
  const played = new Set(room.lobby.played);
  return inDecades(sourceCards(room, catalog).cards, room.lobby.decades).filter(
    (card) => !played.has(playedKey(card)),
  );
}

/**
 * Every card that left the deck (dealt, drawn, skipped, bought, audio-missing) counts as played.
 * A game remembers the cards it started with (`startKeys`), so a sampled catalog deck never marks
 * the rest of the catalog as played. Idempotent, so it runs both on reset and on a start straight
 * from a finished game.
 */
export function foldPlayed(room: Room): Room {
  const { game, lobby } = room;
  if (game?.type !== "hitline") return room;
  const played = new Set(lobby.played);
  if (game.startKeys) {
    const inDeck = new Set(game.state.deck.map(playedKey));
    for (const key of game.startKeys) if (!inDeck.has(key)) played.add(key);
  } else {
    // Games saved before sampled decks started with the room's whole deck.
    const inDeck = new Set(game.state.deck.map((card) => card.id));
    for (const card of deckOf(lobby).cards) if (!inDeck.has(card.id)) played.add(playedKey(card));
  }
  return { ...room, lobby: { ...lobby, played: [...played] } };
}

/** Appends a new game's colors to the room's memory and keeps the newest MAX_COLORS. Call it once per game. */
export function foldColors(room: Room, colors: Hsb[]): Room {
  const kept = [...(room.lobby.colors ?? []), ...colors].slice(-MAX_COLORS);
  return { ...room, lobby: { ...room.lobby, colors: kept } };
}

/**
 * Adds the cards a finished Taleclue game dealt to the room's memory. Idempotent, so it runs on
 * reset, on import and on a start straight from a finished game.
 */
export function foldTaleclueUsed(room: Room): Room {
  const { game, lobby } = room;
  if (game?.type !== "taleclue") return room;
  const used = new Set([...(lobby.taleclueUsed ?? []), ...game.state.used]);
  return { ...room, lobby: { ...lobby, taleclueUsed: [...used] } };
}

export function isOnline(member: Member): boolean {
  return member.connections > 0;
}

const byJoinedAt = (a: Member, b: Member) => a.joinedAt - b.joinedAt;

/** Earliest online member by joinedAt, excluding `exceptId`. */
function nextOnline(members: Member[], exceptId: string): Member | undefined {
  return members.filter((m) => m.id !== exceptId && isOnline(m)).sort(byJoinedAt)[0];
}

export function transferOwnershipIfAway(
  room: Room,
  now: number,
): { room: Room; newOwnerId: string | null } {
  const owner = room.members.find((m) => m.id === room.ownerId);
  if (!owner || owner.offlineSince === null || now - owner.offlineSince < OWNER_GRACE_MS) {
    return { room, newOwnerId: null };
  }
  const heir = nextOnline(room.members, owner.id);
  if (!heir) return { room, newOwnerId: null };
  return { room: { ...room, ownerId: heir.id }, newOwnerId: heir.id };
}

export function kick(room: Room, actorId: string, targetId: string): RoomResult {
  if (actorId !== room.ownerId) return { ok: false, error: "not-owner" };
  if (targetId === actorId || !room.members.some((m) => m.id === targetId)) {
    return { ok: false, error: "invalid-target" };
  }
  return { ok: true, room: { ...room, members: room.members.filter((m) => m.id !== targetId) } };
}

export function leave(room: Room, memberId: string): Room {
  const members = room.members.filter((m) => m.id !== memberId);
  if (room.ownerId !== memberId) return { ...room, members };
  const heir = nextOnline(members, memberId) ?? [...members].sort(byJoinedAt)[0];
  return { ...room, members, ownerId: heir?.id ?? room.ownerId };
}

/** When the room next needs a tick (owner handover or game deadline), or null. */
export function roomDeadline(room: Room): number | null {
  const owner = room.members.find((m) => m.id === room.ownerId);
  const handover =
    !owner || owner.offlineSince === null || !nextOnline(room.members, owner.id)
      ? null
      : owner.offlineSince + OWNER_GRACE_MS;
  const game = room.game ? gameDeadline(room.game) : null;
  if (handover === null) return game;
  return game === null ? handover : Math.min(handover, game);
}

/** Applies every time-driven change that is due. `system` are chat texts the caller must announce. */
export function tickRoom(room: Room, now: number): { room: Room; system: string[] } {
  const transfer = transferOwnershipIfAway(room, now);
  const system: string[] = [];
  const heir = transfer.room.members.find((m) => m.id === transfer.newOwnerId);
  if (heir) system.push(`${heir.name} agora é o dono da sala`);
  return { room: transfer.room, system };
}
