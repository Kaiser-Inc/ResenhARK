"use client";

import type { Ack, ErrorCode, LobbyView } from "@resenhark/shared";
import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deckLabel } from "@/lib/lobby-copy";
import { cn } from "@/lib/utils";

const linkClass = cn(buttonVariants({ variant: "link" }), "px-0");

const IMPORT_ERRORS: Partial<Record<ErrorCode, string>> = {
  "playlist-invalid-link": "Link inválido. Cole o link de uma playlist do Spotify.",
  "playlist-no-access": "Sem acesso a esta playlist. Adicione Kaiser como colaborador.",
  "playlist-empty": "Playlist vazia",
  "spotify-disconnected": "Spotify desconectado. X",
  "invalid-input": "Link inválido. Cole o link de uma playlist do Spotify.",
};

type PlaylistImportProps = {
  playlist: LobbyView["playlist"];
  /** Set when the playlist is likely too short; the text is built by the lobby. */
  warning: string | null;
  disabled: boolean;
  onImport: (link: string) => Promise<Ack>;
  /** Songs not yet played in this room; the played-set controls show once it is below the count. */
  remaining: number;
  onResetPlayed: () => void;
  onUseDefault: () => Promise<Ack>;
};

export function PlaylistImport({
  playlist,
  warning,
  disabled,
  onImport,
  remaining,
  onResetPlayed,
  onUseDefault,
}: PlaylistImportProps) {
  const id = useId();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!link.trim() || loading) return;
    setLoading(true);
    setError(null);
    const ack = await onImport(link.trim());
    setLoading(false);
    if (!ack.ok) setError(IMPORT_ERRORS[ack.error] ?? "Não deu certo. Tenta de novo.");
  }

  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={id}>Link da playlist</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={id}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            type="url"
            name="playlist"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
            disabled={disabled}
          />
          <Button
            type="submit"
            variant="outline"
            loading={loading}
            disabled={disabled || !link.trim()}
          >
            Importar playlist
          </Button>
        </div>
        {error ? (
          <FieldError id={errorId}>
            {error}
            {error === IMPORT_ERRORS["spotify-disconnected"] ? (
              <>
                {" "}
                <Link href="/admin/spotify" className={cn(linkClass, "text-xs")}>
                  Conectar Spotify
                </Link>
              </>
            ) : null}
          </FieldError>
        ) : null}
        <p id={helpId} className="text-sm text-muted-foreground">
          Funciona com playlists do Spotify em que Kaiser é colaborador.
        </p>
      </Field>
      {remaining < playlist.count ? (
        <div className="flex flex-wrap items-center gap-3">
          <output className="text-sm font-medium">
            Restam {remaining} de {playlist.count} músicas
          </output>
          <Button type="button" variant="outline" disabled={disabled} onClick={onResetPlayed}>
            Recomeçar músicas
          </Button>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <output title={playlist.name} className="min-w-0 truncate text-sm font-medium">
          {deckLabel(playlist)}
        </output>
        {playlist.source === "playlist" ? (
          <Button
            type="button"
            variant="link"
            className="px-0"
            disabled={disabled || loading}
            loading={restoring}
            onClick={async () => {
              setRestoring(true);
              setError(null);
              const ack = await onUseDefault();
              setRestoring(false);
              if (!ack.ok) setError(IMPORT_ERRORS[ack.error] ?? "Não deu certo. Tenta de novo.");
            }}
          >
            Voltar ao baralho ResenhARK
          </Button>
        ) : null}
      </div>
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
    </form>
  );
}
