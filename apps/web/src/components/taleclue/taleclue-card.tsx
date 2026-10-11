"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Button as CardButton } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { TALECLUE_CARDS } from "@resenhark/shared";
import { CheckIcon, LayersIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

function CardArt({ cardId, label }: { cardId: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const card = TALECLUE_CARDS.find((card) => card.id === cardId);
  return (
    <div data-card-art className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted">
      {card && !failed ? (
        <img
          src={card.image}
          alt={label}
          width={480}
          height={720}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          role="img"
          aria-label={label}
          className="flex size-full items-center justify-center text-muted-foreground"
        >
          <LayersIcon aria-hidden="true" className="size-10" strokeWidth={1.75} />
        </div>
      )}
    </div>
  );
}

/** Selection and enlargement have separate triggers; zoom never changes the action. */
export function TaleclueCard({
  cardId,
  index,
  selected = false,
  disabled = false,
  onSelect,
  note,
  animate = true,
}: {
  cardId: string;
  index: number;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  note?: string;
  animate?: boolean;
}) {
  const label = `Carta ${index + 1}`;
  return (
    <motion.div
      data-card-id={cardId}
      className="flex min-w-0 flex-col gap-2"
      initial={animate ? { opacity: 0, transform: "translateY(16px)" } : false}
      animate={{ opacity: 1, transform: selected ? "translateY(-8px)" : "translateY(0px)" }}
      exit={{ opacity: 0, transform: "translateY(-64px) scale(0.85)" }}
      transition={{ duration: 0.3, delay: animate ? index * 0.035 : 0, ease: [0.23, 1, 0.32, 1] }}
    >
      {onSelect ? (
        <CardButton
          aria-label={label}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onSelect}
          className={cn(
            "relative w-full rounded-lg outline-hidden ring-1 ring-border transition-[box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default",
            selected && "ring-2 ring-primary-text",
          )}
        >
          <CardArt cardId={cardId} label={label} />
          {selected ? (
            <span className="absolute right-2 top-2 rounded-md bg-primary p-1 text-primary-foreground">
              <CheckIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              <span className="sr-only">{label}</span>
            </span>
          ) : null}
        </CardButton>
      ) : (
        <CardArt cardId={cardId} label={label} />
      )}
      <div className="flex min-h-4 flex-wrap items-center justify-between gap-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        {note ? <span className="min-w-0 break-words font-medium">{note}</span> : null}
      </div>
      <Dialog.Root>
        <Dialog.Trigger
          render={<Button variant="ghost" className="w-full px-1" />}
          aria-label={`Ampliar carta ${index + 1}`}
        >
          Ampliar
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0" />
          <Dialog.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Popup className="pointer-events-auto relative w-[min(480px,calc(100vw-32px),calc((100dvh-96px)*2/3))] outline-hidden transition-[opacity,transform] duration-200 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
              <Dialog.Title className="sr-only">{label}</Dialog.Title>
              <CardArt cardId={cardId} label={label} />
              <Dialog.Close render={<Button variant="secondary" className="fixed right-4 top-4" />}>
                Fechar
              </Dialog.Close>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </motion.div>
  );
}
