"use client";

import type { HitlineConfig, RoomView } from "@resenhark/shared";
import { useState } from "react";
import { toast } from "sonner";

import { GameConfigForm } from "@/components/lobby/game-config-form";
import { PlaylistImport } from "@/components/lobby/playlist-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import { cn } from "@/lib/utils";

type LobbyPanelProps = {
  room: RoomView;
  send: Send;
  connected: boolean;
};

const SOON = ["SiteSpy", "Codetalk"];

function GameList() {
  return (
    <ul aria-label="Jogos" className="flex flex-col gap-1">
      <li className="flex h-10 items-center gap-2 text-sm font-medium">
        Hitline
        <Badge variant="primary">ativo</Badge>
      </li>
      {SOON.map((name) => (
        <li
          key={name}
          className={cn("flex h-10 items-center gap-2 text-sm text-subtle-foreground")}
        >
          {name}
          <Badge>em breve</Badge>
        </li>
      ))}
    </ul>
  );
}

function smallPlaylistWarning(room: RoomView): string | null {
  if (!room.lobby.smallPlaylist) return null;
  const online = room.members.filter((m) => m.online).length;
  const players = Math.max(1, Math.min(online, room.lobby.config.maxPlayers));
  return `Playlist pequena para ${players} ${players === 1 ? "jogador" : "jogadores"} e N=${room.lobby.config.targetCards}: a partida pode acabar antes de alguém vencer`;
}

export function LobbyPanel({ room, send, connected }: LobbyPanelProps) {
  const [starting, setStarting] = useState(false);
  const isOwner = room.ownerId === room.you;
  const owner = room.members.find((m) => m.id === room.ownerId);
  const { lobby } = room;

  async function act(event: string, payload?: unknown) {
    const ack = await send(event, payload);
    if (!ack.ok) toast.error(gameErrorMessage(ack.error));
    return ack;
  }

  async function start() {
    setStarting(true);
    await act("game:start");
    setStarting(false);
  }

  return (
    <section aria-label="Lobby" className="flex flex-col gap-8">
      <PageHeader
        title="Lobby"
        description="Escolha o jogo, monte a pilha de músicas e chame o time."
      />
      <GameList />
      {isOwner ? (
        <div className="flex max-w-[960px] flex-col gap-6">
          <PlaylistImport
            playlist={lobby.playlist}
            warning={smallPlaylistWarning(room)}
            disabled={!connected}
            onImport={(link) => send("lobby:import", { link })}
            remaining={lobby.remaining}
            onResetPlayed={() => void act("lobby:reset-played")}
          />
          <GameConfigForm
            config={lobby.config}
            disabled={!connected}
            onChange={(config: HitlineConfig) => void act("lobby:configure", config)}
          />
          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              loading={starting}
              disabled={!connected || !lobby.playlist}
              onClick={start}
            >
              Iniciar partida
            </Button>
            {lobby.playlist ? null : (
              <p className="text-sm text-muted-foreground">Importe uma playlist para começar.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex max-w-[960px] flex-col gap-4">
          <p className="text-base font-medium">Aguardando {owner?.name ?? "o dono"} iniciar</p>
          {lobby.playlist ? (
            <p className="text-sm text-muted-foreground">
              {lobby.playlist.count} faixas · {lobby.playlist.name}
            </p>
          ) : null}
          {lobby.playlist && lobby.remaining !== null && lobby.remaining < lobby.playlist.count ? (
            <p className="text-sm font-medium">
              Restam {lobby.remaining} de {lobby.playlist.count} músicas
            </p>
          ) : null}
          <GameConfigForm config={lobby.config} />
        </div>
      )}
    </section>
  );
}
