"use client";

import type { HitlineView, MemberView } from "@resenhark/shared";
import { ChevronDownIcon } from "lucide-react";
import { animate, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { MemberAvatar, expressionFor } from "@/components/avatar/member-avatar";
import { CARD_MOTION, FADE, SCORE_DELAY, useReduced } from "@/components/hitline/motion";
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
      initial={{ opacity: 0 }}
      animate={
        reduce
          ? { opacity: [0, 1, 1, 0] }
          : { opacity: [0, 1, 1, 0], transform: ["translateY(0px)", "translateY(-12px)"] }
      }
      transition={{ duration: 0.46, delay: reduce ? 0 : SCORE_DELAY, ease: CARD_MOTION.ease }}
    >
      +1
    </motion.span>
  );
}

function CardCount({ count, target }: { count: number; target: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(count);
  const reduce = useReduced();
  useEffect(() => {
    const changed = count !== previous.current;
    const increased = count > previous.current;
    previous.current = count;
    if (!changed || !node.current) return;
    const animation = animate(
      node.current,
      reduce
        ? { opacity: [0.5, 1] }
        : {
            opacity: [0.5, 1],
            transform: ["translateY(4px) scale(1.08)", "translateY(0px) scale(1)"],
          },
      reduce ? FADE : { ...CARD_MOTION, delay: increased ? SCORE_DELAY : 0 },
    );
    return () => {
      animation.stop();
      if (node.current) {
        node.current.style.transform = "none";
        node.current.style.opacity = "1";
      }
    };
  }, [count, reduce]);
  return (
    <span ref={node} data-motion="card-count" className="inline-block">
      {count}/{target}
    </span>
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
                  <CardCount count={player.timeline.length} target={view.config.targetCards} />
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
