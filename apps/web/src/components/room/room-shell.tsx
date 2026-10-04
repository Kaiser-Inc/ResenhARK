"use client";

import { useEffect } from "react";

import { ConnectionBanner } from "@/components/room/connection-banner";
import { RoomMobileBar } from "@/components/room/room-mobile-bar";
import { RoomSidebar } from "@/components/room/room-sidebar";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoom } from "@/lib/use-room";

type RoomShellProps = {
  code: string;
  sessionToken: string;
  onInvalidSession: () => void;
};

export function RoomShell({ code, sessionToken, onInvalidSession }: RoomShellProps) {
  const { status, room } = useRoom(code, sessionToken);

  useEffect(() => {
    if (status === "invalid-session") onInvalidSession();
  }, [status, onInvalidSession]);

  const members = room?.members ?? null;

  return (
    <div className="flex h-dvh flex-col">
      <ConnectionBanner visible={status === "reconnecting"} />
      <div className="flex min-h-0 flex-1">
        <RoomSidebar code={code} members={members} />
        <div className="flex min-w-0 flex-1 flex-col">
          <RoomMobileBar code={code} members={members} />
          <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:py-12">
              {room ? (
                // Placeholder until the lobby arrives.
                <PageHeader title="Lobby" />
              ) : (
                <div aria-busy="true" className="flex flex-col gap-6">
                  <span className="sr-only">Carregando a sala</span>
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
