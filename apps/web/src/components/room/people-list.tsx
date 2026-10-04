import type { MemberView } from "@resenhark/shared";
import { CrownIcon } from "lucide-react";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// `members` is null until the first room state arrives.
export function PeopleList({ members }: { members: MemberView[] | null }) {
  if (!members) {
    return (
      <div aria-busy="true" className="flex flex-col gap-1">
        <span className="sr-only">Carregando pessoas</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-10 items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
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
        </li>
      ))}
    </ul>
  );
}
