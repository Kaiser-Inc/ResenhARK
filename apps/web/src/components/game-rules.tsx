import {
  GAME_RULES,
  type GameType,
  HUEHINT_RANK_RULES,
  type RulesSetup,
  currentSettings,
} from "@/lib/game-rules";
import { cn } from "@/lib/utils";

export function GameRules({
  game,
  variant = "full",
  setup,
  headingLevel = 3,
}: { game: GameType; variant?: "short" | "full"; setup?: RulesSetup; headingLevel?: 2 | 3 }) {
  const rules = GAME_RULES[game];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex flex-col gap-1",
          variant === "full" && "rounded-md p-4 text-foreground",
          variant === "full" &&
            (game === "hitline"
              ? "bg-game-hitline"
              : game === "huehint"
                ? "bg-game-huehint"
                : "bg-muted"),
        )}
      >
        <Heading className="text-lg leading-7 font-semibold">{rules.name}</Heading>
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
        {(variant === "short" ? rules.shortRules : rules.rules).map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      {variant === "full" && game === "huehint" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Ranks da dupla · B para vencer</p>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Ranks da dupla por percentual da nota máxima</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-2">
                  Rank
                </th>
                <th scope="col" className="py-2 pr-2">
                  Nota / máximo
                </th>
                <th scope="col" className="py-2">
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody>
              {HUEHINT_RANK_RULES.map(({ rank, range, result }) => (
                <tr key={rank} className="border-b border-border">
                  <th scope="row" className="py-2 pr-2 font-mono">
                    {rank}
                  </th>
                  <td className="py-2 pr-2">{range}</td>
                  <td className="py-2">
                    {result}
                    {rank === "B" ? " · Meta" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
