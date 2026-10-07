import type { GameType } from "@/lib/game-rules";

export function GameIllustration({ game }: { game: GameType }) {
  return (
    <svg
      viewBox="0 0 320 180"
      aria-hidden="true"
      className="w-full max-w-xs self-center"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {game === "hitline" ? (
        <>
          <path d="M20 145h280" opacity=".5" />
          {[48, 128, 208].map((x, index) => (
            <g key={x} transform={`translate(${x} ${30 - index * 4})`}>
              <rect width="64" height="92" rx="6" fill="currentColor" fillOpacity=".08" />
              <path d="M16 66h32M16 76h24M40 22v26m0-20 10-3v19" />
              <circle cx="35" cy="48" r="5" />
              <circle cx="45" cy="44" r="5" />
            </g>
          ))}
          {[80, 160, 240].map((x) => (
            <circle key={x} cx={x} cy="145" r="4" fill="currentColor" />
          ))}
        </>
      ) : (
        <>
          {[32, 112, 192].map((x, index) => (
            <rect
              key={x}
              x={x}
              y="26"
              width="64"
              height="64"
              rx="6"
              fill="currentColor"
              fillOpacity={0.08 + index * 0.14}
            />
          ))}
          {[116, 136, 156].map((y, index) => (
            <g key={y}>
              <path d={`M32 ${y}h224`} opacity=".5" />
              <circle cx={88 + index * 52} cy={y} r="6" fill="var(--game-huehint)" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
