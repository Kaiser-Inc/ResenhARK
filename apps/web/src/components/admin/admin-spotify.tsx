"use client";

import { CheckCircle2Icon, CircleSlashIcon } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, adminAuthorize, adminDisconnect, adminLogin, adminStatus } from "@/lib/api";
import { loadAdminToken, saveAdminToken } from "@/lib/session";

type Status = { connected: boolean; configured: boolean };

function LoginForm({ onToken }: { onToken: (token: string) => void }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      onToken(await adminLogin(password));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Senha incorreta"
          : err instanceof ApiError && err.status === 429
            ? "Muitas tentativas. Espera um minuto e tenta de novo."
            : "Não deu para entrar. Tenta de novo.",
      );
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={id}>Senha</FieldLabel>
        <Input
          id={id}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </Field>
      <Button type="submit" loading={loading} disabled={!password} className="w-fit">
        Entrar
      </Button>
    </form>
  );
}

export function AdminSpotify() {
  // `undefined` until sessionStorage is read, so the first paint does not flash the login.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<Status | null>(null);
  const [connecting, setConnecting] = useState(false);

  const logout = useCallback(() => {
    saveAdminToken(null);
    setToken(null);
    setStatus(null);
  }, []);

  useEffect(() => {
    setToken(loadAdminToken());
    const result = new URLSearchParams(window.location.search).get("status");
    if (result === "connected") toast.success("Spotify conectado");
    else if (result === "error") toast.error("Conexão cancelada");
    if (result) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    adminStatus(token)
      .then((next) => !cancelled && setStatus(next))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) logout();
        else toast.error("Não deu para ver o status. Tenta de novo.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  async function connect() {
    if (!token) return;
    setConnecting(true);
    try {
      window.location.assign(await adminAuthorize(token));
    } catch (err) {
      setConnecting(false);
      if (err instanceof ApiError && err.status === 401) logout();
      else if (err instanceof ApiError && err.status === 503)
        setStatus((s) => (s ? { ...s, configured: false } : s));
      else toast.error("Não deu para conectar. Tenta de novo.");
    }
  }

  async function disconnect() {
    if (!token) return;
    try {
      await adminDisconnect(token);
      setStatus((s) => (s ? { ...s, connected: false } : s));
      toast.success("Spotify desconectado");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
      else toast.error("Não deu para desconectar. Tenta de novo.");
      throw err;
    }
  }

  if (token === undefined || (token && !status)) {
    return <Skeleton className="h-8 w-48" />;
  }
  if (!token) {
    return (
      <LoginForm
        onToken={(next) => {
          saveAdminToken(next);
          setToken(next);
        }}
      />
    );
  }
  const current = status as Status;
  return (
    <section aria-label="Conexão" className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        {current.connected ? (
          <>
            <CheckCircle2Icon
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-5 text-success"
            />
            Conectado
          </>
        ) : (
          <>
            <CircleSlashIcon
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-5 text-muted-foreground"
            />
            Desconectado
          </>
        )}
      </p>
      {!current.configured ? (
        <p className="text-sm text-muted-foreground">Spotify não configurado no servidor</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button loading={connecting} onClick={connect}>
            Conectar Spotify
          </Button>
          {current.connected ? (
            <ConfirmDialog
              trigger={<Button variant="outline">Desconectar</Button>}
              title="Desconectar o Spotify?"
              description="Ninguém consegue importar playlist até alguém conectar de novo."
              confirmLabel="Desconectar"
              variant="destructive"
              onConfirm={disconnect}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
