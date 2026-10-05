"use client";

import type { GameEvent, HitlineView, MemberView } from "@resenhark/shared";
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
  const lastTurn = useRef<string | null | undefined>(undefined);
  const turnId = view.turnPlayerId;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new payload (events) or a new turn speaks
  useEffect(() => {
    const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Alguém";
    const phrases: string[] = [];
    for (const e of events) {
      if (e.type === "contest-opened")
        phrases.push(`Contestação aberta, ${secondsLeft(e.deadline, clock)} segundos`);
      else if (e.type === "contested") phrases.push(`${name(e.playerId)} contestou`);
      else if (e.type === "card-revealed") {
        const { card, guess } = e.reveal;
        const outcome = !guess ? "ficou sem tempo" : guess.correct ? "acertou" : "errou";
        phrases.push(
          `Carta virada: ${card.year}, ${card.title}, ${card.artists.join(", ")}. ${name(e.reveal.turnPlayerId)} ${outcome}`,
        );
      } else if (e.type === "game-over" && e.winners.length > 0)
        phrases.push(
          `${e.winners.map(name).join(" e ")} ${e.winners.length > 1 ? "venceram" : "venceu"}`,
        );
    }
    const turnChanged = lastTurn.current !== turnId;
    // On a reload there is no event and nothing changed for the listener: stay quiet.
    const first = lastTurn.current === undefined;
    lastTurn.current = turnId;
    if (turnChanged && turnId && view.phase !== "game-over" && (!first || events.length > 0))
      phrases.push(turnId === you ? "Sua vez" : `Vez de ${name(turnId)}`);
    if (phrases.length > 0) setText(phrases.join(". "));
  }, [events, turnId]);

  return (
    <div aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}
