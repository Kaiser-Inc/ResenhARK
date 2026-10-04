import type { Redis } from "ioredis";
import type { Room } from "../domain/room/room.js";
import { ROOM_TTL_SECONDS, type RoomStore } from "./room-store.js";

const roomKey = (code: string) => `room:${code}`;
const chatKey = (code: string) => `chat:${code}`;
const sessionKey = (token: string) => `session:${token}`;
const memberSessionsKey = (code: string, memberId: string) => `member-sessions:${code}:${memberId}`;

export class RedisRoomStore implements RoomStore {
  constructor(readonly redis: Redis) {}

  async load(code: string): Promise<Room | null> {
    const raw = await this.redis.get(roomKey(code));
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async save(room: Room): Promise<void> {
    await this.redis.set(roomKey(room.code), JSON.stringify(room), "EX", ROOM_TTL_SECONDS);
  }

  async exists(code: string): Promise<boolean> {
    return (await this.redis.exists(roomKey(code))) === 1;
  }

  async createSession(token: string, code: string, memberId: string): Promise<void> {
    const setKey = memberSessionsKey(code, memberId);
    await this.redis
      .multi()
      .set(sessionKey(token), JSON.stringify({ code, memberId }), "EX", ROOM_TTL_SECONDS)
      .sadd(setKey, token)
      .expire(setKey, ROOM_TTL_SECONDS)
      .exec();
  }

  async resolveSession(token: string): Promise<{ code: string; memberId: string } | null> {
    const raw = await this.redis.get(sessionKey(token));
    return raw ? (JSON.parse(raw) as { code: string; memberId: string }) : null;
  }

  async revokeSession(token: string): Promise<void> {
    const session = await this.resolveSession(token);
    const tx = this.redis.multi().del(sessionKey(token));
    if (session) tx.srem(memberSessionsKey(session.code, session.memberId), token);
    await tx.exec();
  }

  async revokeMemberSessions(code: string, memberId: string): Promise<void> {
    const setKey = memberSessionsKey(code, memberId);
    const tokens = await this.redis.smembers(setKey);
    await this.redis
      .multi()
      .del(setKey, ...tokens.map(sessionKey))
      .exec();
  }

  async touch(code: string): Promise<void> {
    const tx = this.redis.multi().expire(roomKey(code), ROOM_TTL_SECONDS);
    tx.expire(chatKey(code), ROOM_TTL_SECONDS);
    // ponytail: SCAN over this room's member-session sets; fine at 20 members per room.
    for (const setKey of await this.scan(`member-sessions:${code}:*`)) {
      tx.expire(setKey, ROOM_TTL_SECONDS);
      for (const token of await this.redis.smembers(setKey)) {
        tx.expire(sessionKey(token), ROOM_TTL_SECONDS);
      }
    }
    await tx.exec();
  }

  private async scan(match: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.redis.scan(cursor, "MATCH", match, "COUNT", 100);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== "0");
    return keys;
  }
}
