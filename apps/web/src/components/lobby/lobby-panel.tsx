"use client";

import { GameConfigForm } from "@/components/lobby/game-config-form";
import { HowToPlay } from "@/components/lobby/how-to-play";
import { HuehintConfigForm } from "@/components/lobby/huehint-config-form";
import { PlaylistImport } from "@/components/lobby/playlist-import";
import { TaleclueConfigForm } from "@/components/lobby/taleclue-config-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import { deckLabel, smallDeckWarning } from "@/lib/lobby-copy";
import type { RoomView } from "@resenhark/shared";
import { useState } from "react";
import { toast } from "sonner";

const GAMES = [
  { value: "hitline", label: "Hitline" },
  { value: "huehint", label: "Huehint" },
  { value: "taleclue", label: "Taleclue" },
];

export function LobbyPanel({
  room,
  send,
  connected,
}: { room: RoomView; send: Send; connected: boolean }) {
  const [starting, setStarting] = useState(false);
  const [changing, setChanging] = useState(false);
  const isOwner = room.ownerId === room.you;
  const owner = room.members.find((m) => m.id === room.ownerId);
  const { lobby } = room;
  const taleclue = lobby.selectedGame === "taleclue";
  const hitline = lobby.selectedGame === "hitline";
  const enoughPlayers = !taleclue || room.members.filter((member) => member.online).length >= 3;
  async function act(event: string, payload?: unknown) {
    const ack = await send(event, payload);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error, taleclue ? "taleclue" : undefined));
    return ack;
  }
  async function configure(event: string, payload: unknown) {
    setChanging(true);
    await act(event, payload);
    setChanging(false);
  }
  return (
    <section aria-label="Lobby" className="flex flex-col gap-8">
      <PageHeader
        title="Lobby"
        description={
          hitline
            ? "Escolha o jogo, monte a pilha de músicas e chame o time."
            : taleclue
              ? "Uma pista, várias cartas. Encontre a carta do narrador."
              : "Uma cor, uma dica. Chame o time ou treine de memória sozinho."
        }
      />
      {isOwner ? (
        <Field className="max-w-sm">
          <FieldLabel htmlFor="selected-game">Jogo da sala</FieldLabel>
          <Select
            items={GAMES}
            value={lobby.selectedGame}
            disabled={!connected || changing || starting}
            onValueChange={(game) => {
              if (game) void configure("lobby:select-game", { game });
            }}
          >
            <SelectTrigger id="selected-game" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAMES.map((game) => (
                <SelectItem key={game.value} value={game.value}>
                  {game.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <p className="font-medium">
          Jogo escolhido: {GAMES.find((game) => game.value === lobby.selectedGame)?.label}
        </p>
      )}
      <div className="flex max-w-[960px] flex-col gap-6">
        {!isOwner ? (
          <p className="text-base font-medium">Aguardando {owner?.name ?? "o dono"} iniciar</p>
        ) : null}
        {hitline ? (
          <>
            {isOwner ? (
              <PlaylistImport
                playlist={lobby.playlist}
                warning={smallDeckWarning(
                  lobby.smallPlaylist,
                  room.members.filter((member) => member.online).length,
                  lobby.config.maxPlayers,
                  lobby.config.targetCards,
                )}
                disabled={!connected || starting}
                onImport={(link) => send("lobby:import", { link })}
                remaining={lobby.remaining}
                onResetPlayed={() => void act("lobby:reset-played")}
                onUseDefault={() => act("lobby:use-default-deck")}
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{deckLabel(lobby.playlist)}</p>
                {lobby.remaining < lobby.playlist.count ? (
                  <p className="text-sm font-medium">
                    Restam {lobby.remaining} de {lobby.playlist.count} músicas
                  </p>
                ) : null}
              </>
            )}
            <GameConfigForm
              config={lobby.config}
              disabled={!connected || changing || starting}
              onChange={isOwner ? (config) => void configure("lobby:configure", config) : undefined}
            />
          </>
        ) : taleclue ? (
          <TaleclueConfigForm
            config={lobby.taleclueConfig}
            disabled={!connected || changing || starting}
            onChange={
              isOwner ? (config) => void configure("lobby:configure-taleclue", config) : undefined
            }
          />
        ) : (
          <>
            <HuehintConfigForm
              config={lobby.huehintConfig}
              disabled={!connected || changing || starting}
              onChange={
                isOwner ? (config) => void configure("lobby:configure-huehint", config) : undefined
              }
            />
            <p className="text-sm text-muted-foreground">
              Com uma pessoa online: treino solo de 5 rodadas. A cor aparece por 5 segundos.
            </p>
          </>
        )}
        <HowToPlay
          key={lobby.selectedGame}
          setup={
            hitline
              ? { type: "hitline", config: lobby.config }
              : taleclue
                ? { type: "taleclue", config: lobby.taleclueConfig }
                : { type: "huehint", config: lobby.huehintConfig }
          }
        />
        {isOwner ? (
          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              loading={starting}
              disabled={!connected || changing || !enoughPlayers}
              aria-describedby={!enoughPlayers ? "taleclue-player-minimum" : undefined}
              onClick={async () => {
                setStarting(true);
                await act("game:start");
                setStarting(false);
              }}
            >
              Iniciar partida
            </Button>
            {!enoughPlayers ? (
              <p id="taleclue-player-minimum" className="text-sm text-muted-foreground">
                {gameErrorMessage("not-enough-players", "taleclue")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
