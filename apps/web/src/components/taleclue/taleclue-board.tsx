"use client";

import { useSecondsLeft } from "@/components/hitline/countdown";
import { RulesSheet } from "@/components/rules-sheet";
import { TaleclueCard } from "@/components/taleclue/taleclue-card";
import { TaleclueScoreboard } from "@/components/taleclue/taleclue-scoreboard";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import type { ServerClock } from "@/lib/server-clock";
import {
  taleclueAction,
  taleclueRevealElapsed,
  taleclueSelectionValid,
  taleclueWaitingCount,
} from "@/lib/taleclue";
import {
  CLUE_MAX_LENGTH,
  type GameEvent,
  type MemberView,
  type RoomView,
  type TaleclueIntent,
  type TaleclueRoundView,
  type TaleclueView,
} from "@resenhark/shared";
import { LayersIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type Dispatch, type SetStateAction, useId, useRef, useState } from "react";
import { toast } from "sonner";

export type TaleclueDraft = {
  key: string;
  selected: string[];
  clue: string;
  pending: boolean;
  submitted: boolean;
};

const STAGES = [
  "Cartas reveladas",
  "Votos",
  "Pontos pelos acertos",
  "Pontos pelas iscas",
  "Tabuleiro",
];
const OUTCOMES = {
  some: "Alguns acertaram.",
  all: "Todos acertaram.",
  none: "Ninguém acertou.",
  "no-votes": "Sem votos nesta rodada.",
};
const grid = "grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 xl:grid-cols-5";
const nameOf = (members: MemberView[], id: string | null) =>
  members.find((member) => member.id === id)?.name ?? id ?? "";

