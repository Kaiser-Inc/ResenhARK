import { type Ack, type ErrorCode, type GameEvent, SOCKET_EVENTS } from "@resenhark/shared";
import type { Server } from "socket.io";
import type { Room } from "../domain/room/room.js";
import type { RoomStore } from "../repositories/room-store.js";
import { projectRoom } from "./project-room.js";

export type MutationResult =
  | { ok: true; room: Room; events?: GameEvent[] }
  | { ok: false; error: ErrorCode };

export const socketRoom = (code: string) => `room:${code}`;

export class RoomHub {
  // ponytail: per-room promise queue in memory; a second API instance needs a Redis lock and the Socket.IO Redis adapter.
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly deps: {
      store: RoomStore;
      io: Server;
      now: () => number;
      rng: () => number;
      newId: () => string;
      /** Receives post-commit delivery failures (touch/broadcast). */
      onError?: (err: unknown) => void;
    },
  ) {}

  /** Runs fn inside the room's queue: load, fn, save, broadcast. */
  mutate(code: string, fn: (room: Room) => Promise<MutationResult> | MutationResult): Promise<Ack> {
    const run = (this.queues.get(code) ?? Promise.resolve()).then(() => this.run(code, fn));
    // A failed mutation must not poison the queue for the next one.
    const tail = run.catch(() => undefined);
    this.queues.set(code, tail);
    void tail.then(() => {
      if (this.queues.get(code) === tail) this.queues.delete(code);
    });
    return run;
  }

  async broadcast(code: string, room: Room, events: GameEvent[]): Promise<void> {
    const sockets = await this.deps.io.in(socketRoom(code)).fetchSockets();
    for (const socket of sockets) {
      socket.emit(SOCKET_EVENTS.state, {
        room: projectRoom(room, socket.data.memberId, this.deps.now()),
        events,
      });
    }
  }

  private async run(
    code: string,
    fn: (room: Room) => Promise<MutationResult> | MutationResult,
  ): Promise<Ack> {
    const { store } = this.deps;
    const room = await store.load(code);
    if (!room) return { ok: false, error: "room-not-found" };
    const result = await fn(room);
    if (!result.ok) return result;
    await store.save(result.room);
    // Commit boundary: the room is saved, so the mutation succeeded whatever happens next.
    try {
      await store.touch(code);
      await this.broadcast(code, result.room, result.events ?? []);
    } catch (err) {
      this.deps.onError?.(err);
    }
    return { ok: true };
  }
}
