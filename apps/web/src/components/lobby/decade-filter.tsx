import type { Decade, LobbyView } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";

export function DecadeFilter({
  decades,
  disabled,
  onChange,
}: {
  decades: LobbyView["decades"];
  disabled: boolean;
  onChange?: (decades: Decade[]) => void;
}) {
  const reasonId = useId();
  const selected = decades.filter((decade) => decade.selected).map((decade) => decade.id);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium">Épocas</h2>
      <p className="text-sm text-muted-foreground">Tire as épocas que a mesa não conhece.</p>
      <fieldset aria-label="Épocas" className="flex flex-wrap gap-2">
        {(onChange ? decades : decades.filter((decade) => decade.selected)).map((decade) => {
          const last = decade.selected && selected.length === 1;
          return (
            <Button
              key={decade.id}
              type="button"
              variant="outline"
              aria-pressed={decade.selected}
              aria-label={`${decade.label}, ${decade.available} músicas`}
              aria-describedby={onChange && last ? reasonId : undefined}
              title={onChange && last ? "Mantenha pelo menos uma época marcada." : undefined}
              disabled={disabled || !onChange || last}
              className="rounded-full transition-colors active:scale-100 aria-pressed:border-primary-text aria-pressed:bg-secondary aria-pressed:text-primary-text"
              onClick={() =>
                onChange?.(
                  decade.selected
                    ? selected.filter((id) => id !== decade.id)
                    : [...selected, decade.id],
                )
              }
            >
              {decade.selected ? (
                <CheckIcon aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
              ) : null}
              {decade.label}
              <span className="tabular-nums">{decade.available}</span>
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
