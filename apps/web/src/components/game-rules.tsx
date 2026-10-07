import { GAME_RULES, type GameType, type RulesSetup, currentSettings } from "@/lib/game-rules";
import { cn } from "@/lib/utils";

export function GameRules({
  game,
  variant = "full",
  setup,
}: { game: GameType; variant?: "short" | "full"; setup?: RulesSetup }) {
  const rules = GAME_RULES[game];
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex flex-col gap-1",
          variant === "full" && "rounded-md p-4 text-foreground",
          variant === "full" && (game === "hitline" ? "bg-game-hitline" : "bg-game-huehint"),
        )}
      >
        <h3 className="text-lg leading-7 font-semibold">{rules.name}</h3>
        <p className="text-sm">{rules.players}</p>
      </div>
      {setup ? (
        <ul aria-label="Configuração atual" className="flex flex-col gap-1 text-sm font-medium">
          {currentSettings(setup).map((setting) => (
            <li key={setting}>{setting}</li>
          ))}
        </ul>
      ) : null}
      <ul
        aria-label={`Regras do ${rules.name}`}
        className="flex list-disc flex-col gap-3 pl-4 text-sm leading-5"
      >
        {rules.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </div>
  );
}
