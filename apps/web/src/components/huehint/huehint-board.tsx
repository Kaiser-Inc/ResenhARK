"use client";
import { RulesSheet } from "@/components/rules-sheet";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { Countdown } from "@/components/hitline/countdown";
import { ColorSelector } from "@/components/huehint/color-selector";
import { NextColorButton } from "@/components/huehint/next-color-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import { describeHsb, formatScore, hsbToCss, huehintScreen } from "@/lib/huehint";
import type { ServerClock } from "@/lib/server-clock";
import {
  type GameEvent,
  HINT_MAX_LENGTH,
  HINT_MAX_WORDS,
  type Hsb,
  type HuehintRoundView,
  type HuehintView,
  type MemberView,
  type RoomView,
  isValidHint,
} from "@resenhark/shared";
import { useId, useState } from "react";
import { toast } from "sonner";

function ColorSwatch({ color, label }: { color: Hsb; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        role="img"
        aria-label={`${label}: ${describeHsb(color)}`}
        className="h-28 rounded-xl ring-1 ring-border sm:h-40"
        style={{ background: hsbToCss(color) }}
      />
      <p className="text-sm font-medium">{label}</p>
      <p className="font-mono text-xs tabular-nums">{describeHsb(color)}</p>
    </div>
  );
}

function HintForm({
  disabled,
  pending,
  onSubmit,
}: { disabled: boolean; pending: boolean; onSubmit: (hint: string) => void }) {
  const [hint, setHint] = useState("");
  const id = useId();
  const invalid = hint.length > 0 && !isValidHint(hint);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (isValidHint(hint) && !disabled) onSubmit(hint.trim());
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>Sua dica</FieldLabel>
        <Input
          id={id}
          value={hint}
          maxLength={HINT_MAX_LENGTH}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={`${id}-help`}
          autoComplete="off"
          onChange={(event) => setHint(event.target.value)}
        />
      </Field>
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        {hint.length} / {HINT_MAX_LENGTH} caracteres · Até {HINT_MAX_WORDS} palavras, sem números
        nem #.
      </p>
      {invalid ? (
        <p role="alert" className="text-sm text-destructive">
          Essa dica não vale. Use até 4 palavras, sem números nem #.
        </p>
      ) : null}
      <Button
        type="submit"
        loading={pending}
        disabled={disabled || !isValidHint(hint)}
        className="self-start"
      >
        Enviar dica
      </Button>
    </form>
  );
}

