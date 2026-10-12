import type { Ack, LobbyView } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { useId } from "react";

import { useChipSelection } from "@/components/lobby/use-chip-selection";
import { Button } from "@/components/ui/button";

export function GenrePicker({
  genres,
  selected: serverSelected,
  label,
  votes = false,
  disabled,
  onChange,
}: {
  genres: LobbyView["genres"];
  selected: number[];
  label: string;
  votes?: boolean;
  disabled: boolean;
  onChange?: (genres: number[]) => Promise<Ack>;
}) {
  const reasonId = useId();
  const { selected, busy, change } = useChipSelection(serverSelected, onChange);
  const visible = onChange ? genres : genres.filter((genre) => selected.includes(genre.id));
  return (
    <fieldset aria-label={label} aria-busy={busy} className="flex flex-wrap gap-2">
      {visible.map((genre) => {
        const pressed = selected.includes(genre.id);
        const unavailable = genre.available === 0;
        return (
          <Button
            key={genre.id}
            type="button"
            variant="outline"
            aria-pressed={pressed}
            aria-label={
              votes
                ? `${genre.name}, ${genre.votes} ${genre.votes === 1 ? "voto" : "votos"}`
                : genre.name
            }
            aria-describedby={unavailable ? reasonId : undefined}
            title={unavailable ? "Sem músicas disponíveis nas épocas marcadas." : undefined}
            disabled={disabled || !onChange || (votes && unavailable)}
            className="rounded-full transition-colors duration-150 active:not-aria-disabled:scale-100 aria-pressed:border-primary-text aria-pressed:bg-secondary aria-pressed:text-primary-text"
            onClick={() =>
              void change(
                pressed ? selected.filter((id) => id !== genre.id) : [...selected, genre.id],
              )
            }
          >
            <CheckIcon
              aria-hidden="true"
              strokeWidth={1.75}
              className={pressed ? "size-3.5 shrink-0 visible" : "size-3.5 shrink-0 invisible"}
            />
            {genre.name}
            {votes ? <span className="w-[2ch] text-right tabular-nums">{genre.votes}</span> : null}
          </Button>
        );
      })}
      {!visible.length ? (
        <p className="text-sm text-muted-foreground">Nenhum gênero marcado.</p>
      ) : null}
      <p id={reasonId} className="sr-only">
        Sem músicas disponíveis nas épocas marcadas.
      </p>
    </fieldset>
  );
}
