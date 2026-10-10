"use client";

import { useSecondsLeft } from "@/components/hitline/countdown";
import { RulesSheet } from "@/components/rules-sheet";
import { TaleclueCard } from "@/components/taleclue/taleclue-card";
import { TaleclueCountdown } from "@/components/taleclue/taleclue-countdown";
import { TalecluePhaseGuide } from "@/components/taleclue/taleclue-phase-guide";
import { TaleclueScoreboard } from "@/components/taleclue/taleclue-scoreboard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import type { ServerClock } from "@/lib/server-clock";
import {
  TALECLUE_REVEAL_STAGES,
  taleclueAction,
  taleclueRevealElapsed,
  taleclueRevealStage,
  taleclueSelectionValid,
  taleclueWaitingCount,
} from "@/lib/taleclue";
import { taleclueGuidance } from "@/lib/taleclue-guidance";
import { cn } from "@/lib/utils";
import {
  CLUE_MAX_LENGTH,
  type GameEvent,
  type MemberView,
  type RoomView,
  type TaleclueEndReason,
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

const OUTCOMES = {
  some: "Alguns acertaram.",
  all: "Todos acertaram.",
  none: "Ninguém acertou.",
  "no-votes": "Sem votos nesta rodada.",
};
const grid = "grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4";
const nameOf = (members: MemberView[], id: string | null) =>
  members.find((member) => member.id === id)?.name ?? id ?? "";

function RoundReveal({
  round,
  members,
  elapsed = 15000,
  seek = false,
  resumeElapsed = 0,
}: {
  round: TaleclueRoundView;
  members: MemberView[];
  elapsed?: number;
  seek?: boolean;
  resumeElapsed?: number;
}) {
  const { index: stage, active } = taleclueRevealStage(elapsed);
  const focus = (step: number) => active && stage === step;
  const passed = (step: number) => seek || resumeElapsed > (step === 0 ? 500 : step * 2400);
  const flip = round.steps.find((step) => step.type === "card-flip");
  const votes = round.steps.find((step) => step.type === "votes");
  const correct = round.steps.find((step) => step.type === "award-correct");
  const decoy = round.steps.find((step) => step.type === "award-decoy");
  return (
    <section
      aria-label={`Revelação da rodada ${round.round}`}
      data-reveal-step={stage}
      data-reveal-active={active}
      className="flex flex-col gap-4"
    >
      <h2 aria-live="polite" aria-atomic="true" className="text-lg font-semibold">
        {TALECLUE_REVEAL_STAGES[stage].label}
      </h2>
      <div className={grid}>
        {flip?.cards.map((card, index) => (
          <motion.div
            key={card.cardId}
            data-owner-id={card.ownerId}
            className="flex min-w-0 flex-col gap-2"
            initial={passed(0) ? false : { transform: "rotateY(90deg)" }}
            animate={{ transform: "rotateY(0deg)" }}
            transition={{ duration: 0.45, delay: passed(0) ? 0 : index * 0.08 }}
          >
            <TaleclueCard
              cardId={card.cardId}
              index={index}
              animate={false}
              spotlight={
                (focus(0) && card.narrator) ||
                (focus(1) && !!votes?.votes.some((vote) => vote.cardId === card.cardId))
              }
              dimmed={
                active &&
                !(focus(0) && card.narrator) &&
                !(focus(1) && votes?.votes.some((vote) => vote.cardId === card.cardId))
              }
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
                      className={cn(
                        "break-all rounded-md bg-muted px-2 py-1 text-xs font-medium",
                        focus(1) ? "taleclue-attention" : "text-muted-foreground",
                      )}
                      initial={passed(1) ? false : { opacity: 0, transform: "translateY(-12px)" }}
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
          initial={passed(2) ? false : { opacity: 0, transform: "translateY(8px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.25 }}
          data-highlighted={focus(2)}
          className={cn(
            "flex flex-col gap-2 rounded-md",
            focus(2) && "taleclue-attention",
            active && !focus(2) && "text-muted-foreground",
          )}
        >
          <p className="font-medium">{OUTCOMES[correct.outcome]}</p>
          <div className="flex flex-wrap gap-2">
            {correct.awards.map((award) => (
              <span
                key={award.playerId}
                className="break-all rounded-md bg-muted px-2 py-1 text-sm"
              >
                {nameOf(members, award.playerId)} +{award.points}
              </span>
            ))}
          </div>
        </motion.div>
      ) : null}
      {stage >= 3 && decoy ? (
        <motion.div
          initial={passed(3) ? false : { opacity: 0, transform: "translateY(8px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.25 }}
          data-highlighted={focus(3)}
          className={cn(
            "flex flex-col gap-2 rounded-md",
            focus(3) && "taleclue-attention",
            active && !focus(3) && "text-muted-foreground",
          )}
        >
          <p className="text-sm font-medium">Pontos pelas iscas</p>
          <div className="flex flex-wrap gap-2">
            {decoy.awards.map((award) => (
              <span key={award.playerId} className="rounded-md bg-muted px-2 py-1 text-sm">
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
  const guidanceView =
    submitted && view.phase !== "clue" ? { ...view, acted: [...view.acted, you] } : view;
  const guidance = taleclueGuidance(guidanceView, you, role, nameOf(members, view.narratorId));
  return (
    <>
      <TalecluePhaseGuide guidance={guidance} />
      {action === "give-clue" && !submitted ? (
        <Field data-clue-field className="w-full gap-2">
          <FieldLabel htmlFor={id} className="text-xl font-semibold">
            Pista
          </FieldLabel>
          <Input
            id={id}
            name="clue"
            form={`${id}-action`}
            value={clue}
            maxLength={CLUE_MAX_LENGTH}
            autoComplete="off"
            autoFocus
            className="focus:outline-2 focus:outline-offset-2 focus:outline-ring md:text-base"
            disabled={!allowed}
            onChange={(event) => change({ clue: event.target.value })}
          />
        </Field>
      ) : null}
      {view.phase !== "clue" ? (
        <section aria-label="Mesa" className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Mesa</h2>
          {view.phase === "vote" ? (
            <div className={grid}>
              {view.table.map((card, index) => (
                <TaleclueCard
                  key={card}
                  cardId={card}
                  index={index}
                  selected={isPlayer && (validSelected.includes(card) || view.myVote === card)}
                  disabled={!allowed || view.myCards.includes(card)}
                  onSelect={() => select(card)}
                  note={
                    !isPlayer
                      ? undefined
                      : view.myCards.includes(card)
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
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  className="flex h-20 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                >
                  <LayersIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      ) : null}
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
          id={`${id}-action`}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
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

const END_REASONS: Record<TaleclueEndReason, string> = {
  points: "Meta de pontos alcançada.",
  "deck-empty": "O baralho acabou.",
  "not-enough-players": "A partida ficou com menos de 3 jogadores.",
  ended: "O dono encerrou a partida.",
};

function GameResult({
  view,
  members,
  owner,
  connected,
  resetting,
  onReset,
}: {
  view: TaleclueView;
  members: MemberView[];
  owner: boolean;
  connected: boolean;
  resetting: boolean;
  onReset: () => void;
}) {
  const winners = view.endReason === "ended" ? [] : view.winners;
  const names = winners.map((id) => nameOf(members, id));
  const title =
    names.length === 1
      ? `${names[0]} venceu!`
      : names.length > 1
        ? `Empate dividido: ${names.join(", ")} venceram!`
        : "Partida encerrada";
  return (
    <section
      aria-label="Resultado"
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-col gap-3 rounded-md bg-muted p-6"
    >
      <h2 className="break-words text-2xl font-semibold">{title}</h2>
      {view.endReason ? (
        <p className="text-sm text-muted-foreground">{END_REASONS[view.endReason]}</p>
      ) : null}
      {owner ? (
        <Button className="self-start" loading={resetting} disabled={!connected} onClick={onReset}>
          Outra rodada
        </Button>
      ) : null}
    </section>
  );
}

export function TaleclueBoard({
  room,
  events,
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
  const [resetting, setResetting] = useState(false);
  const [localDraft, setLocalDraft] = useState<TaleclueDraft | null>(null);
  // A shared ticking clock drives eligibility and seeks reveal without client phase changes.
  useSecondsLeft(room.game?.type === "taleclue" ? (room.game.view.deadline ?? 0) : 0, clock);
  const [revealStart] = useState(() => clock.now());
  if (room.game?.type !== "taleclue") return null;
  const view = room.game.view;
  const role = room.members.find((member) => member.id === room.you)?.role ?? "spectator";
  const lastRound =
    view.phase === "reveal" ? view.rounds.find((round) => round.round === view.round) : undefined;
  const elapsed =
    view.deadline === null ? 15000 : taleclueRevealElapsed(view.deadline, clock.now());
  const resumeElapsed = taleclueRevealElapsed(view.deadline, revealStart);
  const seek = view.deadline === null;
  const moves = lastRound?.steps.find((step) => step.type === "board-move")?.moves ?? [];
  const revealStage = taleclueRevealStage(elapsed);
  const focusStep = lastRound?.steps.find((step) => step.type === revealStage.type);
  const focusedPlayers = !revealStage.active
    ? []
    : focusStep && "awards" in focusStep
      ? focusStep.awards.map((award) => award.playerId)
      : focusStep?.type === "board-move"
        ? focusStep.moves.filter((move) => move.from !== move.to).map((move) => move.playerId)
        : [];
  const currentDraft = draft === undefined ? localDraft : draft;
  const submitted = currentDraft?.key === `${view.round}:${view.phase}` && currentDraft.submitted;
  const canAct =
    connected && !submitted && taleclueAction(view, room.you, role, clock.now()) !== null;
  const waiting = taleclueWaitingCount(view);

  const owner = room.ownerId === room.you;
  const over = view.phase === "game-over";
  const history = view.rounds.filter((round) => round.round !== lastRound?.round);
  const notices = [
    ...new Set(
      events.flatMap((event) =>
        event.type === "round-voided"
          ? ["Rodada anulada, sem pontos."]
          : event.type === "decoy-played" && event.auto
            ? [`Uma isca foi jogada automaticamente por ${nameOf(room.members, event.playerId)}.`]
            : [],
      ),
    ),
  ];
  return (
    <section aria-label="Taleclue" className="flex flex-col gap-6">
      <h1 className="sr-only">Taleclue</h1>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={
            !over && view.deadline === null
              ? "min-w-0 basis-full sm:flex-1 sm:basis-auto"
              : "min-w-0 flex-1"
          }
        >
          <h2 className="text-[28px] leading-8 font-semibold tracking-[-0.03em] sm:text-[40px] sm:leading-[44px]">
            Rodada {view.round}
          </h2>
          {!over ? (
            <p className="break-words text-sm text-muted-foreground">
              Narrador: {nameOf(room.members, view.narratorId)}
            </p>
          ) : null}
          {!over && view.nextNarratorId ? (
            <p className="break-words text-xs text-muted-foreground">
              Próximo narrador: {nameOf(room.members, view.nextNarratorId)}
            </p>
          ) : null}
        </div>
        {over ? null : view.deadline === null ? (
          <span className="text-sm text-muted-foreground">Tempo pausado</span>
        ) : (
          <TaleclueCountdown view={view} clock={clock} canAct={canAct} />
        )}
        <RulesSheet setup={{ type: "taleclue", config: view.config }} />
      </div>

      {!over ? (
        <ol className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {(
            [
              ["clue", "Pista"],
              ["decoy", "Iscas"],
              ["vote", "Voto"],
              ["reveal", "Revelação"],
            ] as const
          ).map(([phase, label]) => (
            <li
              key={phase}
              aria-current={view.phase === phase ? "step" : undefined}
              className={cn(view.phase === phase && "font-semibold text-primary-text")}
            >
              {label}
            </li>
          ))}
        </ol>
      ) : null}
      {notices.length > 0 ? (
        <output className="flex flex-col gap-1 text-sm text-muted-foreground">
          {notices.map((notice) => (
            <span className="break-words" key={notice}>
              {notice}
            </span>
          ))}
        </output>
      ) : null}
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {over ? (
            <GameResult
              view={view}
              members={room.members}
              owner={owner}
              connected={connected}
              resetting={resetting}
              onReset={async () => {
                setResetting(true);
                const ack = await send("game:reset");
                setResetting(false);
                if (!ack.ok) toast.error(gameErrorMessage(ack.error, "taleclue"));
              }}
            />
          ) : null}
          {!over && view.clue ? (
            <div
              key={`${view.round}:${view.clue}`}
              data-clue-display
              aria-live="polite"
              aria-atomic="true"
              className="taleclue-attention flex flex-col gap-2 rounded-md p-4"
            >
              <p className="text-xs text-muted-foreground">Pista</p>
              <p className="break-words text-2xl font-semibold">“{view.clue}”</p>
            </div>
          ) : null}
          {lastRound ? (
            <>
              <TalecluePhaseGuide
                helpOnly
                guidance={taleclueGuidance(
                  view,
                  room.you,
                  role,
                  nameOf(room.members, view.narratorId),
                )}
              />
              <RoundReveal
                key={lastRound.round}
                round={lastRound}
                members={room.members}
                elapsed={elapsed}
                seek={seek}
                resumeElapsed={resumeElapsed}
              />
            </>
          ) : view.phase !== "game-over" && view.phase !== "reveal" ? (
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
          {waiting > 0 && (view.phase === "decoy" || view.phase === "vote") ? (
            <p aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
              {waiting === 1 ? "Falta 1 jogador." : `Faltam ${waiting} jogadores.`}
            </p>
          ) : null}
        </div>
        <aside className="min-w-0">
          <TaleclueScoreboard
            view={view}
            members={room.members}
            moves={moves}
            clock={clock}
            elapsed={elapsed}
            focusedPlayers={focusedPlayers}
          />
        </aside>
      </div>
      {history.length > 0 ? (
        <section aria-label="Rodadas anteriores" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Rodadas anteriores</h2>
          {history.map((round) => (
            <details key={round.round} className="rounded-md bg-muted p-4">
              <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                Rodada {round.round}
              </summary>
              <div className="flex flex-col gap-4 pt-4">
                <p className="break-words text-xl font-semibold">“{round.clue}”</p>
                <RoundReveal round={round} members={room.members} seek />
              </div>
            </details>
          ))}
        </section>
      ) : null}
      {owner && !over ? (
        <div>
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={!connected}>
                Encerrar partida
              </Button>
            }
            title="Encerrar a partida?"
            description="Todo mundo vê o resultado agora."
            confirmLabel="Encerrar"
            variant="destructive"
            confirmDisabled={!connected}
            onConfirm={async () => {
              const ack = await send("game:end");
              if (!ack.ok) toast.error(gameErrorMessage(ack.error, "taleclue"));
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
