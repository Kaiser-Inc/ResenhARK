"use client";

import type { MemberView, PublicCard } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import { Fragment, useEffect, useRef, useState } from "react";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { FADE, SPRING, useReduced } from "@/components/hitline/motion";
import { cn } from "@/lib/utils";

/** A gap someone already holds: the guess or a contest. Shown with who, never clickable. */
export type TakenGap = { slot: number; member: MemberView | undefined; text: string };

type TimelineProps = {
  ownerName: string;
  cards: PublicCard[];
  /** Gaps are only buttons for the turn player while guessing. */
  interactive: boolean;
  selectedSlot: number | null;
  /** Gaps are a pick (aria-pressed) when guessing, a one-shot action when contesting. */
  selectable?: boolean;
  onSelect: (slot: number) => void;
  taken?: TakenGap[];
  /** The card that just landed on this timeline: its row gets the accent background for 1 s. */
  highlightCardId?: string | null;
};

function gapLabel(cards: PublicCard[], slot: number): string {
  if (cards.length === 0) return "Inserir aqui";
  if (slot === 0) return `Inserir antes de ${cards[0].year}`;
  if (slot === cards.length) return `Inserir depois de ${cards[slot - 1].year}`;
  return `Inserir entre ${cards[slot - 1].year} e ${cards[slot].year}`;
}

export function Timeline({
  ownerName,
  cards,
  interactive,
  selectedSlot,
  selectable = true,
  onSelect,
  taken = [],
  highlightCardId = null,
}: TimelineProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const reduce = useReduced();
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightCardId) {
      setFlashId(null);
      return;
    }
    setFlashId(highlightCardId);
    const id = setTimeout(() => setFlashId(null), 1000);
    return () => clearTimeout(id);
  }, [highlightCardId]);
  // Items shift into place when the ghost opens a gap; a fade-only world has no layout movement.
  const layout = reduce ? false : "position";
  const ghost = (slot: number) =>
    selectedSlot === slot && !taken.some((t) => t.slot === slot) ? (
      <motion.li
        key={`ghost-${slot}`}
        layout={layout}
        aria-hidden="true"
        data-motion="ghost"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={reduce ? FADE : SPRING}
        className="flex h-10 items-center justify-center rounded-md border border-dashed border-border-strong font-mono text-lg font-semibold text-primary-text"
      >
        ?
      </motion.li>
    ) : null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const gaps = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-gap]:not(:disabled)") ?? [],
    );
    const at = gaps.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    gaps[
      Math.max(0, Math.min(gaps.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))
    ]?.focus();
  }

  const gap = (slot: number) => {
    const held = taken.find((t) => t.slot === slot);
    if (held) {
      return (
        <motion.li key={`gap-${slot}`} layout={layout}>
          <div
            title={held.text}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-solid border-border-strong bg-secondary px-3 text-sm"
          >
            {held.member ? (
              <motion.span
                data-motion="contester"
                className="inline-flex"
                initial={reduce ? { opacity: 0 } : { scale: 0.6 }}
                animate={reduce ? { opacity: 1 } : { scale: 1 }}
                transition={reduce ? FADE : SPRING}
              >
                <MemberAvatar name={held.member.name} avatar={held.member.avatar} size={24} />
              </motion.span>
            ) : null}
            <span className="min-w-0 truncate">{held.text}</span>
          </div>
        </motion.li>
      );
    }
    if (!interactive) {
      // Display only: no disabled button without a reason, same 32 px rhythm.
      return (
        <motion.li key={`gap-${slot}`} layout={layout} aria-hidden="true">
          <div className="flex h-8 w-full items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
            {gapLabel(cards, slot)}
          </div>
        </motion.li>
      );
    }
    return (
      <motion.li key={`gap-${slot}`} layout={layout}>
        <button
          type="button"
          data-gap
          aria-pressed={selectable ? selectedSlot === slot : undefined}
          onClick={() => onSelect(slot)}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-dashed px-3 text-sm transition-colors duration-[120ms] ease-out outline-hidden hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
            "border-border-strong text-foreground",
            selectedSlot === slot && "border-solid border-primary-text text-primary-text",
          )}
        >
          {selectedSlot === slot ? (
            <CheckIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
          ) : null}
          {gapLabel(cards, slot)}
        </button>
      </motion.li>
    );
  };

  return (
    <ol
      ref={listRef}
      aria-label={`Timeline de ${ownerName}`}
      onKeyDown={onKeyDown}
      // scrollable region must be keyboard-reachable; when interactive the gap buttons are the tab stops
      tabIndex={interactive ? undefined : 0}
      className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto"
    >
      {gap(0)}
      {ghost(0)}
      {cards.map((card, index) => (
        <Fragment key={card.id}>
          <motion.li
            layout={layout}
            className={cn(
              "flex items-baseline gap-4 rounded-md py-1 transition-colors duration-[400ms] ease-out",
              flashId === card.id && "bg-accent",
            )}
          >
            <span className="w-[72px] shrink-0 font-mono text-2xl leading-7 font-semibold">
              {card.year}
            </span>
            <span
              title={`${card.title} · ${card.artists.join(", ")}`}
              className="min-w-0 truncate text-sm leading-[22px] text-muted-foreground"
            >
              {card.title} · {card.artists.join(", ")}
            </span>
          </motion.li>
          {gap(index + 1)}
          {ghost(index + 1)}
        </Fragment>
      ))}
    </ol>
  );
}
