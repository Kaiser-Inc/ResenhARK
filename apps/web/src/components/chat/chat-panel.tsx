"use client";

import type { Ack, ChatMessage } from "@resenhark/shared";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatThread } from "@/components/chat/chat-thread";

type Props = {
  messages: ChatMessage[];
  loading: boolean;
  /** False while the connection is down: the composer waits for the reconnection. */
  connected: boolean;
  send: (event: string, payload?: unknown) => Promise<Ack>;
};

export function ChatPanel({ messages, loading, connected, send }: Props) {
  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col">
      <ChatThread messages={messages} loading={loading} />
      <ChatComposer disabled={!connected} onSend={(text) => send("chat:send", { text })} />
    </section>
  );
}
