"use client";

import type { HitlineView, MemberView } from "@resenhark/shared";
import { ChevronDownIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { MemberAvatar, expressionFor } from "@/components/avatar/member-avatar";
import { useReduced } from "@/components/hitline/motion";
import { TimelineCards, useTimelineHighlight } from "@/components/hitline/timeline-card-row";
import { TokenStack } from "@/components/hitline/token-stack";
import { Badge } from "@/components/ui/badge";
import { timelineHighlightFor } from "@/lib/timeline-highlight";
import { cn } from "@/lib/utils";

type ScoreboardProps = {
  view: HitlineView;
  members: MemberView[];
};

/** "+1" that floats up and fades out next to a number that just grew. Decorative. */
function Gain() {
  const reduce = useReduced();
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute -top-3 right-0 font-mono text-xs font-semibold text-success"
      initial={reduce ? { opacity: 0 } : { opacity: 1, y: 0 }}
      animate={reduce ? { opacity: [0, 1, 1, 0] } : { opacity: [1, 1, 0], y: -14 }}
      transition={reduce ? { duration: 1 } : { duration: 1, ease: "easeOut" }}
    >
      +1
    </motion.span>
  );
}

export function Scoreboard({ view, members }: ScoreboardProps) {
  const [open, setOpen] = useState<string | null>(null);
  const reveal = view.lastReveal;
  const flashId = useTimelineHighlight(reveal?.card.id ?? null);
  return (
    <section aria-label="Placar">
      <ul className="flex flex-col">
        {view.players.map((player) => {
          const member = members.find((m) => m.id === player.id);
          if (!member) return null;
          const expanded = open === player.id;
          return (
            <li key={player.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : player.id)}
                className="flex min-h-10 w-full items-center gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors duration-[120ms] ease-out outline-hidden hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <MemberAvatar
                  name={member.name}
                  avatar={member.avatar}
                  size={32}
                  expression={expressionFor(player.id, view)}
                  className={cn(!player.online && "opacity-50")}
                />
                <span title={member.name} className="min-w-0 flex-1 truncate font-medium">
                  {member.name}
                </span>
                {player.online ? null : <Badge>offline</Badge>}
                <span className="relative font-mono tabular-nums">
                  <span className="sr-only">cartas </span>
                  {player.timeline.length}/{view.config.targetCards}
                  {reveal?.receiverId === player.id ? <Gain key={reveal.card.id} /> : null}
                </span>
                <span className="relative flex w-24 justify-end">
                  <TokenStack count={player.tokens} />
                  {reveal?.tokenAwarded && reveal.turnPlayerId === player.id ? (
                    <Gain key={reveal.card.id} />
                  ) : null}
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-[120ms] ease-out",
                    expanded && "rotate-180",
                  )}
                />
              </button>
              {expanded ? (
                <TimelineCards
                  cards={player.timeline}
                  ownerName={member.name}
                  highlightedCardId={timelineHighlightFor(reveal, player.id, flashId)}
                  className="pb-2 pl-11"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
