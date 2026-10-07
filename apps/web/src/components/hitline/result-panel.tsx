"use client";

import type { Ack, HitlineView, MemberView } from "@resenhark/shared";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar, expressionFor } from "@/components/avatar/member-avatar";
import { fireConfetti } from "@/components/hitline/confetti";
import { FADE, SPRING, useReduced } from "@/components/hitline/motion";
import { TimelineCards, useTimelineHighlight } from "@/components/hitline/timeline-card-row";
import { Button } from "@/components/ui/button";
import { gameErrorMessage } from "@/lib/game-errors";
import { timelineHighlightFor } from "@/lib/timeline-highlight";

const REASONS: Record<NonNullable<HitlineView["endReason"]>, string> = {
  target: "Chegou ao número de cartas para vencer.",
  "deck-empty": "Fim da pilha: as cartas acabaram.",
  ended: "Partida encerrada pelo dono.",
};

type ResultPanelProps = {
  view: HitlineView;
  members: MemberView[];
  isOwner: boolean;
  onNewGame: () => Promise<Ack>;
  /** True only when the game-over event just arrived (not on a reload into a finished game). */
  celebrate: boolean;
};

export function ResultPanel({ view, members, isOwner, onNewGame, celebrate }: ResultPanelProps) {
  const [loading, setLoading] = useState(false);
  const reduce = useReduced();
  const flashId = useTimelineHighlight(view.lastReveal?.card.id ?? null);
  // One burst when the result appears; skipped entirely under reduced motion.
  const fired = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once per mount
  useEffect(() => {
    if (fired.current) return; // dev StrictMode runs effects twice
    fired.current = true;
    if (celebrate && !reduce && view.winners.length > 0) fireConfetti();
  }, []);
  async function newGame() {
    setLoading(true);
    const ack = await onNewGame();
    setLoading(false);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error));
  }
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Alguém";
  const standings = [...view.players].sort((a, b) => b.timeline.length - a.timeline.length);
  return (
    <section aria-label="Resultado" className="flex flex-col gap-4">
      {view.winners.length > 0 ? (
        <motion.div
          data-motion="winner"
          className="flex gap-3"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={reduce ? FADE : SPRING}
        >
          {view.winners.map((id) => {
            const member = members.find((m) => m.id === id);
            return member ? (
              <MemberAvatar
                key={id}
                name={member.name}
                avatar={member.avatar}
                size={96}
                expression={expressionFor(id, view)}
                animate
              />
            ) : null;
          })}
        </motion.div>
      ) : null}
      <h2 className="text-[28px] leading-8 font-semibold tracking-[-0.03em]">
        {view.winners.length === 0
          ? "Sem vencedor"
          : `${view.winners.map(name).join(" e ")} ${view.winners.length > 1 ? "venceram" : "venceu"}`}
      </h2>
      {view.endReason ? (
        <p className="text-sm text-muted-foreground">{REASONS[view.endReason]}</p>
      ) : null}
      {view.endReason === "deck-empty" ? (
        <p className="text-sm text-muted-foreground">
          Desempate: mais cartas, depois mais fichas. Se continuar empatado, a vitória é dividida.
        </p>
      ) : null}
      <ol className="flex flex-col gap-6 text-sm" aria-label="Placar final">
        {standings.map((player) => (
          <li key={player.id} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">{name(player.id)}</span>
              <span className="font-mono tabular-nums">
                <span className="sr-only">cartas </span>
                {player.timeline.length}/{view.config.targetCards}
              </span>
              <span className="w-16 text-right text-muted-foreground">
                {player.tokens} {player.tokens === 1 ? "ficha" : "fichas"}
              </span>
            </div>
            <TimelineCards
              cards={player.timeline}
              ownerName={name(player.id)}
              highlightedCardId={timelineHighlightFor(view.lastReveal, player.id, flashId)}
            />
          </li>
        ))}
      </ol>
      {isOwner ? (
        <div>
          <Button type="button" loading={loading} onClick={() => void newGame()}>
            Outra rodada
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aguardando o dono</p>
      )}
    </section>
  );
}