function RoundReveal({
  round,
  players,
  members,
}: { round: HuehintRoundView; players: HuehintView["players"]; members: MemberView[] }) {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Alguém";
  // Include departed guess authors as well as current players; the projection owns all scores.
  const guesserIds = [
    ...new Set([...players.map((p) => p.id), ...round.guesses.map((g) => g.playerId)]),
  ].filter((id) => id !== round.giverId);
  return (
    <section
      aria-label={`Revelação da rodada ${round.round}`}
      className="flex flex-col gap-4 rounded-xl bg-muted p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 sm:p-6"
    >
      <h2 className="text-lg font-semibold">Rodada {round.round}</h2>
      {round.outcome === "no-hint" ? (
        <p>{name(round.giverId)} não deu dica</p>
      ) : round.hint ? (
        <p className="text-lg font-medium">“{round.hint}”</p>
      ) : null}
      {round.outcome === "no-hint" || round.guesses.length === 0 ? (
        <ColorSwatch color={round.color} label="Cor real" />
      ) : null}
      {round.outcome === "revealed" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {guesserIds.map((id) => {
            const guess = round.guesses.find((g) => g.playerId === id);
            return (
              <div key={id} className="flex flex-col gap-2 rounded-xl bg-background p-4">
                {guess ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <ColorSwatch color={round.color} label="Cor real" />
                      <ColorSwatch color={guess.color} label={`Palpite de ${name(id)}`} />
                    </div>
                    <p className="font-semibold">Nota: {formatScore(guess.score)} / 10,00</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">{name(id)}</p>
                    <p className="text-sm text-muted-foreground">sem palpite</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {round.giverScore !== null ? (
        <p className="text-sm font-medium">
          Nota do dador ({name(round.giverId)}): {formatScore(round.giverScore)}
        </p>
      ) : null}
    </section>
  );
}

function Scoreboard({ view, members }: { view: HuehintView; members: MemberView[] }) {
  return (
    <section
      aria-label={view.phase === "game-over" ? "Placar final" : "Placar parcial"}
      className="flex flex-col gap-3"
    >
      <h2 className="text-lg font-semibold">
        {view.phase === "game-over" ? "Placar final" : "Placar parcial"}
      </h2>
      <ol className="flex flex-col gap-2">
        {[...view.players]
          .sort((a, b) => b.total - a.total)
          .map((player) => {
            const member = members.find((m) => m.id === player.id);
            return (
              <li
                key={player.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-muted px-4 py-3"
              >
                {member ? (
                  <MemberAvatar
                    name={member.name}
                    avatar={member.avatar}
                    online={player.online}
                    size={32}
                    expression={view.winners.includes(player.id) ? "love" : "idle"}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {member?.name ?? "Alguém"}
                    {!player.online ? " · offline" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Palpites: {formatScore(player.guessPoints)} · Dicas:{" "}
                    {formatScore(player.giverPoints)}
                  </p>
                </div>
                <span className="font-mono font-semibold tabular-nums">
                  {formatScore(player.total)}
                </span>
              </li>
            );
          })}
      </ol>
    </section>
  );
}

export function HuehintBoard({
  room,
  events,
  send,
  clock,
  connected,
}: { room: RoomView; events: GameEvent[]; send: Send; clock: ServerClock; connected: boolean }) {
  const [pending, setPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  if (room.game?.type !== "huehint") return null;
  const view = room.game.view;
  const screen = huehintScreen(view, room.you);
  const name = (id: string | null) => room.members.find((m) => m.id === id)?.name ?? "Alguém";
  const isOwner = room.ownerId === room.you;
  const player = view.players.some((p) => p.id === room.you);
  const targetAllowed =
    player &&
    ((view.mode === "solo" && view.phase === "memorize") ||
      (view.mode === "group" &&
        view.giverId === room.you &&
        ["hint", "guessing"].includes(view.phase)));
  const winnerText = view.winners.length
    ? `${view.winners.map(name).join(" e ")} ${view.winners.length > 1 ? "venceram" : "venceu"}!`
    : "Partida encerrada";
  const lastRound = view.rounds.at(-1);
  // The server breaks equal totals by guess points; show why when a loser has the winners' total.
  const winnerTotal = view.players.find((p) => view.winners.includes(p.id))?.total;
  const wonOnTiebreak = view.players.some(
    (p) => !view.winners.includes(p.id) && p.total === winnerTotal,
  );
  const galleryRounds = view.phase === "reveal" ? view.rounds.slice(0, -1) : view.rounds;
  const phaseText =
    view.phase === "game-over"
      ? winnerText
      : view.phase === "reveal"
        ? `Rodada ${view.round} revelada.${lastRound ? ` Cor real: ${describeHsb(lastRound.color)}. ${lastRound.outcome === "no-hint" ? `${name(lastRound.giverId)} não deu dica` : lastRound.guesses.map((g) => `${name(g.playerId)}: ${formatScore(g.score)}`).join(". ")}${lastRound.giverScore !== null ? `. Nota do dador: ${formatScore(lastRound.giverScore)}` : ""}` : ""}`
        : view.phase === "memorize"
          ? screen === "memorize"
            ? "Memorize a cor. Você tem 5 segundos."
            : `${name(view.players[0]?.id ?? null)} está memorizando a cor`
          : view.phase === "hint"
            ? view.giverId === room.you
              ? "Sua vez: dê uma dica para a cor"
              : `${name(view.giverId)} está pensando na dica`
            : view.mode === "solo"
              ? "Recrie a cor de memória"
              : `Hora dos palpites. Dica: ${view.hint ?? ""}`;
  const canceled = events.find((event) => event.type === "round-canceled");
  async function act(intent: object) {
    setPending(true);
    const ack = await send("game:action", intent);
    setPending(false);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error));
  }
  return (
    <section
      aria-label="Huehint"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: waiting game content must remain keyboard reachable inside the scrolling room main
      tabIndex={0}
      className="flex flex-col gap-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <h1 className="sr-only">Huehint{view.mode === "solo" ? " · treino solo" : ""}</h1>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {phaseText}
        {canceled?.type === "round-canceled"
          ? `. Rodada de ${name(canceled.giverId)} cancelada.`
          : ""}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold">
            Rodada {view.round} / {view.totalRounds}
          </p>
          {view.phase === "game-over" ? null : (
            <p className="text-sm text-muted-foreground">
              {view.mode === "solo"
                ? "Sem dador · treino de memória"
                : `Dador: ${name(view.giverId)} · Próximo: ${view.nextGiverId ? name(view.nextGiverId) : "última rodada"}`}
            </p>
          )}
        </div>
        {view.deadline !== null ? (
          <Countdown key={view.deadline} deadline={view.deadline} clock={clock} />
        ) : (
          <span className="text-sm text-muted-foreground">
            {view.phase === "game-over" ? "Tempo encerrado" : "Tempo pausado"}
          </span>
        )}
        <RulesSheet setup={{ type: "huehint", config: view.config }} />
      </div>
      {!player ? (
        <p className="text-sm text-muted-foreground">
          Você está assistindo. Entra na próxima partida.
        </p>
      ) : null}
      {view.phase === "game-over" ? (
        <section aria-label="Resultado" className="flex flex-col gap-3 rounded-xl bg-muted p-6">
          <h2 className="text-xl font-semibold">{winnerText}</h2>
          <p className="text-sm text-muted-foreground">
            {view.endReason === "not-enough-players"
              ? "A partida acabou porque restaram menos de 2 jogadores."
              : view.endReason === "ended"
                ? "O dono encerrou a partida."
                : "Todas as rodadas foram jogadas."}
          </p>
          {wonOnTiebreak ? (
            <p className="text-sm font-medium">Venceu no desempate pelos palpites.</p>
          ) : null}
          {isOwner ? (
            <Button
              type="button"
              className="self-start"
              loading={resetting}
              disabled={!connected}
              onClick={async () => {
                setResetting(true);
                const ack = await send("game:reset");
                setResetting(false);
                if (!ack.ok) toast.error(gameErrorMessage(ack.error));
              }}
            >
              Outra rodada
            </Button>
          ) : null}
        </section>
      ) : (
        <>
          {view.hint ? <p className="text-center text-2xl font-semibold">“{view.hint}”</p> : null}
          {targetAllowed && view.color ? (
            <section aria-label="Cor secreta" className="flex flex-col gap-3">
              <ColorSwatch
                color={view.color}
                label={view.mode === "solo" ? "Memorize esta cor" : "Só você vê esta cor"}
              />
            </section>
          ) : null}
          {screen === "hint" ? (
            <HintForm
              key={view.round}
              disabled={!connected || pending}
              pending={pending}
              onSubmit={(hint) => void act({ type: "give-hint", hint })}
            />
          ) : null}
          {screen === "waiting" ? (
            <p className="py-8 text-center text-muted-foreground">
              {view.mode === "solo"
                ? "O jogador está memorizando a cor"
                : `${name(view.giverId)} está pensando na dica`}
            </p>
          ) : null}
          {screen === "memorize" ? (
            <p className="text-center font-medium">Memorize! A cor some em 5 segundos.</p>
          ) : null}
          {screen === "guess" ? (
            <>
              <p className="text-center font-medium">
                {view.mode === "solo" ? "Recrie a cor de memória" : "Qual cor combina com a dica?"}
              </p>
              <ColorSelector
                key={view.round}
                round={view.round}
                totalRounds={view.totalRounds}
                disabled={!connected || pending}
                pending={pending}
                onConfirm={(color) => void act({ type: "guess", color })}
              />
            </>
          ) : null}
          {screen === "submitted" && view.myGuess ? (
            <section aria-label="Seu palpite" className="flex flex-col gap-3">
              <ColorSwatch color={view.myGuess} label="Seu palpite está travado" />
              <p className="text-center font-medium">Aguardando os outros</p>
            </section>
          ) : null}
          {screen === "giver" ? (
            <p className="text-center text-muted-foreground">
              Dica enviada. Aguardando os palpites do time.
            </p>
          ) : null}
          {screen === "spectator" ? (
            <p className="text-center text-muted-foreground">Aguardando os palpites do time.</p>
          ) : null}
          {view.phase === "guessing" ? (
            <section aria-label="Palpites enviados" className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Quem já enviou</h2>
              <ul className="flex flex-wrap gap-3 text-sm">
                {view.players
                  .filter((p) => p.id !== view.giverId)
                  .map((p) => (
                    <li key={p.id}>
                      {name(p.id)} ·{" "}
                      {view.submitted.includes(p.id) ? "enviou" : p.online ? "pensando" : "offline"}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
          {screen === "reveal" && lastRound ? (
            <RoundReveal round={lastRound} players={view.players} members={room.members} />
          ) : null}
        </>
      )}
      {view.mode === "solo" && view.phase === "reveal" && player ? (
        <NextColorButton key={view.round} send={send} connected={connected} />
      ) : null}
      <Scoreboard view={view} members={room.members} />
      {galleryRounds.length > 0 ? (
        <section aria-label="Galeria de rodadas" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Galeria de rodadas</h2>
          {galleryRounds.map((round) => (
            <details key={round.round} className="rounded-xl bg-muted p-4">
              <summary className="cursor-pointer font-medium">
                Rodada {round.round}
                {round.hint ? ` · ${round.hint}` : ""}
              </summary>
              <div className="pt-4">
                <RoundReveal round={round} players={view.players} members={room.members} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
      {isOwner && view.phase !== "game-over" ? (
        <div>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" disabled={!connected}>
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
              if (!ack.ok) toast.error(gameErrorMessage(ack.error));
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
