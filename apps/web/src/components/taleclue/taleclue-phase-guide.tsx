"use client";

import { Button } from "@/components/ui/button";
import type { TaleclueGuidance } from "@/lib/taleclue-guidance";
import { useId, useState } from "react";

export function TalecluePhaseGuide({
  guidance,
  helpOnly = false,
}: { guidance: TaleclueGuidance; helpOnly?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section
      data-phase-guidance
      aria-labelledby={helpOnly ? undefined : `${id}-title`}
      className="flex flex-col gap-3"
    >
      {!helpOnly ? (
        <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
          <h2 id={`${id}-title`} className="break-words text-xl font-semibold">
            {guidance.title}
          </h2>
          <p className="text-sm text-muted-foreground">{guidance.description}</p>
        </div>
      ) : null}
      <Button
        variant="ghost"
        className="self-start"
        aria-expanded={open}
        aria-controls={`${id}-help`}
        onClick={() => setOpen(!open)}
      >
        Entenda esta fase
      </Button>
      <p id={`${id}-help`} hidden={!open} className="text-sm text-muted-foreground">
        {guidance.help}
      </p>
    </section>
  );
}
