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
  status: "connecting" | "connected" | "reconnecting" | "invalid-session" | "kicked";
  room: RoomView | null;
  /** Events of the latest state, for animations. */
  events: GameEvent[];
  /** Chat messages by time, deduped by id (a message can arrive both live and in the history). */
  chat: ChatMessage[];
  /** False until the server sent the history after connecting. */
  chatLoaded: boolean;
  /** Messages from others that arrived live while the chat was not visible. */
  unread: number;
  /** The layout tells whether the chat is on screen; showing it clears `unread`. */
  setChatVisible(visible: boolean): void;
  /** Server time, kept in sync with `room.serverNow`. */
  clock: ServerClock;
  send<T>(event: string, payload?: T): Promise<Ack>;
};

export function useRoom(code: string, sessionToken: string): RoomConnection {
  const [status, setStatus] = useState<RoomConnection["status"]>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [clock] = useState(createServerClock);
  const socketRef = useRef<Socket | null>(null);
  const seenChatIds = useRef(new Set<string>());
  const chatVisible = useRef(false);
  const youRef = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: code is only a reconnect key, the token identifies the room
  useEffect(() => {
    const socket = io(API_URL, { auth: { sessionToken }, transports: ["websocket"] });
    socketRef.current = socket;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let kicked = false;
    const seen = seenChatIds.current;

    socket.on(SOCKET_EVENTS.state, (payload: RoomStatePayload) => {
      youRef.current = payload.room.you;
      clock.sync(payload.room.serverNow);
      setRoom(payload.room);
      setEvents(payload.events);
      // "Connected" means resynced: the banner stays until the first state after a reconnect.
      setStatus("connected");
    });
    socket.on(SOCKET_EVENTS.chatHistory, (history: ChatMessage[]) => {
      const fresh = history.filter((m) => !seen.has(m.id) && seen.add(m.id));
      if (fresh.length) setChat((current) => [...current, ...fresh].sort((a, b) => a.at - b.at));
      setChatLoaded(true);
    });
    socket.on(SOCKET_EVENTS.chatMessage, (message: ChatMessage) => {
      if (seen.has(message.id)) return;
      seen.add(message.id);
      setChat((current) => [...current, message]);
      if (message.kind === "user" && message.memberId !== youRef.current && !chatVisible.current) {
        setUnread((n) => n + 1);
      }
    });
    // The server drops the socket right after; stop here so it does not try to come back.
    socket.on(SOCKET_EVENTS.kicked, () => {
      kicked = true;
      socket.disconnect();
      setStatus("kicked");
    });
    socket.on("disconnect", (reason) => {
      if (kicked) return;
      setStatus("reconnecting");
      // The server hung up (it only does so when the join failed): socket.io will not retry by itself.
      if (reason === "io server disconnect")
        retry = setTimeout(() => socket.connect(), SERVER_DROP_RETRY_MS);
    });
    socket.on("connect_error", (error) => {
      if (kicked) return;
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

  const setChatVisible = useCallback((visible: boolean) => {
    chatVisible.current = visible;
    if (visible) setUnread(0);
  }, []);

  return { status, room, events, chat, chatLoaded, unread, setChatVisible, clock, send };
}
