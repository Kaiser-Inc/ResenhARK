"use client";

import type { MemberView } from "@resenhark/shared";
import { type ReactNode, useEffect, useRef } from "react";

import { ConnectionBanner } from "@/components/room/connection-banner";
import { RoomMobileBar } from "@/components/room/room-mobile-bar";
import { RoomSidebar } from "@/components/room/room-sidebar";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoom } from "@/lib/use-room";

type RoomFrameProps = {
  code: string;
  members: MemberView[] | null;
  reconnecting?: boolean;
  /** Move focus to the main region on mount (the join form that had it just went away). */
  focusOnMount?: boolean;
  children: ReactNode;
};

function RoomFrame({
  code,
  members,
  reconnecting = false,
  focusOnMount = false,
  children,
}: RoomFrameProps) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnMount) mainRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="flex h-dvh flex-col">
      <ConnectionBanner visible={reconnecting} />
      <div className="flex min-h-0 flex-1">
        <RoomSidebar code={code} members={members} />
        <div className="flex min-w-0 flex-1 flex-col">
          <RoomMobileBar code={code} members={members} />
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:py-12">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function GameAreaSkeleton() {
  return (
    <section aria-label="Carregando sala" aria-busy="true" className="flex flex-col gap-6">
      <h1 className="sr-only">Sala</h1>
      <output className="sr-only">Carregando sala…</output>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-40 w-full" />
    </section>
  );
}

/** The room before its first state: same frame, skeletons for the people list and the game area. */
export function RoomLoading({ code }: { code: string }) {
  return (
    <RoomFrame code={code} members={null}>
      <GameAreaSkeleton />
    </RoomFrame>
  );
}

type RoomShellProps = {
  code: string;
  sessionToken: string;
  onInvalidSession: () => void;
  focusOnMount?: boolean;
};

export function RoomShell({ code, sessionToken, onInvalidSession, focusOnMount }: RoomShellProps) {
  const { status, room } = useRoom(code, sessionToken);

  useEffect(() => {
    if (status === "invalid-session") onInvalidSession();
  }, [status, onInvalidSession]);

  return (
    <RoomFrame
      code={code}
      members={room?.members ?? null}
      reconnecting={status === "reconnecting"}
      focusOnMount={focusOnMount}
    >
      {room ? (
        // Placeholder until the lobby arrives.
        <PageHeader title="Lobby" />
      ) : (
        <GameAreaSkeleton />
      )}
    </RoomFrame>
  );
}
