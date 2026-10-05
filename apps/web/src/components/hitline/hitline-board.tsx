"use client";

import type { Ack, PublicCard, RoomView } from "@resenhark/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CardInPlay, type Pending } from "@/components/hitline/card-in-play";
import { ResultPanel } from "@/components/hitline/result-panel";
import { RevealPanel } from "@/components/hitline/reveal-panel";
import { Scoreboard } from "@/components/hitline/scoreboard";
import { StatusStrip } from "@/components/hitline/status-strip";
import { type TakenGap, Timeline } from "@/components/hitline/timeline";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { disabledReason } from "@/lib/error-messages";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import type { ServerClock } from "@/lib/server-clock";
import type { GameEvent } from "@resenhark/shared";

type HitlineBoardProps = {
  room: RoomView;
  events: GameEvent[];
  send: Send;
  clock: ServerClock;
  connected: boolean;
  /** Owner only: the server drops the finished game and every client goes back to the lobby. */
  onNewGame: () => Promise<Ack>;
};

export function HitlineBoard({
  room,
  events,
  send,
  clock,
  connected,
  onNewGame,
}: HitlineBoardProps) {
  const view = room.game?.view;
  const drawId = view?.draw?.id ?? null;
  const timelineLength =
    view?.players.find((p) => p.id === view.turnPlayerId)?.timeline.length ?? 0;
  const [chosen, setChosen] = useState<{ drawId: string | null; len: number; slot: number } | null>(
    null,
  );
  const [typed, setTyped] = useState<{ drawId: string | null; title: string; artist: string }>({
    drawId: null,
    title: "",
    artist: "",
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const turnId = view?.turnPlayerId ?? null;
  const contesting = view?.phase === "contest";
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new turn or the contest window ends the notice
  useEffect(() => setNotice(null), [turnId, contesting]);

  useEffect(() => {
    if (events.some((e) => e.type === "audio-missing"))
      toast.info("Trecho indisponível, outra carta sorteada");
    const describe = (card: PublicCard) =>
      `${card.year} · ${card.title} · ${card.artists.join(", ")}`;
    for (const e of events) {
      if (e.type === "card-skipped") setNotice(`Carta descartada: ${describe(e.card)}`);
      if (e.type === "card-bought") {
        const who = room.members.find((m) => m.id === e.playerId)?.name ?? "Alguém";
        setNotice(`${who} comprou ${describe(e.card)}`);
      }
    }
  }, [events, room.members]);

  if (!view) return null;
  const isTurn = view.turnPlayerId === room.you;
  const turnMember = room.members.find((m) => m.id === view.turnPlayerId);
  const turnPlayer = view.players.find((p) => p.id === view.turnPlayerId);
  const isOwner = room.ownerId === room.you;
  const isSpectator = room.members.find((m) => m.id === room.you)?.role === "spectator";
  const guessing = isTurn && view.phase === "guessing";
  const canContest =
    !isTurn && view.phase === "contest" && disabledReason(view, room.you, "contest") === null;
  // A choice only counts for the card it was made on, and for the timeline it was made on.
  const chosenSlot =
    view.guess?.slot ??
    (chosen?.drawId === drawId && chosen.len === timelineLength ? chosen.slot : null);
  const guessText = typed.drawId === drawId ? typed : { title: "", artist: "" };
  const reveal = view.lastReveal;
  const nameOf = (id: string) => room.members.find((m) => m.id === id);

  async function act(kind: Pending, intent: object) {
    setPending(kind);
    const ack = await send("game:action", intent);
    setPending(null);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error));
  }

  const taken: TakenGap[] =
    view.phase === "contest" && view.guess
      ? [
          {
            slot: view.guess.slot,
            member: turnMember,
            text: isTurn ? "seu palpite" : `palpite de ${turnMember?.name ?? "Alguém"}`,
          },
          ...view.contests.map((c) => ({
            slot: c.slot,
            member: nameOf(c.playerId),
            text: `${nameOf(c.playerId)?.name ?? "Alguém"} contestou`,
          })),
        ]
      : [];

  return (
    <section aria-label="Hitline" className="flex flex-col gap-8">
      <h1 className="sr-only">Hitline</h1>
      <StatusStrip view={view} turnMember={turnMember} isTurn={isTurn} clock={clock} />
      {isSpectator ? (
        <p className="text-sm text-muted-foreground">
          Você está assistindo. Entra na próxima partida.
        </p>
      ) : null}
      <output aria-live="polite" className="block text-sm text-muted-foreground empty:hidden">
        {notice}
      </output>
      {view.phase === "game-over" ? (
        <ResultPanel view={view} members={room.members} isOwner={isOwner} onNewGame={onNewGame} />
      ) : (
        <>
          <CardInPlay
            view={view}
            you={room.you}
            isTurn={isTurn}
            connected={connected}
            chosenSlot={chosenSlot}
            pending={pending}
            guessText={guessText}
            onGuessText={(next) => setTyped({ drawId, ...next })}
            onDraw={() => void act("draw", { type: "draw" })}
            onSkip={() => void act("skip", { type: "skip" })}
            onBuy={() => void act("buy", { type: "buy" })}
            onPass={() => void act("pass", { type: "pass" })}
            onLock={() =>
              chosenSlot !== null &&
              void act("lock", {
                type: "lock-guess",
                slot: chosenSlot,
                title: guessText.title.trim(),
                artist: guessText.artist.trim(),
              })
            }
          />
          {turnPlayer ? (
            <Timeline
              ownerName={turnMember?.name ?? ""}
              cards={turnPlayer.timeline}
              interactive={(guessing || canContest) && connected}
              selectedSlot={chosenSlot}
              taken={taken}
              onSelect={(slot) =>
                canContest
                  ? void act("contest", { type: "contest", slot })
                  : setChosen({ drawId, len: timelineLength, slot })
              }
            />
          ) : null}
        </>
      )}
      {reveal ? <RevealPanel reveal={reveal} members={room.members} /> : null}
      <Scoreboard view={view} members={room.members} />
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
