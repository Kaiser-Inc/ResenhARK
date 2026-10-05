import type { HitlineView, MemberView } from "@resenhark/shared";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { Countdown, useSecondsLeft } from "@/components/hitline/countdown";
import type { ServerClock } from "@/lib/server-clock";

const PHASES: Record<HitlineView["phase"], string> = {
  "turn-start": "Hora de puxar a carta",
  guessing: "Ouvindo",
  contest: "Contestação",
  "game-over": "",
};

type StatusStripProps = {
  view: HitlineView;
  turnMember: MemberView | undefined;
  isTurn: boolean;
  clock: ServerClock;
};

/** "Aguardando Ana · 24s": the turn player is offline and loses the turn when it hits 0. */
function Waiting({
  name,
  deadline,
  clock,
}: { name: string; deadline: number; clock: ServerClock }) {
  const seconds = useSecondsLeft(deadline, clock);
  // Not live: it would be read out every second.
  return <span aria-live="off">{`Aguardando ${name} · ${seconds}s`}</span>;
}

export function StatusStrip({ view, turnMember, isTurn, clock }: StatusStripProps) {
  const deadline = view.phase === "contest" ? view.contestDeadline : view.turnDeadline;
  const offlineDeadline =
    view.phase === "turn-start" || view.phase === "guessing"
      ? (view.players.find((p) => p.id === view.turnPlayerId)?.offlineDeadline ?? null)
      : null;
  const waiting = offlineDeadline !== null && turnMember;
  const showTimer = view.phase !== "game-over" && deadline !== null && !waiting;
  return (
    <div className="flex items-center gap-3">
      {turnMember ? (
        <MemberAvatar
          name={turnMember.name}
          avatar={turnMember.avatar}
          size={40}
          expression="thinking"
          animate
          className={waiting ? "opacity-50" : undefined}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <p title={turnMember?.name} className="min-w-0 truncate text-base leading-6 font-semibold">
          {turnMember?.name ?? "Fim de jogo"}
        </p>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {waiting ? (
            <Waiting name={turnMember.name} deadline={offlineDeadline} clock={clock} />
          ) : view.phase === "game-over" ? (
            ""
          ) : (
            `${isTurn && view.phase !== "contest" ? "Sua vez · " : ""}${PHASES[view.phase]}`
          )}
        </p>
      </div>
      {showTimer ? <Countdown deadline={deadline} clock={clock} /> : null}
    </div>
  );
}
