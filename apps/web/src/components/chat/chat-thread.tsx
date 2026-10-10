"use client";

import type { ChatMessage } from "@resenhark/shared";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { linkify } from "@/components/chat/linkify";
import { FADE, useReduced } from "@/components/hitline/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type UserMessage = Extract<ChatMessage, { kind: "user" }>;
type Item =
  | { kind: "system"; message: ChatMessage }
  | { kind: "group"; first: UserMessage; messages: UserMessage[] };

// Followed messages from the same member share one avatar and one name.
function group(messages: ChatMessage[]): Item[] {
  const items: Item[] = [];
  for (const message of messages) {
    if (message.kind === "system") {
      items.push({ kind: "system", message });
      continue;
    }
    const previous = items.at(-1);
    if (previous?.kind === "group" && previous.first.memberId === message.memberId) {
      previous.messages.push(message);
    } else {
      items.push({ kind: "group", first: message, messages: [message] });
    }
  }
  return items;
}

const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const FOLLOW_THRESHOLD_PX = 80;

export function ChatSkeleton() {
  return (
    <section
      aria-label="Carregando chat"
      aria-busy="true"
      className="flex flex-col gap-4 px-4 py-4"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className={cn("h-4", i === 1 ? "w-3/4" : "w-1/2")} />
          </div>
        </div>
      ))}
    </section>
  );
}

export function ChatThread({ messages, loading }: { messages: ChatMessage[]; loading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follows the newest message unless the person scrolled up to read.
  const following = useRef(true);
  // Ids on screen when the history arrived: only later messages animate in.
  const known = useRef<Set<string> | null>(null);
  const reduce = useReduced();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroll follows the message count
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  // The container is 0 px tall while its tab or sheet is hidden: follow again when it shows up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the container only exists once loading is over
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!loading) known.current = new Set(messages.map((m) => m.id));
  }, [messages, loading]);

  if (loading) return <ChatSkeleton />;

  const isNew = (id: string) => known.current !== null && !known.current.has(id);
  // New message: 4 px up and fade in over 120 ms; opacity only when reduced.
  const enter = (id: string) => ({
    initial: isNew(id) ? (reduce ? { opacity: 0 } : { opacity: 0, y: 4 }) : (false as const),
    // Keep the target when another message renders before this entrance finishes.
    animate: reduce ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: FADE,
  });

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-label="Mensagens"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard focusable (axe scrollable-region-focusable)
      tabIndex={0}
      onScroll={(event) => {
        const el = event.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-3 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
    >
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {group(messages).map((item) =>
            item.kind === "system" ? (
              // System lines (joined, left) stay still: they are status, not conversation.
              <li key={item.message.id} className="py-1 text-center text-xs text-muted-foreground">
                {item.message.text}
              </li>
            ) : (
              <li key={item.first.id} className="flex gap-3">
                <span data-slot="chat-avatar" className="mt-0.5 shrink-0">
                  <MemberAvatar name={item.first.name} avatar={item.first.avatar} size={32} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <span title={item.first.name} className="min-w-0 truncate text-sm font-medium">
                      {item.first.name}
                    </span>
                    <time
                      dateTime={new Date(item.first.at).toISOString()}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {time.format(item.first.at)}
                    </time>
                  </div>
                  {item.messages.map((message) => (
                    <motion.p
                      key={message.id}
                      {...enter(message.id)}
                      className="text-sm leading-[22px] whitespace-pre-wrap [overflow-wrap:anywhere]"
                    >
                      {linkify(message.text)}
                    </motion.p>
                  ))}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
