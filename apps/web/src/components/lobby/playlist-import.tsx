"use client";

import type { Ack, ErrorCode, LobbyView } from "@resenhark/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const IMPORT_ERRORS: Partial<Record<ErrorCode, string>> = {
  "playlist-invalid-link": "Link inválido",
  "playlist-no-access": "Sem acesso a esta playlist",
  "playlist-empty": "Playlist vazia",
  "spotify-disconnected": "Spotify desconectado. Um admin precisa conectar em /admin/spotify",
  "invalid-input": "Link inválido",
};

type PlaylistImportProps = {
  playlist: LobbyView["playlist"];
  /** Set when the playlist is likely too short; the text is built by the lobby. */
  warning: string | null;
  disabled: boolean;
  onImport: (link: string) => Promise<Ack>;
};

export function PlaylistImport({ playlist, warning, disabled, onImport }: PlaylistImportProps) {
  const id = useId();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
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
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={id}>Link da playlist</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={id}
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
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
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </Field>
      {playlist ? (
        <p className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="font-medium">{playlist.count} faixas prontas</span>
          <span title={playlist.name} className="min-w-0 truncate text-muted-foreground">
            {playlist.name}
          </span>
        </p>
      ) : null}
      {warning ? (
        <p className="flex items-start gap-2 text-sm text-warning">
          <TriangleAlertIcon
            aria-hidden="true"
            strokeWidth={1.75}
            className="mt-0.5 size-4 shrink-0"
          />
          {warning}
        </p>
      ) : null}
    </form>
  );
}
