import type { MemberView } from "@resenhark/shared";
import { CrownIcon } from "lucide-react";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { MemberMenu } from "@/components/room/member-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PeopleListProps = {
  /** Null until the first room state arrives. */
  members: MemberView[] | null;
  /** Owner only: shows a "Remover da sala" menu on everyone else. */
  onRemove?: (member: MemberView) => void;
  /** The connection is down: the menus stay but cannot be used. */
  actionsDisabled?: boolean;
  youId?: string;
};

export function PeopleList({ members, onRemove, actionsDisabled = false, youId }: PeopleListProps) {
  if (!members) {
    return (
      <section aria-label="Carregando pessoas" aria-busy="true" className="flex flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-10 items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </section>
    );
  }

  return (
    <ul aria-label="Pessoas na sala" className="flex flex-col gap-1">
      {members.map((member) => (
        <li key={member.id} className="flex min-h-10 items-center gap-3 py-1">
          <MemberAvatar
            name={member.name}
            avatar={member.avatar}
            size={32}
            animate
            online={member.online}
            className={cn(!member.online && "opacity-50")}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                title={member.name}
                className={cn(
                  "min-w-0 truncate text-sm font-medium",
                  !member.online && "text-muted-foreground",
                )}
              >
                {member.name}
              </span>
              {member.isOwner ? (
                <span
                  role="img"
                  aria-label="Dono da sala"
                  title="Dono da sala"
                  className="shrink-0 text-primary-text"
                >
                  <CrownIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </span>
              ) : null}
            </div>
            {member.role === "spectator" || !member.online ? (
              <div className="flex flex-wrap gap-1">
                {member.role === "spectator" ? <Badge>espectador</Badge> : null}
                {member.online ? null : <Badge>offline</Badge>}
              </div>
            ) : null}
          </div>
          {onRemove && member.id !== youId ? (
            <MemberMenu
              name={member.name}
              disabled={actionsDisabled}
              onRemove={() => onRemove(member)}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
