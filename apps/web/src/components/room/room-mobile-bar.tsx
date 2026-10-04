"use client";

import type { MemberView } from "@resenhark/shared";
import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { ResenharkLogo } from "@/components/brand/resenhark-logo";
import { RoomCode, RoomPeople, ThemeRow } from "@/components/room/room-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function RoomMobileBar({ code, members }: { code: string; members: MemberView[] | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-border border-b bg-background px-4 lg:hidden">
        <ResenharkLogo className="h-6 w-auto shrink-0" />
        <span
          translate="no"
          className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-[0.15em]"
        >
          <span className="sr-only">Código da sala </span>
          {code}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
        >
          <MenuIcon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </Button>
      </header>

      <Sheet side="right" open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sala</SheetTitle>
          </SheetHeader>
          <RoomCode code={code} />
          <RoomPeople members={members} />
          <div className="mt-auto border-border border-t pt-4">
            <ThemeRow />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
