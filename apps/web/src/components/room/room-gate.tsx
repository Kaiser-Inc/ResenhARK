"use client";

import { SearchXIcon, WifiOffIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { JoinForm } from "@/components/join-form";
import { RoomLoading, RoomShell } from "@/components/room/room-shell";
import { useRoomTransition } from "@/components/room/room-transition";
import { SiteBar } from "@/components/site-bar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page-header";
import { joinRoom, roomExists } from "@/lib/api";
import { clearSession, loadSession, saveSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Gate =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "join" }
  | { kind: "joined"; sessionToken: string; justJoined?: boolean };

export function RoomGate({ code }: { code: string }) {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { finish } = useRoomTransition();

  useEffect(() => {
    if (gate.kind === "missing" || gate.kind === "error" || gate.kind === "join") finish();
  }, [gate.kind, finish]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the lookup on retry
  useEffect(() => {
    let cancelled = false;
    const session = loadSession(code);
    if (session) {
      setGate({ kind: "joined", sessionToken: session.sessionToken });
      return;
    }
    roomExists(code)
      .then((exists) => !cancelled && setGate({ kind: exists ? "join" : "missing" }))
      .catch(() => !cancelled && setGate({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  // The server rejected the saved token: forget it and look the room up again, which
  // ends in "Sala não encontrada" or back in the join form.
  const handleInvalidSession = useCallback(() => {
    clearSession(code);
    setGate({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, [code]);

  if (gate.kind === "joined") {
    return (
      <RoomShell
        code={code}
        sessionToken={gate.sessionToken}
        focusOnMount={gate.justJoined}
        onInvalidSession={handleInvalidSession}
      />
    );
  }

  if (gate.kind === "loading") return <RoomLoading code={code} />;

  if (gate.kind === "missing") {
    return (
      <>
        <SiteBar />
        <main id="main-content" className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden="true" strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>
                <h1 className="text-xl">Sala não encontrada</h1>
              </EmptyTitle>
              <EmptyDescription>Confira o código ou peça o link de novo.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
                Voltar ao início
              </Link>
            </EmptyContent>
          </Empty>
        </main>
      </>
    );
  }

  if (gate.kind === "error") {
    return (
      <>
        <SiteBar />
        <main id="main-content" className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WifiOffIcon aria-hidden="true" strokeWidth={1.75} />
              </EmptyMedia>
              <EmptyTitle>
                <h1 className="text-xl">Não deu para falar com o servidor.</h1>
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => {
                  setGate({ kind: "loading" });
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar de novo
              </Button>
            </EmptyContent>
          </Empty>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteBar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-12 sm:px-6"
      >
        <PageHeader title="Entrar na sala" description={`Código ${code}`} />
        <JoinForm
          submitLabel="Entrar"
          onRoomMissing={() => setGate({ kind: "missing" })}
          onSubmit={async (input) => {
            const member = await joinRoom(code, input);
            saveSession(code, { ...member, name: input.name });
            setGate({ kind: "joined", sessionToken: member.sessionToken, justJoined: true });
          }}
        />
      </main>
    </>
  );
}
