import type { LobbyView } from "@resenhark/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { DecadeFilter } from "@/components/lobby/decade-filter";
import { GenrePicker } from "@/components/lobby/genre-picker";
import { PlaylistImport } from "@/components/lobby/playlist-import";
import { Button } from "@/components/ui/button";
import type { Send } from "@/lib/game-errors";
import { deckLabel, smallDeckWarning } from "@/lib/lobby-copy";

const SOURCES = [
  { value: "genres", label: "Gêneros" },
  { value: "galera", label: "Baralho da galera" },
  { value: "playlist", label: "Playlist" },
] as const;

export function HitlineLobby({
  lobby,
  isOwner,
  disabled,
  online,
  onAction,
}: {
  lobby: LobbyView;
  isOwner: boolean;
  disabled: boolean;
  online: number;
  onAction: Send;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const importing = isOwner && (importOpen || lobby.source === "playlist");
  const players = Math.max(1, Math.min(online, lobby.config.maxPlayers));
  const hasPlayedSongs =
    lobby.decades.reduce((total, decade) => total + decade.available, 0) < lobby.playlist.count;
  const warning = smallDeckWarning(
    lobby.source === "genres"
      ? lobby.available < players * lobby.config.targetCards * 2
      : lobby.smallPlaylist,
    online,
    lobby.config.maxPlayers,
    lobby.config.targetCards,
  );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Fonte das músicas</h2>
        {isOwner ? (
          <fieldset aria-label="Fonte das músicas" className="flex flex-wrap gap-2">
            {SOURCES.map((source) => (
              <Button
                key={source.value}
                type="button"
                variant="outline"
                disabled={disabled}
                aria-pressed={lobby.source === source.value}
                aria-expanded={source.value === "playlist" ? importing : undefined}
                className="transition-colors active:scale-100 aria-pressed:border-primary-text aria-pressed:bg-secondary aria-pressed:text-primary-text"
                onClick={async () => {
                  if (source.value === "playlist") {
                    setImportOpen(!importOpen);
                    return;
                  }
                  setImportOpen(false);
                  if (source.value !== lobby.source)
                    await onAction("lobby:set-source", { source: source.value });
                }}
              >
                {source.label}
              </Button>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">
            {SOURCES.find((source) => source.value === lobby.source)?.label}
          </p>
        )}
        {lobby.source !== "genres" ? (
          <output title={lobby.playlist.name} className="break-words text-sm font-medium">
            {deckLabel(lobby.playlist)}
          </output>
        ) : null}
        {importing ? (
          <PlaylistImport
            disabled={disabled}
            onImport={(link) => onAction("lobby:import", { link })}
          />
        ) : null}
        {isOwner && lobby.source === "playlist" ? (
          <Button
            type="button"
            variant="link"
            className="self-start px-0 transition-colors"
            disabled={disabled}
            onClick={async () => {
              const ack = await onAction("lobby:use-default-deck");
              if (ack.ok) setImportOpen(false);
            }}
          >
            Usar Baralho da galera
          </Button>
        ) : null}
      </div>
      {lobby.source === "genres" ? (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Gêneros</h2>
            <p className="text-sm text-muted-foreground">Seu voto</p>
            <GenrePicker
              genres={lobby.genres}
              selected={lobby.myGenres}
              label="Seu voto"
              votes
              disabled={disabled}
              onChange={(genres) => void onAction("lobby:vote-genres", { genres })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Lista da partida</h2>
            {lobby.genreMode === "votes" ? (
              <p className="text-sm text-muted-foreground">A lista acompanha os votos da mesa.</p>
            ) : isOwner ? (
              <Button
                type="button"
                variant="outline"
                className="self-start transition-colors active:scale-100"
                disabled={disabled}
                onClick={() => void onAction("lobby:follow-votes")}
              >
                Seguir votos
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Lista escolhida pelo dono da sala.</p>
            )}
            <GenrePicker
              genres={lobby.genres}
              selected={lobby.genres.filter((genre) => genre.selected).map((genre) => genre.id)}
              label="Lista da partida"
              disabled={disabled}
              onChange={
                isOwner ? (genres) => void onAction("lobby:set-genres", { genres }) : undefined
              }
            />
          </div>
        </>
      ) : null}
      <DecadeFilter
        decades={lobby.decades}
        disabled={disabled}
        onChange={
          isOwner ? (decades) => void onAction("lobby:set-decades", { decades }) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        <output aria-live="polite" className="text-base font-medium tabular-nums">
          {lobby.available} músicas disponíveis
        </output>
        {lobby.galeraFallback ? (
          <p className="text-sm text-muted-foreground">
            Nenhum gênero marcado: vai tocar o Baralho da galera.
          </p>
        ) : null}
        {hasPlayedSongs ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Restam {lobby.remaining} de {lobby.playlist.count} músicas
            </p>
            {isOwner ? (
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className="transition-colors active:scale-100"
                onClick={() => void onAction("lobby:reset-played")}
              >
                Recomeçar músicas
              </Button>
            ) : null}
          </div>
        ) : null}
        {warning ? (
          <output className="flex items-start gap-2 text-sm text-warning">
            <TriangleAlertIcon
              aria-hidden="true"
              strokeWidth={1.75}
              className="mt-0.5 size-4 shrink-0"
            />
            {warning}
          </output>
        ) : null}
      </div>
    </div>
  );
}
