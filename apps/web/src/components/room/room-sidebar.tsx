"use client";

import type { MemberView } from "@resenhark/shared";
import { LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { ResenharkLogo } from "@/components/brand/resenhark-logo";
import { PeopleList } from "@/components/room/people-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

async function copyLink(code: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/sala/${code}`);
    toast.success("Link copiado");
  } catch {
    toast.error("Não deu para copiar. Copia o endereço da barra do navegador.");
  }
}

export function RoomCode({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-xs text-muted-foreground">Código da sala</p>
      <p translate="no" className="font-mono text-xl leading-7 font-semibold tracking-[0.15em]">
        {code}
      </p>
      <Button type="button" variant="outline" onClick={() => copyLink(code)}>
        <LinkIcon aria-hidden="true" strokeWidth={1.75} />
        Copiar link
      </Button>
    </div>
  );
}

export function RoomPeople({ members }: { members: MemberView[] | null }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs text-muted-foreground">Pessoas</h2>
      <PeopleList members={members} />
    </section>
  );
}

export function ThemeRow() {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">Tema</span>
      <ThemeToggle />
    </div>
  );
}

export function RoomSidebar({ code, members }: { code: string; members: MemberView[] | null }) {
  return (
    <aside
      aria-label="Painel da sala"
      className="hidden w-60 shrink-0 flex-col border-border border-r bg-background lg:flex"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <ResenharkLogo className="h-6 w-auto shrink-0" />
        <span translate="no" className="text-base font-semibold tracking-tight">
          <span className="font-normal">Resenh</span>ARK
        </span>
      </div>
      <div className="px-4 py-4">
        <RoomCode code={code} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <RoomPeople members={members} />
      </div>
      <div className="border-border border-t p-4">
        <ThemeRow />
      </div>
    </aside>
  );
}
