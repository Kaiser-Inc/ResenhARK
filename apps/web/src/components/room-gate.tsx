"use client";

import { SearchXIcon, WifiOffIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { JoinForm } from "@/components/join-form";
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
import { Skeleton } from "@/components/ui/skeleton";
import { joinRoom, roomExists } from "@/lib/api";
import { loadSession, saveSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Gate =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "join" }
  | { kind: "joined"; name?: string };

export function RoomGate({ code }: { code: string }) {
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the lookup on retry
  useEffect(() => {
    let cancelled = false;
    const session = loadSession(code);
    if (session) {
      setGate({ kind: "joined", name: session.name });
      return;
    }
    roomExists(code)
      .then((exists) => !cancelled && setGate({ kind: exists ? "join" : "missing" }))
      .catch(() => !cancelled && setGate({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  if (gate.kind === "loading") {
    return (
      <main id="main-content" className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6">
        <div aria-busy="true" aria-label="Carregando a sala" className="flex flex-col gap-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-control w-full" />
        </div>
      </main>
    );
  }

  if (gate.kind === "missing") {
    return (
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
    );
  }

  if (gate.kind === "error") {
    return (
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
    );
  }

  if (gate.kind === "joined") {
    return (
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-12 sm:px-6"
      >
        <PageHeader title={`Sala ${code}`} />
        {gate.name ? <p className="font-medium">{gate.name}</p> : null}
      </main>
    );
  }

  return (
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
          setGate({ kind: "joined", name: input.name });
        }}
      />
    </main>
  );
}
