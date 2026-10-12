"use client";

import { Button } from "@/components/ui/button";
import { taleclueThumbnail } from "@/lib/taleclue";
import { cn } from "@/lib/utils";
import { Button as CardButton } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { TALECLUE_CARDS } from "@resenhark/shared";
import { CheckIcon, LayersIcon } from "lucide-react";
import { motion } from "motion/react";
import { type CSSProperties, useRef, useState } from "react";

function CardArt({
  cardId,
  label,
  full = false,
  spotlight = false,
  dimmed = false,
}: { cardId: string; label: string; full?: boolean; spotlight?: boolean; dimmed?: boolean }) {
  const [failed, setFailed] = useState(false);
  const card = TALECLUE_CARDS.find((card) => card.id === cardId);
  return (
    <div
      data-card-art
      className={cn(
        "relative aspect-[2/3] w-full rounded-lg bg-muted transition-opacity duration-[400ms]",
        spotlight && "taleclue-selection taleclue-attention",
        dimmed && "opacity-40",
      )}
    >
      {card && !failed ? (
        <img
          src={full ? card.image : taleclueThumbnail(card.image)}
          alt={card.alt}
          width={full ? 800 : 400}
          height={full ? 1200 : 600}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full rounded-lg object-cover"
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
  spotlight = false,
  dimmed = false,
}: {
  cardId: string;
  index: number;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  note?: string;
  animate?: boolean;
  spotlight?: boolean;
  dimmed?: boolean;
}) {
  const label = `Carta ${index + 1}`;
  const cardRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [returnTransform, setReturnTransform] = useState("scale(0.95)");
  return (
    <motion.div
      ref={cardRef}
      data-card-id={cardId}
      className="flex min-w-0 flex-col gap-2"
      initial={animate ? { transform: "translateY(16px)" } : false}
      animate={{ transform: selected ? "translateY(-2px)" : "translateY(0px)" }}
      exit={{ transform: "translateY(-64px) scale(0.85)" }}
      transition={{
        transform: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
      }}
    >
      {onSelect ? (
        <CardButton
          aria-label={label}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onSelect}
          className={cn(
            "relative w-full rounded-lg outline-none ring-1 ring-border focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default",
            selected && "taleclue-selection",
          )}
        >
          <CardArt cardId={cardId} label={label} spotlight={spotlight} dimmed={dimmed} />
          {selected ? (
            <span className="absolute right-2 top-2 rounded-md bg-primary p-1 text-primary-foreground">
              <CheckIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              <span className="sr-only">{label}</span>
            </span>
          ) : null}
        </CardButton>
      ) : (
        <CardArt cardId={cardId} label={label} spotlight={spotlight} dimmed={dimmed} />
      )}
      <div className="flex min-h-4 flex-wrap items-center justify-between gap-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        {note ? <span className="min-w-0 break-words font-medium">{note}</span> : null}
      </div>
      <Dialog.Root
        onOpenChange={(open) => {
          if (open) return;
          const source = cardRef.current?.querySelector("[data-card-art]")?.getBoundingClientRect();
          const popup = popupRef.current?.getBoundingClientRect();
          if (source && popup) {
            const x = source.x + source.width / 2 - (popup.x + popup.width / 2);
            const y = source.y + source.height / 2 - (popup.y + popup.height / 2);
            setReturnTransform(`translate(${x}px, ${y}px) scale(${source.width / popup.width})`);
          }
        }}
      >
        <Dialog.Trigger
          render={<Button variant="ghost" className="w-full px-1" />}
          aria-label={`Ampliar carta ${index + 1}`}
        >
          Ampliar
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0" />
          <Dialog.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Popup
              ref={popupRef}
              style={{ "--card-return-transform": returnTransform } as CSSProperties}
              className="group pointer-events-auto relative w-[min(480px,calc(100vw-32px),calc((100dvh-96px)*2/3))] outline-hidden transition-opacity duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)] data-starting-style:opacity-0 data-ending-style:opacity-0"
            >
              <Dialog.Title className="sr-only">{label}</Dialog.Title>
              <div
                data-card-zoom-art
                className="transition-transform duration-[280ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-data-starting-style:scale-95 group-data-ending-style:[transform:var(--card-return-transform)]"
              >
                <CardArt cardId={cardId} label={label} full />
              </div>
              <Dialog.Close
                render={
                  <Button
                    variant="secondary"
                    className="fixed right-4 top-4 group-data-ending-style:invisible"
                  />
                }
              >
                Fechar
              </Dialog.Close>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </motion.div>
  );
}
