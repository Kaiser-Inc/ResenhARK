"use client";

import type { MemberView } from "@resenhark/shared";
import { LinkIcon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { ResenharkLogo } from "@/components/brand/resenhark-logo";
import { PeopleList } from "@/components/room/people-list";
import { RoomHomeLink } from "@/components/room/room-home-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** What the signed-in member can do in the room; absent until the first state arrives. */
export type RoomActions = {
  youId: string;
  isOwner: boolean;
  /** The connection is down: nothing that needs the server can run. */
  disabled: boolean;
  onRemove: (member: MemberView) => void;
  onLeave: () => Promise<void>;
  gameRunning: boolean;
  arriving?: boolean;
};

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

export function RoomPeople({
  members,
  actions,
}: {
  members: MemberView[] | null;
  actions?: RoomActions | null;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs text-muted-foreground">Pessoas</h2>
      <PeopleList
        members={members}
        youId={actions?.youId}
        happyMemberId={actions?.arriving ? actions.youId : undefined}
        onRemove={actions?.isOwner ? actions.onRemove : undefined}
        actionsDisabled={actions?.disabled}
      />
    </section>
  );
}

export function LeaveRoom({ actions }: { actions: RoomActions }) {
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" disabled={actions.disabled}>
          <LogOutIcon aria-hidden="true" strokeWidth={1.75} />
          Sair da sala
        </Button>
      }
      title="Sair da sala?"
      description="Você pode voltar pelo código como alguém novo."
      confirmLabel="Sair"
      variant="destructive"
      confirmDisabled={actions.disabled}
      onConfirm={actions.onLeave}
    />
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

export function RoomSidebar({
  code,
  members,
  actions,
  className,
}: {
  code: string;
  members: MemberView[] | null;
  actions: RoomActions | null;
  className?: string;
}) {
  return (
    <aside
      aria-label="Painel da sala"
      className={`hidden w-60 shrink-0 flex-col border-border border-r bg-background lg:flex ${className ?? ""}`}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <RoomHomeLink code={code} gameRunning={actions?.gameRunning}>
          <ResenharkLogo className="h-6 w-auto shrink-0" />
          <span translate="no" className="text-base font-semibold tracking-tight">
            <span className="font-normal">Resenh</span>ARK
          </span>
        </RoomHomeLink>
      </div>
      <div className="px-4 py-4">
        <RoomCode code={code} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <RoomPeople members={members} actions={actions} />
      </div>
      <div className="flex flex-col gap-3 border-border border-t p-4">
        {actions ? (
          <div className="flex">
            <LeaveRoom actions={actions} />
          </div>
        ) : null}
        <ThemeRow />
      </div>
    </aside>
  );
}
