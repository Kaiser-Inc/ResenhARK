"use client";

import type { HitlineView } from "@resenhark/shared";
import { motion } from "motion/react";

import { FADE, SPRING, useReduced } from "@/components/hitline/motion";
import { SnippetPlayer } from "@/components/hitline/snippet-player";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BUY_COST, SKIP_COST, disabledReason } from "@/lib/error-messages";

export type Pending = "draw" | "lock" | "skip" | "buy" | "pass" | "contest";

type CardInPlayProps = {
  view: HitlineView;
  you: string;
  isTurn: boolean;
  connected: boolean;
  chosenSlot: number | null;
  pending: Pending | null;
  guessText: { title: string; artist: string };
  onGuessText: (next: { title: string; artist: string }) => void;
  onDraw: () => void;
  onLock: () => void;
  onSkip: () => void;
  onBuy: () => void;
  onPass: () => void;
};

/** A button that, when unavailable, says why right below it and points `aria-describedby` at that text. */
function ActionButton({
  id,
  reason,
  loading,
  variant,
  onClick,
  children,
}: {
  id: string;
  reason: string | null;
  loading?: boolean;
  variant?: "default" | "outline";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        loading={loading}
        disabled={reason !== null}
        aria-describedby={reason ? `${id}-reason` : undefined}
        onClick={onClick}
      >
        {children}
      </Button>
      {reason ? (
        <p id={`${id}-reason`} className="text-xs text-muted-foreground">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

export function CardInPlay({
  view,
  you,
  isTurn,
  connected,
  chosenSlot,
  pending,
  guessText,
  onGuessText,
  onDraw,
  onLock,
  onSkip,
  onBuy,
  onPass,
}: CardInPlayProps) {
  const { draw, phase } = view;
  const reduce = useReduced();
  const offline = connected ? null : "Reconectando…";
  const isPlayer = view.players.some((p) => p.id === you);
  const contestReason = disabledReason(view, you, "contest");
  const decided = view.passed.includes(you) || view.contests.some((c) => c.playerId === you);
  return (
    <section aria-label="Carta em jogo" className="flex items-start gap-4">
      {/* A new draw flips in from the deck: rotateY 180 to 0 on a spring, or a fade when reduced. */}
      <div className="shrink-0 [perspective:600px]">
        <motion.div
          key={draw?.id ?? "deck"}
          data-motion="draw-card"
          aria-hidden="true"
          className="flex h-24 w-[68px] items-center justify-center rounded-lg border border-border-strong bg-secondary font-mono text-[40px] leading-none font-semibold text-primary-text
 [backface-visibility:hidden]"
          initial={draw ? (reduce ? { opacity: 0 } : { rotateY: 180 }) : false}
          animate={reduce ? { opacity: 1 } : { rotateY: 0 }}
          transition={reduce ? FADE : SPRING}
        >
          ?
        </motion.div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        {draw?.audioUrl ? (
          <div className="w-full max-w-[480px]">
            <SnippetPlayer key={draw.id} audioUrl={draw.audioUrl} />
          </div>
        ) : draw ? (
          <p className="text-sm text-muted-foreground">Trecho indisponível</p>
        ) : null}
        {isTurn && phase === "turn-start" ? (
          <div className="flex flex-wrap items-start gap-2">
            <ActionButton id="draw" loading={pending === "draw"} reason={offline} onClick={onDraw}>
              Puxar carta
            </ActionButton>
            <ActionButton
              id="buy"
              variant="outline"
              loading={pending === "buy"}
              reason={offline ?? disabledReason(view, you, "buy")}
              onClick={onBuy}
            >
              Comprar carta ({BUY_COST} fichas)
            </ActionButton>
          </div>
        ) : null}
        {isTurn && phase === "guessing" ? (
          <>
            <div className="grid w-full max-w-[480px] gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="guess-title">
                  Música <span className="font-normal text-muted-foreground">opcional</span>
                </FieldLabel>
                <Input
                  id="guess-title"
                  value={guessText.title}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="ex.: Wonderwall…"
                  onChange={(e) => onGuessText({ ...guessText, title: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="guess-artist">
                  Artista <span className="font-normal text-muted-foreground">opcional</span>
                </FieldLabel>
                <Input
                  id="guess-artist"
                  value={guessText.artist}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="ex.: Oasis…"
                  onChange={(e) => onGuessText({ ...guessText, artist: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <ActionButton
                id="lock"
                loading={pending === "lock"}
                reason={offline ?? (chosenSlot === null ? "Escolha uma posição" : null)}
                onClick={onLock}
              >
                Travar palpite
              </ActionButton>
              <ActionButton
                id="skip"
                variant="outline"
                loading={pending === "skip"}
                reason={offline ?? disabledReason(view, you, "skip")}
                onClick={onSkip}
              >
                Sortear outra ({SKIP_COST} ficha)
              </ActionButton>
              <ActionButton
                id="buy"
                variant="outline"
                loading={pending === "buy"}
                reason={offline ?? disabledReason(view, you, "buy")}
                onClick={onBuy}
              >
                Comprar carta ({BUY_COST} fichas)
              </ActionButton>
            </div>
          </>
        ) : null}
        {isTurn && phase === "contest" ? (
          <p className="text-sm text-muted-foreground">Palpite travado. Esperando a contestação.</p>
        ) : null}
        {!isTurn && phase === "turn-start" ? (
          <p className="text-sm text-muted-foreground">Esperando a carta ser puxada</p>
        ) : null}
        {!isTurn && phase === "contest" && isPlayer ? (
          <>
            <p className="text-sm">Contestar custa 1 ficha</p>
            <p className="text-sm text-muted-foreground">
              Escolha um vão livre na timeline para contestar ou passe.
            </p>
            <ActionButton
              id="pass"
              variant="outline"
              loading={pending === "pass"}
              reason={offline ?? (decided ? contestReason : null)}
              onClick={onPass}
            >
              Passar
            </ActionButton>
            {!decided && contestReason ? (
              <p className="text-xs text-muted-foreground">{contestReason}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
