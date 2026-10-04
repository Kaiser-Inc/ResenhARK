"use client";

import {
  type Ack,
  type ChatMessage,
  type GameEvent,
  type RoomStatePayload,
  type RoomView,
  SOCKET_EVENTS,
} from "@resenhark/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Socket, io } from "socket.io-client";

import { API_URL } from "@/lib/api";
import { type ServerClock, createServerClock } from "@/lib/server-clock";

const ACK_TIMEOUT_MS = 5000;
const SERVER_DROP_RETRY_MS = 1000;

export type RoomConnection = {
  status: "connecting" | "connected" | "reconnecting" | "invalid-session";
  room: RoomView | null;
  /** Events of the latest state, for animations. */
  events: GameEvent[];
  /** Filled in Task 9. */
  chat: ChatMessage[];
  /** Server time, kept in sync with `room.serverNow`. */
  clock: ServerClock;
  send<T>(event: string, payload?: T): Promise<Ack>;
};

export function useRoom(code: string, sessionToken: string): RoomConnection {
  const [status, setStatus] = useState<RoomConnection["status"]>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [chat] = useState<ChatMessage[]>([]);
  const [clock] = useState(createServerClock);
  const socketRef = useRef<Socket | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: code is only a reconnect key, the token identifies the room
  useEffect(() => {
    const socket = io(API_URL, { auth: { sessionToken }, transports: ["websocket"] });
    socketRef.current = socket;
    let retry: ReturnType<typeof setTimeout> | undefined;

    socket.on(SOCKET_EVENTS.state, (payload: RoomStatePayload) => {
      clock.sync(payload.room.serverNow);
      setRoom(payload.room);
      setEvents(payload.events);
      // "Connected" means resynced: the banner stays until the first state after a reconnect.
      setStatus("connected");
    });
    socket.on("disconnect", (reason) => {
      setStatus("reconnecting");
      // The server hung up (it only does so when the join failed): socket.io will not retry by itself.
      if (reason === "io server disconnect")
        retry = setTimeout(() => socket.connect(), SERVER_DROP_RETRY_MS);
    });
    socket.on("connect_error", (error) => {
      if (error.message === "invalid-session") {
        socket.disconnect();
        setStatus("invalid-session");
      } else {
        setStatus("reconnecting");
      }
    });

    return () => {
      clearTimeout(retry);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, sessionToken, clock]);

  const send = useCallback(async <T>(event: string, payload?: T): Promise<Ack> => {
    const socket = socketRef.current;
    // Never queue an action while offline: it would replay stale after the reconnect.
    if (!socket?.connected) return { ok: false, error: "timeout" };
    try {
      return (await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload)) as Ack;
    } catch {
      return { ok: false, error: "timeout" };
    }
  }, []);

  return { status, room, events, chat, clock, send };
}
