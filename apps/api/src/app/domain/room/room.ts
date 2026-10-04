import {
  type Avatar,
  DEFAULT_HITLINE_CONFIG,
  type HitlineConfig,
  ROOM_CODE_ALPHABET,
  normalizeName,
} from "@resenhark/shared";

export type Member = {
  id: string;
  name: string;
  avatar: Avatar;
  joinedAt: number;
  connections: number;
  offlineSince: number | null;
};

export type Room = {
  code: string;
  ownerId: string;
  members: Member[];
  lastActivityAt: number;
  lobby: { config: HitlineConfig; deck: null };
  game: null;
};

export type RoomError =
  | "name-taken"
  | "room-full"
  | "not-owner"
  | "invalid-target"
  | "not-a-member";

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
    lobby: { config: DEFAULT_HITLINE_CONFIG, deck: null },
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

export function isOnline(member: Member): boolean {
  return member.connections > 0;
}
