import type { Room } from "../domain/room/room.js";

export const ROOM_TTL_SECONDS = 6 * 60 * 60;

export interface RoomStore {
  load(code: string): Promise<Room | null>;
  save(room: Room): Promise<void>;
  exists(code: string): Promise<boolean>;
  createSession(token: string, code: string, memberId: string): Promise<void>;
  resolveSession(token: string): Promise<{ code: string; memberId: string } | null>;
  revokeSession(token: string): Promise<void>;
  revokeMemberSessions(code: string, memberId: string): Promise<void>;
  /** Renews the TTL of the room, its chat and its sessions. */
  touch(code: string): Promise<void>;
}
