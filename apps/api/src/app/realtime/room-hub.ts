import { type Ack, type ErrorCode, type GameEvent, SOCKET_EVENTS } from "@resenhark/shared";
import type { Server } from "socket.io";
import { systemMessage } from "../domain/room/chat.js";
import { type Room, roomDeadline, tickRoom } from "../domain/room/room.js";
import { type Card, SYSTEM_ACTOR, apply, tick } from "../games/hitline/engine.js";
import type { AudioPreviewSource } from "../gateways/ports/audio-preview-source.js";
import type { RoomStore } from "../repositories/room-store.js";
import { projectRoom } from "./project-room.js";

export type MutationResult =
  | {
      ok: true;
      room: Room;
      events?: GameEvent[];
      /** Consecutive missing previews so far; set only by the audio loop. */
      audioMisses?: number;
      // Chat texts announced as system messages.
      system?: string[];
    }
  | { ok: false; error: ErrorCode };

/** Consecutive cards without a preview tolerated before the game ends. */
export const MAX_AUDIO_MISSES = 10;

export const socketRoom = (code: string) => `room:${code}`;

export class RoomHub {
  // ponytail: per-room promise queue in memory; a second API instance needs a Redis lock and the Socket.IO Redis adapter.
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly timers = new Map<string, { timer: NodeJS.Timeout; deadline: number }>();

  constructor(
    private readonly deps: {
      store: RoomStore;
      io: Server;
      audio: AudioPreviewSource;
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

  /** Boot: re-arms the timer of every stored room that has a pending deadline. */
  async rehydrate(): Promise<void> {
    for (const code of await this.deps.store.listCodes()) {
      const room = await this.deps.store.load(code);
      if (room) this.schedule(code, room);
    }
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
    const ticked = this.tickGame(tickRoom(loaded, now()));
    const result = await fn(ticked.room);
    if (!result.ok) {
      // The tick is time passing, not part of the intent: keep it even when the intent fails.
      if (ticked.room !== loaded) await this.commit(ticked.room, ticked.events, ticked.system);
      return result;
    }
    const events = [...ticked.events, ...(result.events ?? [])];
    await this.commit(result.room, events, [
      ...ticked.system,
      ...(result.system ?? []),
      ...winnerAnnouncements(result.room, events),
    ]);
    this.watchAudio(result.room, events, result.audioMisses ?? 0);
    return { ok: true };
  }

  /** Runs the game's due deadlines; decides by state, so a stale timer is a no-op. */
  private tickGame(ticked: { room: Room; system: string[] }): {
    room: Room;
    system: string[];
    events: GameEvent[];
  } {
    const game = ticked.room.game;
    if (!game || game.state.phase === "game-over") return { ...ticked, events: [] };
    const { now, rng, newId } = this.deps;
    const result = tick(game.state, { now: now(), rng, newId });
    // Every tick transition emits an event; none means nothing was due.
    if (result.events.length === 0) return { ...ticked, events: [] };
    return {
      ...ticked,
      room: { ...ticked.room, game: { ...game, state: result.state } },
      events: result.events,
    };
  }

  /** After a card-drawn, looks for its preview outside the queue; fire and forget. */
  private watchAudio(room: Room, events: GameEvent[], misses: number): void {
    let drawn: string | null = null;
    for (const e of events) if (e.type === "card-drawn") drawn = e.drawId;
    const draw = room.game?.state.draw;
    if (!drawn || !draw || draw.id !== drawn) return;
    void this.checkAudio(room.code, draw, misses).catch(this.deps.onError);
  }

  private async checkAudio(
    code: string,
    draw: { id: string; card: Card },
    misses: number,
  ): Promise<void> {
    // A provider failure is not proof of a missing preview: leave the card in play.
    const url = await this.deps.audio.findPreviewUrl(draw.card).catch((err) => {
      this.deps.onError?.(err);
      return "error";
    });
    if (url) return;
    await this.mutate(code, (room) => {
      const game = room.game;
      // The draw moved on (skip, timeout, end) while the lookup ran.
      if (!game || game.state.draw?.id !== draw.id) return { ok: false, error: "wrong-phase" };
      const { now, rng, newId } = this.deps;
      const result = apply(
        game.state,
        SYSTEM_ACTOR,
        { type: "audio-missing", giveUp: misses >= MAX_AUDIO_MISSES },
        { now: now(), rng, newId },
      );
      if (!result.ok) return result;
      return {
        ok: true,
        room: { ...room, game: { ...game, state: result.state } },
        events: result.events,
        audioMisses: misses + 1,
      };
    });
  }

  private async commit(room: Room, events: GameEvent[], system: string[]): Promise<void> {
    const { store, io, now, newId } = this.deps;
    // Indexed before the save and not best-effort: a persisted draw without its index would 404 its audio.
    // ponytail: separate write, not the same MULTI; a stray index for an unsaved draw is harmless.
    for (const event of events) {
      if (event.type === "card-drawn") await store.indexDraw(event.drawId, room.code);
    }
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

/** "Ana venceu" / "Ana e Bia venceram" for a game-over with winners still in the room. */
function winnerAnnouncements(room: Room, events: GameEvent[]): string[] {
  const over = events.find((e) => e.type === "game-over");
  if (!over) return [];
  const names = over.winners
    .map((id) => room.members.find((m) => m.id === id)?.name)
    .filter((name): name is string => !!name);
  if (names.length === 0) return [];
  return [`${names.join(", ")} ${names.length === 1 ? "venceu" : "venceram"}`];
}
