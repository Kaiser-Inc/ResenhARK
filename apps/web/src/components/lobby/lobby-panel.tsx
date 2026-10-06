"use client";

import { GameConfigForm } from "@/components/lobby/game-config-form";
import { HuehintConfigForm } from "@/components/lobby/huehint-config-form";
import { PlaylistImport } from "@/components/lobby/playlist-import";
import { Badge } from "@/components/ui/badge";
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
import type { RoomView } from "@resenhark/shared";
import { useState } from "react";
import { toast } from "sonner";

const GAMES = [
  { value: "hitline", label: "Hitline" },
  { value: "huehint", label: "Huehint" },
];

function smallPlaylistWarning(room: RoomView): string | null {
  if (!room.lobby.smallPlaylist) return null;
  const online = room.members.filter((m) => m.online).length;
  const players = Math.max(1, Math.min(online, room.lobby.config.maxPlayers));
  return `Playlist pequena para ${players} ${players === 1 ? "jogador" : "jogadores"} e N=${room.lobby.config.targetCards}: a partida pode acabar antes de alguém vencer`;
}

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
  const hitline = lobby.selectedGame === "hitline";
  async function act(event: string, payload?: unknown) {
    const ack = await send(event, payload);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error));
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
        <p className="font-medium">Jogo escolhido: {hitline ? "Hitline" : "Huehint"}</p>
      )}
      <ul aria-label="Jogos" className="flex flex-wrap gap-4 text-sm">
        {["SiteSpy", "Codetalk"].map((name) => (
          <li key={name} className="flex items-center gap-2 text-subtle-foreground">
            {name}
            <Badge>em breve</Badge>
          </li>
        ))}
      </ul>
      <div className="flex max-w-[960px] flex-col gap-6">
        {!isOwner ? (
          <p className="text-base font-medium">Aguardando {owner?.name ?? "o dono"} iniciar</p>
        ) : null}
        {hitline ? (
          <>
            {isOwner ? (
              <PlaylistImport
                playlist={lobby.playlist}
                warning={smallPlaylistWarning(room)}
                disabled={!connected || starting}
                onImport={(link) => send("lobby:import", { link })}
                remaining={lobby.remaining}
                onResetPlayed={() => void act("lobby:reset-played")}
              />
            ) : (
              <>
                {lobby.playlist ? (
                  <p className="text-sm text-muted-foreground">
                    {lobby.playlist.count} faixas · {lobby.playlist.name}
                  </p>
                ) : null}
                {lobby.playlist &&
                lobby.remaining !== null &&
                lobby.remaining < lobby.playlist.count ? (
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
        {isOwner ? (
          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              loading={starting}
              disabled={!connected || changing || (hitline && !lobby.playlist)}
              onClick={async () => {
                setStarting(true);
                await act("game:start");
                setStarting(false);
              }}
            >
              Iniciar partida
            </Button>
            {hitline && !lobby.playlist ? (
              <p className="text-sm text-muted-foreground">Importe uma playlist para começar.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
