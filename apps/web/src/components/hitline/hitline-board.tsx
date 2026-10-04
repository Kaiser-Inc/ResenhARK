"use client";

import type { RoomView } from "@resenhark/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CardInPlay } from "@/components/hitline/card-in-play";
import { ResultPanel } from "@/components/hitline/result-panel";
import { RevealPanel } from "@/components/hitline/reveal-panel";
import { Scoreboard } from "@/components/hitline/scoreboard";
import { StatusStrip } from "@/components/hitline/status-strip";
import { Timeline } from "@/components/hitline/timeline";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import type { ServerClock } from "@/lib/server-clock";
import type { GameEvent } from "@resenhark/shared";

type HitlineBoardProps = {
  room: RoomView;
  events: GameEvent[];
  send: Send;
  clock: ServerClock;
  connected: boolean;
  /** Owner only: leave the finished game's result and go back to the lobby. */
  onNewGame: () => void;
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
  const [chosen, setChosen] = useState<{ drawId: string | null; slot: number } | null>(null);
  const [pending, setPending] = useState<"draw" | "lock" | null>(null);

  useEffect(() => {
    if (events.some((e) => e.type === "audio-missing"))
      toast.info("Trecho indisponível, outra carta sorteada");
  }, [events]);

  if (!view) return null;
  const isTurn = view.turnPlayerId === room.you;
  const turnMember = room.members.find((m) => m.id === view.turnPlayerId);
  const turnPlayer = view.players.find((p) => p.id === view.turnPlayerId);
  const isOwner = room.ownerId === room.you;
  const guessing = isTurn && view.phase === "guessing";
  // A choice only counts for the card it was made on.
  const chosenSlot = view.guess?.slot ?? (chosen?.drawId === drawId ? chosen.slot : null);
  const reveal = view.lastReveal;

  async function act(kind: "draw" | "lock", intent: object) {
    setPending(kind);
    const ack = await send("game:action", intent);
    setPending(null);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error));
  }

  return (
    <section aria-label="Hitline" className="flex flex-col gap-8">
      <h1 className="sr-only">Hitline</h1>
      <StatusStrip view={view} turnMember={turnMember} isTurn={isTurn} clock={clock} />
      {view.phase === "game-over" ? (
        <ResultPanel view={view} members={room.members} isOwner={isOwner} onNewGame={onNewGame} />
      ) : (
        <>
          <CardInPlay
            view={view}
            isTurn={isTurn}
            connected={connected}
            chosenSlot={chosenSlot}
            pending={pending}
            onDraw={() => void act("draw", { type: "draw" })}
            onLock={() =>
              chosenSlot !== null &&
              void act("lock", { type: "lock-guess", slot: chosenSlot, title: "", artist: "" })
            }
          />
          {turnPlayer ? (
            <Timeline
              ownerName={turnMember?.name ?? ""}
              cards={turnPlayer.timeline}
              interactive={guessing && connected}
              selectedSlot={chosenSlot}
              onSelect={(slot) => setChosen({ drawId, slot })}
            />
          ) : null}
        </>
      )}
      {reveal ? (
        <RevealPanel
          reveal={reveal}
          playerName={room.members.find((m) => m.id === reveal.turnPlayerId)?.name ?? "Alguém"}
        />
      ) : null}
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