function RoundReveal({
  round,
  members,
  elapsed = 15000,
  seek = false,
}: { round: TaleclueRoundView; members: MemberView[]; elapsed?: number; seek?: boolean }) {
  const stage = Math.min(4, Math.floor(elapsed / 2400));
  const flip = round.steps.find((step) => step.type === "card-flip");
  const votes = round.steps.find((step) => step.type === "votes");
  const correct = round.steps.find((step) => step.type === "award-correct");
  const decoy = round.steps.find((step) => step.type === "award-decoy");
  return (
    <section
      aria-label={`Revelação da rodada ${round.round}`}
      data-reveal-step={stage}
      className="flex flex-col gap-4"
    >
      <h2 aria-live="polite" aria-atomic="true" className="text-lg font-semibold">
        {STAGES[stage]}
      </h2>
      <div className={grid}>
        {flip?.cards.map((card, index) => (
          <motion.div
            key={card.cardId}
            data-owner-id={card.ownerId}
            className="flex min-w-0 flex-col gap-2"
            initial={seek ? false : { transform: "rotateY(90deg)" }}
            animate={{ transform: "rotateY(0deg)" }}
            transition={{ duration: 0.45, delay: seek ? 0 : index * 0.08 }}
          >
            <TaleclueCard
              cardId={card.cardId}
              index={index}
              animate={false}
              note={
                card.narrator
                  ? `Narrador: ${nameOf(members, card.ownerId)}`
                  : nameOf(members, card.ownerId)
              }
            />
            {stage >= 1 ? (
              <div className="flex flex-wrap gap-1">
                {votes?.votes
                  .filter((vote) => vote.cardId === card.cardId)
                  .map((vote) => (
                    <motion.span
                      key={vote.voterId}
                      data-voter-id={vote.voterId}
                      className="rounded-md bg-secondary px-2 py-1 text-xs font-medium"
                      initial={seek ? false : { opacity: 0, transform: "translateY(-12px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      transition={{ duration: 0.25 }}
                    >
                      {nameOf(members, vote.voterId)}
                    </motion.span>
                  ))}
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>
      {stage >= 2 && correct ? (
        <motion.div
          initial={seek ? false : { opacity: 0, transform: "translateY(8px)" }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-2"
        >
          <p className="font-medium">{OUTCOMES[correct.outcome]}</p>
          <div className="flex flex-wrap gap-2">
            {correct.awards.map((award) => (
              <span key={award.playerId} className="rounded-md bg-secondary px-2 py-1 text-sm">
                {nameOf(members, award.playerId)} +{award.points}
              </span>
            ))}
          </div>
        </motion.div>
      ) : null}
      {stage >= 3 && decoy ? (
        <motion.div
          initial={seek ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-2"
        >
          <p className="text-sm font-medium">Pontos pelas iscas</p>
          <div className="flex flex-wrap gap-2">
            {decoy.awards.map((award) => (
              <span key={award.playerId} className="rounded-md bg-secondary px-2 py-1 text-sm">
                {nameOf(members, award.playerId)} +{award.points}
              </span>
            ))}
          </div>
        </motion.div>
      ) : null}
    </section>
  );
}

function RoundInteraction({
  view,
  you,
  role,
  members,
  connected,
  send,
  clock,
  draft,
  setDraft,
}: {
  view: TaleclueView;
  you: string;
  role: MemberView["role"];
  members: MemberView[];
  connected: boolean;
  send: Send;
  clock: ServerClock;
  draft: TaleclueDraft | null;
  setDraft: Dispatch<SetStateAction<TaleclueDraft | null>>;
}) {
  const key = `${view.round}:${view.phase}`;
  const empty: TaleclueDraft = { key, selected: [], clue: "", pending: false, submitted: false };
  const current = draft?.key === key ? draft : empty;
  const { selected, clue, pending, submitted } = current;
  function change(patch: Partial<TaleclueDraft>) {
    setDraft((previous) => ({ ...(previous?.key === key ? previous : empty), ...patch }));
  }
  const sending = useRef(false);
  const id = useId();
  const action = taleclueAction(view, you, role, clock.now());
  const allowed = connected && !pending && !submitted && action !== null;
  const validSelected = selected.filter((card) =>
    view.phase === "vote"
      ? view.table.includes(card) && !view.myCards.includes(card)
      : view.hand.includes(card),
  );
  function select(card: string) {
    if (!allowed) return;
    if (action === "play-decoys")
      change({
        selected: selected.includes(card)
          ? selected.filter((id) => id !== card)
          : selected.length < view.decoyCount
            ? [...selected, card]
            : selected,
      });
    else change({ selected: selected.includes(card) ? [] : [card] });
  }
  async function confirm() {
    if (
      !allowed ||
      sending.current ||
      !taleclueSelectionValid(view, validSelected, clue) ||
      !taleclueAction(view, you, role, clock.now())
    )
      return;
    const intent: TaleclueIntent =
      action === "give-clue"
        ? { type: action, cardId: validSelected[0], clue: clue.trim() }
        : action === "play-decoys"
          ? { type: action, cardIds: validSelected }
          : { type: "vote", cardId: validSelected[0] };
    sending.current = true;
    change({ pending: true });
    const ack = await send("game:action", intent);
    setDraft((previous) =>
      previous?.key === key ? { ...previous, pending: false, submitted: ack.ok } : previous,
    );
    if (!ack.ok) {
      sending.current = false;
      toast.error(gameErrorMessage(ack.error, "taleclue"));
    }
  }
  const isPlayer = role === "player" && view.players.some((player) => player.id === you);
  const message =
    view.phase === "clue"
      ? view.narratorId === you
        ? "Escolha uma carta e escreva a pista"
        : `${nameOf(members, view.narratorId)} está pensando na pista.`
      : view.phase === "decoy"
        ? view.narratorId === you
          ? "Pista enviada. Aguardando as iscas."
          : view.acted.includes(you) || submitted
            ? "Iscas enviadas. Aguardando os outros jogadores."
            : `Selecione ${view.decoyCount} isca${view.decoyCount === 1 ? "" : "s"}`
        : view.myVote || submitted
          ? "Voto enviado. Aguardando os outros jogadores."
          : view.narratorId === you
            ? "Aguardando os votos."
            : "Qual é a carta do narrador?";
  return (
    <>
      <p aria-live="polite" aria-atomic="true" className="font-medium">
        {message}
      </p>
      <section aria-label="Mesa" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Mesa</h2>
        {view.phase === "vote" ? (
          <div className={grid}>
            {view.table.map((card, index) => (
              <TaleclueCard
                key={card}
                cardId={card}
                index={index}
                selected={validSelected.includes(card) || view.myVote === card}
                disabled={!allowed || view.myCards.includes(card)}
                onSelect={() => select(card)}
                note={
                  view.myCards.includes(card)
                    ? "Sua carta"
                    : view.myVote === card
                      ? "Seu voto"
                      : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div aria-hidden="true" className="flex flex-wrap gap-2">
            {[
              ...(view.clue ? ["narrator"] : []),
              ...view.acted.flatMap((playerId) =>
                Array.from({ length: view.decoyCount }, (_, index) => `${playerId}-${index}`),
              ),
            ].map((cardKey) => (
              <motion.div
                key={cardKey}
                initial={{ opacity: 0, transform: "translateY(24px)" }}
                animate={{ opacity: 1, y: 0 }}
                className="flex h-20 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <LayersIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
      {isPlayer && view.hand.length > 0 ? (
        <section aria-label="Sua mão" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Sua mão</h2>
            {action === "play-decoys" ? (
              <span className="font-mono text-sm tabular-nums">
                {validSelected.length} / {view.decoyCount}
              </span>
            ) : null}
          </div>
          <div className={grid}>
            <AnimatePresence>
              {view.hand.map((card, index) => (
                <TaleclueCard
                  key={card}
                  cardId={card}
                  index={index}
                  selected={view.phase !== "vote" && validSelected.includes(card)}
                  disabled={
                    !allowed ||
                    view.phase === "vote" ||
                    (action === "play-decoys" &&
                      validSelected.length >= view.decoyCount &&
                      !validSelected.includes(card))
                  }
                  onSelect={() => select(card)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : null}
      {action && !submitted ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          {action === "give-clue" ? (
            <Field className="max-w-sm">
              <FieldLabel htmlFor={id}>Pista</FieldLabel>
              <Input
                id={id}
                value={clue}
                maxLength={CLUE_MAX_LENGTH}
                autoComplete="off"
                disabled={!allowed}
                onChange={(event) => change({ clue: event.target.value })}
              />
            </Field>
          ) : null}
          <Button
            type="submit"
            className="self-start"
            loading={pending}
            disabled={!allowed || !taleclueSelectionValid(view, validSelected, clue)}
          >
            {action === "give-clue"
              ? "Enviar pista"
              : action === "play-decoys"
                ? "Jogar iscas"
                : "Confirmar voto"}
          </Button>
        </form>
      ) : null}
    </>
  );
}

export function TaleclueBoard({
  room,
  events: _events,
  send,
  clock,
  connected,
  draft,
  onDraftChange,
}: {
  room: RoomView;
  events: GameEvent[];
  send: Send;
  clock: ServerClock;
  connected: boolean;
  draft?: TaleclueDraft | null;
  onDraftChange?: Dispatch<SetStateAction<TaleclueDraft | null>>;
}) {
  const [localDraft, setLocalDraft] = useState<TaleclueDraft | null>(null);
  // A shared ticking clock drives eligibility and seeks reveal without client phase changes.
  useSecondsLeft(room.game?.type === "taleclue" ? (room.game.view.deadline ?? 0) : 0, clock);
  const [revealStart] = useState(() => clock.now());
  if (room.game?.type !== "taleclue") return null;
  const view = room.game.view;
  const role = room.members.find((member) => member.id === room.you)?.role ?? "spectator";
  const lastRound =
    view.phase === "reveal" ? view.rounds.find((round) => round.round === view.round) : undefined;
  const elapsed = taleclueRevealElapsed(view.deadline, clock.now());
  const seek = view.deadline !== null && taleclueRevealElapsed(view.deadline, revealStart) > 500;
  const moves = lastRound?.steps.find((step) => step.type === "board-move")?.moves ?? [];
  const waiting = taleclueWaitingCount(view);
  return (
    <section aria-label="Taleclue" className="flex flex-col gap-6">
      <h1 className="sr-only">Taleclue</h1>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">Rodada {view.round}</h2>
          <p className="text-sm text-muted-foreground">
            Narrador: {nameOf(room.members, view.narratorId)}
          </p>
          {view.nextNarratorId ? (
            <p className="text-xs text-muted-foreground">
              Próximo narrador: {nameOf(room.members, view.nextNarratorId)}
            </p>
          ) : null}
        </div>
        {view.deadline === null ? (
          <span className="text-sm text-muted-foreground">Tempo pausado</span>
        ) : (
          <span
            role="timer"
            aria-label="Tempo restante"
            className="font-mono text-lg font-semibold tabular-nums"
          >
            {Math.max(0, Math.ceil((view.deadline - clock.now()) / 1000))}s
          </span>
        )}
        <RulesSheet setup={{ type: "taleclue", config: view.config }} />
      </div>
      <TaleclueScoreboard
        view={view}
        members={room.members}
        moves={moves}
        moving={elapsed >= 9600}
        seek={seek}
      />
      {view.clue ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Pista</p>
          <p className="break-words text-2xl font-semibold">“{view.clue}”</p>
        </div>
      ) : null}
      {lastRound ? (
        <RoundReveal
          key={lastRound.round}
          round={lastRound}
          members={room.members}
          elapsed={elapsed}
          seek={seek}
        />
      ) : view.phase !== "game-over" ? (
        <RoundInteraction
          key={`${view.round}-${view.phase}`}
          view={view}
          you={room.you}
          role={role}
          members={room.members}
          connected={connected}
          send={send}
          clock={clock}
          draft={draft === undefined ? localDraft : draft}
          setDraft={onDraftChange ?? setLocalDraft}
        />
      ) : null}
      {view.phase === "decoy" || view.phase === "vote" ? (
        <p className="text-sm text-muted-foreground">
          {waiting === 1 ? "Falta 1 jogador." : `Faltam ${waiting} jogadores.`}
        </p>
      ) : null}
    </section>
  );
}
