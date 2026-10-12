import type { Ack, Decade, LobbyView } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { useId, useMemo } from "react";

import { useChipSelection } from "@/components/lobby/use-chip-selection";
import { Button } from "@/components/ui/button";

export function DecadeFilter({
  decades,
  disabled,
  onChange,
}: {
  decades: LobbyView["decades"];
  disabled: boolean;
  onChange?: (decades: Decade[]) => Promise<Ack>;
}) {
  const reasonId = useId();
  const serverSelected = useMemo(
    () => decades.filter((decade) => decade.selected).map((decade) => decade.id),
    [decades],
  );
  const { selected, busy, change } = useChipSelection(serverSelected, onChange);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium">Épocas</h2>
      <p className="text-sm text-muted-foreground">Tire as épocas que a mesa não conhece.</p>
      <fieldset aria-label="Épocas" aria-busy={busy} className="flex flex-wrap gap-2">
        {(onChange ? decades : decades.filter((decade) => decade.selected)).map((decade) => {
          const pressed = selected.includes(decade.id);
          const last = pressed && selected.length === 1;
          return (
            <Button
              key={decade.id}
              type="button"
              variant="outline"
              aria-pressed={pressed}
              aria-label={`${decade.label}, ${decade.available} músicas`}
              aria-describedby={onChange && last ? reasonId : undefined}
              title={onChange && last ? "Mantenha pelo menos uma época marcada." : undefined}
              disabled={disabled || !onChange || last}
              className="rounded-full transition-colors duration-150 active:not-aria-disabled:scale-100 aria-pressed:border-primary-text aria-pressed:bg-secondary aria-pressed:text-primary-text"
              onClick={() =>
                void change(
                  pressed ? selected.filter((id) => id !== decade.id) : [...selected, decade.id],
                )
              }
            >
              <CheckIcon
                aria-hidden="true"
                strokeWidth={1.75}
                className={pressed ? "size-3.5 shrink-0 visible" : "size-3.5 shrink-0 invisible"}
              />
              {decade.label}
              <span className="min-w-[4ch] text-right tabular-nums">{decade.available}</span>
            </Button>
          );
        })}
      </fieldset>
      <p id={reasonId} className="sr-only">
        Mantenha pelo menos uma época marcada.
      </p>
    </div>
  );
}
