"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import { type ReactNode, useRef, useState } from "react";

export function RoomHomeLink({
  code,
  gameRunning = false,
  children,
}: { code: string; gameRunning?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <Link
        ref={link}
        href="/"
        aria-label="ResenhARK, início"
        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md outline-hidden transition-colors duration-[120ms] ease-out hover:text-primary-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:text-primary-text"
        onClick={(event) => {
          if (!gameRunning) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Link>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) link.current?.focus();
        }}
        title="Sair da sala?"
        description={`A partida continua sem você. Para voltar, use o código ${code}.`}
        confirmLabel="Sair"
        cancelLabel="Ficar"
        onConfirm={() => window.location.assign("/")}
      />
    </>
  );
}
