import {
  type Avatar,
  DEFAULT_HITLINE_CONFIG,
  type HitlineConfig,
  ROOM_CODE_ALPHABET,
  normalizeName,
} from "@resenhark/shared";
import { type Card, type HitlineState, nextDeadline } from "../../games/hitline/engine.js";
import { normalizeTitle } from "../../games/hitline/normalize.js";
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
  config: HitlineConfig;
  deck: ImportedPlaylist | null;
  /** Stable keys (see playedKey) of every song already played in this room. */
  played: string[];
};
export type ActiveGame = { type: "hitline"; state: HitlineState; playerIds: string[] };

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
    lobby: { config: DEFAULT_HITLINE_CONFIG, deck: null, played: [] },
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

/** Deck cards not played yet in this room. */
export function unplayedCards(lobby: Lobby): Card[] {
  const played = new Set(lobby.played);
  return (lobby.deck?.cards ?? []).filter((card) => !played.has(playedKey(card)));
}

/**
 * Every card that left the deck (dealt, drawn, skipped, bought, audio-missing) counts as played.
 * Idempotent, so it runs both on reset and on a start straight from a finished game.
 */
export function foldPlayed(room: Room): Room {
  const { game, lobby } = room;
  if (!game || !lobby.deck) return room;
  const inDeck = new Set(game.state.deck.map((card) => card.id));
  const played = new Set(lobby.played);
  for (const card of lobby.deck.cards) if (!inDeck.has(card.id)) played.add(playedKey(card));
  return { ...room, lobby: { ...lobby, played: [...played] } };
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
  const game = room.game ? nextDeadline(room.game.state) : null;
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
