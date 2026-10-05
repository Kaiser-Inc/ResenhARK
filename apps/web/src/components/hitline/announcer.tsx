"use client";

import type { GameEvent, HitlineView, MemberView, RevealView } from "@resenhark/shared";
import { useEffect, useRef, useState } from "react";

import { secondsLeft } from "@/components/hitline/countdown";
import type { ServerClock } from "@/lib/server-clock";

type AnnouncerProps = {
  events: GameEvent[];
  view: HitlineView;
  members: MemberView[];
  you: string;
  clock: ServerClock;
};

/**
 * The only live region of the game: phase, turn, contest and reveal changes are spoken here once.
 * Everything else on the board (status strip, reveal panel) is plain text, or it would be read twice.
 */
export function Announcer({ events, view, members, you, clock }: AnnouncerProps) {
  const [text, setText] = useState("");
  const lastTurn = useRef<string | undefined>(undefined);
  const turnId = view.turnPlayerId;
  // The deadline is reset at every turn start, so it changes even when the same player plays again (solo).
  const turnMarker = `${turnId}:${view.turnDeadline}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new payload (events) or a new turn speaks
  useEffect(() => {
    const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Alguém";
    const taker = (r: RevealView) =>
      r.receiverId && r.receiverId !== r.turnPlayerId
        ? `, ${name(r.receiverId)} levou a carta`
        : "";
    const phrases: string[] = [];
    for (const e of events) {
      if (e.type === "contest-opened")
        phrases.push(`Contestação aberta, ${secondsLeft(e.deadline, clock)} segundos`);
      else if (e.type === "contested") phrases.push(`${name(e.playerId)} contestou`);
      else if (e.type === "card-revealed") {
        const { card, guess } = e.reveal;
        const outcome = !guess ? "ficou sem tempo" : guess.correct ? "acertou" : "errou";
        phrases.push(
          `Carta virada: ${card.year}, ${card.title}, ${card.artists.join(", ")}. ${name(e.reveal.turnPlayerId)} ${outcome}${taker(e.reveal)}`,
        );
      } else if (e.type === "game-over" && e.winners.length > 0)
        phrases.push(
          `${e.winners.map(name).join(" e ")} ${e.winners.length > 1 ? "venceram" : "venceu"}`,
        );
    }
    const turnChanged = lastTurn.current !== turnMarker;
    // On a reload there is no event and nothing changed for the listener: stay quiet.
    const first = lastTurn.current === undefined;
    lastTurn.current = turnMarker;
    if (turnChanged && turnId && view.phase !== "game-over" && (!first || events.length > 0))
      phrases.push(turnId === you ? "Sua vez" : `Vez de ${name(turnId)}`);
    if (phrases.length > 0) setText(phrases.join(". "));
  }, [events, turnMarker]);

  return (
    <div aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}
