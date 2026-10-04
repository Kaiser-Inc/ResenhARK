import type { HitlineView, MemberView } from "@resenhark/shared";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { Countdown } from "@/components/hitline/countdown";
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

export function StatusStrip({ view, turnMember, isTurn, clock }: StatusStripProps) {
  const deadline = view.phase === "contest" ? view.contestDeadline : view.turnDeadline;
  const showTimer = view.phase !== "game-over" && deadline !== null;
  return (
    <div className="flex items-center gap-3">
      {turnMember ? (
        <MemberAvatar
          name={turnMember.name}
          avatar={turnMember.avatar}
          size={40}
          expression="thinking"
          animate
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <p title={turnMember?.name} className="min-w-0 truncate text-base leading-6 font-semibold">
          {turnMember?.name ?? "Fim de jogo"}
        </p>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {view.phase === "game-over"
            ? ""
            : `${isTurn && view.phase !== "contest" ? "Sua vez · " : ""}${PHASES[view.phase]}`}
        </p>
      </div>
      {showTimer ? <Countdown deadline={deadline} clock={clock} /> : null}
    </div>
  );
}
