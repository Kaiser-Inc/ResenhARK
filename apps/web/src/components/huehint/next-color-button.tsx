"use client";

import { Button } from "@/components/ui/button";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Stays busy until the reveal unmounts after the server's next projection. */
export function NextColorButton({ send, connected }: { send: Send; connected: boolean }) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function advance() {
    if (!connected || busy.current) return;
    busy.current = true;
    setPending(true);
    const ack = await send("game:action", { type: "next-round" });
    if (!ack.ok) {
      busy.current = false;
      setPending(false);
      toast.error(gameErrorMessage(ack.error));
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.repeat || event.isComposing || event.defaultPrevented)
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button, a, input, textarea, select, [contenteditable], [role='dialog'], [role='alertdialog']",
        )
      )
        return;
      event.preventDefault();
      void advance();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex items-center gap-2">
      <Button type="button" loading={pending} disabled={!connected} onClick={() => void advance()}>
        Próxima cor
      </Button>
      <kbd className="rounded-sm border border-border-strong px-1.5 font-mono text-xs text-muted-foreground">
        Enter
      </kbd>
    </div>
  );
}
