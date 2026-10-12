"use client";

import type { Ack, ErrorCode } from "@resenhark/shared";
import Link from "next/link";
import { useId, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { gameErrorMessage } from "@/lib/game-errors";
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
  disabled: boolean;
  onImport: (link: string) => Promise<Ack>;
};

export function PlaylistImport({ disabled, onImport }: PlaylistImportProps) {
  const id = useId();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || !link.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const ack = await onImport(link.trim());
      if (!ack.ok) setError(IMPORT_ERRORS[ack.error] ?? gameErrorMessage(ack.error));
    } finally {
      setLoading(false);
    }
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
    </form>
  );
}
