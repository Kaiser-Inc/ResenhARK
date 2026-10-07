"use client";

import type { PublicCard } from "@resenhark/shared";
import { type HTMLMotionProps, motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function useTimelineHighlight(cardId: string | null) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    setActiveId(cardId);
    if (!cardId) return;
    const timer = setTimeout(() => setActiveId(null), 1000);
    return () => clearTimeout(timer);
  }, [cardId]);
  return activeId === cardId ? activeId : null;
}

type TimelineCardRowProps = HTMLMotionProps<"li"> & {
  card: PublicCard;
  highlighted?: boolean;
};

export function TimelineCardRow({ card, highlighted, className, ...props }: TimelineCardRowProps) {
  const description = `${card.title} · ${card.artists.join(", ")}`;
  return (
    <motion.li
      {...props}
      data-card-id={card.id}
      data-motion="timeline-card"
      className={cn(
        "flex min-w-0 items-baseline gap-4 rounded-md py-1 transition-colors duration-[120ms] ease-out",
        highlighted && "bg-accent",
        className,
      )}
    >
      <span className="w-[72px] shrink-0 font-mono text-2xl leading-7 font-semibold">
        {card.year}
      </span>
      <span
        title={description}
        className="min-w-0 truncate text-sm leading-[22px] text-muted-foreground"
      >
        {description}
      </span>
    </motion.li>
  );
}

export function TimelineCards({
  cards,
  ownerName,
  highlightedCardId,
  className,
}: {
  cards: PublicCard[];
  ownerName: string;
  highlightedCardId?: string | null;
  className?: string;
}) {
  return (
    <ol
      aria-label={`Timeline de ${ownerName}`}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      {cards.length ? (
        cards.map((card) => (
          <TimelineCardRow
            key={card.id}
            card={card}
            highlighted={highlightedCardId === card.id}
            initial={false}
          />
        ))
      ) : (
        <li className="font-mono text-sm text-muted-foreground">Sem cartas</li>
      )}
    </ol>
  );
}
