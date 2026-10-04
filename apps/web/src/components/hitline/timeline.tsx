"use client";

import type { MemberView, PublicCard } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { Fragment, useRef } from "react";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { cn } from "@/lib/utils";

/** A gap someone already holds: the guess or a contest. Shown with who, never clickable. */
export type TakenGap = { slot: number; member: MemberView | undefined; text: string };

type TimelineProps = {
  ownerName: string;
  cards: PublicCard[];
  /** Gaps are only buttons for the turn player while guessing. */
  interactive: boolean;
  selectedSlot: number | null;
  onSelect: (slot: number) => void;
  taken?: TakenGap[];
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
  onSelect,
  taken = [],
}: TimelineProps) {
  const listRef = useRef<HTMLOListElement>(null);

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
        <li key={`gap-${slot}`}>
          <div
            title={held.text}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-solid border-border-strong bg-secondary px-3 text-sm"
          >
            {held.member ? (
              <MemberAvatar name={held.member.name} avatar={held.member.avatar} size={24} />
            ) : null}
            <span className="min-w-0 truncate">{held.text}</span>
          </div>
        </li>
      );
    }
    return (
      <li key={`gap-${slot}`}>
        <button
          type="button"
          data-gap
          disabled={!interactive}
          tabIndex={interactive ? 0 : -1}
          aria-pressed={selectedSlot === slot}
          onClick={() => onSelect(slot)}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-dashed px-3 text-sm transition-colors duration-[120ms] ease-out outline-hidden enabled:hover:bg-accent disabled:cursor-default focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
            interactive
              ? "border-border-strong text-foreground"
              : "border-border text-muted-foreground",
            selectedSlot === slot && "border-solid border-primary-text text-primary-text",
          )}
        >
          {selectedSlot === slot ? (
            <CheckIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
          ) : null}
          {gapLabel(cards, slot)}
        </button>
      </li>
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
      {cards.map((card, index) => (
        <Fragment key={card.id}>
          <li className="flex items-baseline gap-4 py-1">
            <span className="w-[72px] shrink-0 font-mono text-2xl leading-7 font-semibold">
              {card.year}
            </span>
            <span
              title={`${card.title} · ${card.artists.join(", ")}`}
              className="min-w-0 truncate text-sm leading-[22px] text-muted-foreground"
            >
              {card.title} · {card.artists.join(", ")}
            </span>
          </li>
          {gap(index + 1)}
        </Fragment>
      ))}
    </ol>
  );
}
