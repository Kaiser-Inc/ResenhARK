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
      ) : game === "huehint" ? (
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
      ) : (
        <g data-story-cards="true">
          <g transform="translate(52 38) rotate(-12 36 54)">
            <rect width="72" height="108" rx="6" fill="currentColor" fillOpacity=".08" />
            <circle cx="36" cy="34" r="14" />
            <path d="m10 88 20-28 12 16 10-12 10 24Z" />
          </g>
          <g transform="translate(196 38) rotate(12 36 54)">
            <rect width="72" height="108" rx="6" fill="currentColor" fillOpacity=".08" />
            <path d="M36 84V52m0 16-12-12m12 4 12-14" />
            <path d="M18 50a18 18 0 1 1 36 0Z" />
            <path d="M16 88h40" />
          </g>
          <g transform="translate(124 22)">
            <rect width="72" height="108" rx="6" fill="var(--game-taleclue)" />
            <path d="M22 88V42a14 14 0 0 1 28 0v46Z" />
            <path d="M14 88h44m-8-38 10-6m-10-4 8-10m-16-6 2-10" />
            <circle cx="42" cy="64" r="2" fill="currentColor" />
          </g>
          <path d="M140 158h40m-30-10h20" opacity=".5" />
        </g>
      )}
    </svg>
  );
}
