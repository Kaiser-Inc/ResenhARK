import { type Ack, type ErrorCode, type GameEvent, SOCKET_EVENTS } from "@resenhark/shared";
import type { Server } from "socket.io";
import { systemMessage } from "../domain/room/chat.js";
import { type Room, roomDeadline, tickRoom } from "../domain/room/room.js";
import type { RoomStore } from "../repositories/room-store.js";
import { projectRoom } from "./project-room.js";

export type MutationResult =
  | {
      ok: true;
      room: Room;
      events?: GameEvent[];
      // Chat texts announced as system messages.
      system?: string[];
    }
  | { ok: false; error: ErrorCode };

export const socketRoom = (code: string) => `room:${code}`;

export class RoomHub {
  // ponytail: per-room promise queue in memory; a second API instance needs a Redis lock and the Socket.IO Redis adapter.
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly timers = new Map<string, { timer: NodeJS.Timeout; deadline: number }>();

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

  /** (Re)arms the room's timer for its next deadline; the tick itself runs inside mutate. */
  schedule(code: string, room: Room): void {
    const previous = this.timers.get(code);
    if (previous) clearTimeout(previous.timer);
    const deadline = roomDeadline(room);
    if (deadline === null) {
      this.timers.delete(code);
      return;
    }
    const timer = setTimeout(
      () => void this.fire(code).catch(this.deps.onError),
      Math.max(0, deadline - this.deps.now()),
    );
    timer.unref();
    this.timers.set(code, { timer, deadline });
  }

  /** Test hook: ticks every room whose deadline is due on the injected clock, without sleeping. */
  async runDueTimers(): Promise<void> {
    const due = [...this.timers].filter(([, { deadline }]) => deadline <= this.deps.now());
    await Promise.all(due.map(([code]) => this.fire(code)));
  }

  dispose(): void {
    for (const { timer } of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

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
      // Kicked or departed members stay connected until the gateway drops them: show them nothing.
      if (!room.members.some((m) => m.id === socket.data.memberId)) continue;
      socket.emit(SOCKET_EVENTS.state, {
        room: projectRoom(room, socket.data.memberId, this.deps.now()),
        events,
      });
    }
  }

  private async fire(code: string): Promise<void> {
    this.timers.delete(code);
    // Tick-only mutation: the tick runs before fn.
    await this.mutate(code, (room) => ({ ok: true, room }));
  }

  private async run(
    code: string,
    fn: (room: Room) => Promise<MutationResult> | MutationResult,
  ): Promise<Ack> {
    const { store, now } = this.deps;
    const loaded = await store.load(code);
    if (!loaded) {
      this.timers.delete(code);
      return { ok: false, error: "room-not-found" };
    }
    const ticked = tickRoom(loaded, now());
    const result = await fn(ticked.room);
    if (!result.ok) {
      // The tick is time passing, not part of the intent: keep it even when the intent fails.
      if (ticked.room !== loaded) await this.commit(ticked.room, [], ticked.system);
      return result;
    }
    await this.commit(result.room, result.events ?? [], [
      ...ticked.system,
      ...(result.system ?? []),
    ]);
    return { ok: true };
  }

  private async commit(room: Room, events: GameEvent[], system: string[]): Promise<void> {
    const { store, io, now, newId } = this.deps;
    await store.save(room);
    this.schedule(room.code, room);
    // Commit boundary: the room is saved, so the mutation succeeded whatever happens next.
    try {
      for (const text of system) {
        const message = systemMessage(text, newId(), now());
        await store.appendChat(room.code, message);
        io.to(socketRoom(room.code)).emit(SOCKET_EVENTS.chatMessage, message);
      }
      await store.touch(room.code);
      await this.broadcast(room.code, room, events);
    } catch (err) {
      this.deps.onError?.(err);
    }
  }
}
