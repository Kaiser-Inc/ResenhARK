"use client";

import type { ErrorCode, MemberView } from "@resenhark/shared";
import { UserXIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatSkeleton } from "@/components/chat/chat-thread";
import { Countdown } from "@/components/hitline/countdown";
import { HitlineBoard } from "@/components/hitline/hitline-board";
import { LobbyPanel } from "@/components/lobby/lobby-panel";
import { ConnectionBanner } from "@/components/room/connection-banner";
import { RoomMobileBar } from "@/components/room/room-mobile-bar";
import { type RoomActions, RoomSidebar } from "@/components/room/room-sidebar";
import { SiteBar } from "@/components/site-bar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ServerClock } from "@/lib/server-clock";
import { clearSession } from "@/lib/session";
import { useRoom } from "@/lib/use-room";
import { cn } from "@/lib/utils";

/** wide: sidebar + game + chat column. mid: chat in a sheet. narrow: top bar + tabs. */
type Layout = "wide" | "mid" | "narrow";

const MEDIA_QUERIES = ["(min-width: 1280px)", "(min-width: 1024px)"] as const;

function subscribeLayout(onChange: () => void) {
  const lists = MEDIA_QUERIES.map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function layoutSnapshot(): Layout {
  if (window.matchMedia(MEDIA_QUERIES[0]).matches) return "wide";
  return window.matchMedia(MEDIA_QUERIES[1]).matches ? "mid" : "narrow";
}

// The room only renders on the client (after the gate looked at the session), so no server snapshot matters.
function useLayout(): Layout {
  return useSyncExternalStore(subscribeLayout, layoutSnapshot, () => "wide");
}

type ChatSlot = {
  panel: ReactNode;
  unread: number;
  onVisibleChange: (visible: boolean) => void;
};

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="primary">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> não lidas</span>
    </Badge>
  );
}

/** While a contest is open the chat tab keeps a fixed reminder, so nobody misses it from there. */
type ContestNotice = { deadline: number; clock: ServerClock };

type RoomFrameProps = {
  code: string;
  members: MemberView[] | null;
  actions: RoomActions | null;
  /** Null while loading: the chat spot shows a skeleton. */
  chat: ChatSlot | null;
  reconnecting?: boolean;
  contest?: ContestNotice | null;
  /** Move focus to the main region on mount (the join form that had it just went away). */
  focusOnMount?: boolean;
  children: ReactNode;
};

function RoomFrame({
  code,
  members,
  actions,
  chat,
  reconnecting = false,
  contest = null,
  focusOnMount = false,
  children,
}: RoomFrameProps) {
  const layout = useLayout();
  const [tab, setTab] = useState<"game" | "chat">("game");
  const [sheetOpen, setSheetOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnMount) mainRef.current?.focus();
  }, [focusOnMount]);

  const sheetShown = layout === "mid" && sheetOpen;
  const chatVisible = layout === "wide" || sheetShown || (layout === "narrow" && tab === "chat");
  const onVisibleChange = chat?.onVisibleChange;
  useEffect(() => {
    onVisibleChange?.(chatVisible);
  }, [chatVisible, onVisibleChange]);

  const panel = chat?.panel ?? <ChatSkeleton />;
  const unread = chat?.unread ?? 0;

  return (
    <div className="flex h-dvh flex-col">
      <ConnectionBanner visible={reconnecting} />
      <div className="flex min-h-0 flex-1">
        <RoomSidebar code={code} members={members} actions={actions} />
        <div className="flex min-w-0 flex-1 flex-col">
          <RoomMobileBar code={code} members={members} actions={actions} />
          {layout === "narrow" ? (
            <main
              ref={mainRef}
              id="main-content"
              tabIndex={-1}
              className="flex min-h-0 flex-1 flex-col"
            >
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value === "chat" ? "chat" : "game")}
                className="min-h-0 flex-1 gap-0"
              >
                <TabsList className="w-full shrink-0 px-4">
                  <TabsTrigger value="game">Jogo</TabsTrigger>
                  <TabsTrigger value="chat">
                    Chat
                    <UnreadBadge count={unread} />
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="game" className="min-h-0 overflow-y-auto">
                  <div className="px-4 py-8">{children}</div>
                </TabsContent>
                <TabsContent value="chat" keepMounted className="flex min-h-0 flex-col">
                  {contest ? (
                    <output className="flex shrink-0 items-center gap-1 bg-secondary px-4 py-2 text-sm font-medium">
                      Contestação aberta ·{" "}
                      <Countdown deadline={contest.deadline} clock={contest.clock} />
                    </output>
                  ) : null}
                  {panel}
                </TabsContent>
              </Tabs>
            </main>
          ) : (
            <div className="flex min-h-0 flex-1">
              <main
                ref={mainRef}
                id="main-content"
                tabIndex={-1}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              >
                <div className="mx-auto flex max-w-[1600px] items-start justify-between gap-4 px-4 py-8 sm:px-6 lg:py-12">
                  <div className="min-w-0 flex-1">{children}</div>
                  {layout === "mid" ? (
                    <Button type="button" variant="outline" onClick={() => setSheetOpen(true)}>
                      Chat
                      <UnreadBadge count={unread} />
                    </Button>
                  ) : null}
                </div>
              </main>
              {layout === "wide" ? (
                <aside
                  aria-label="Chat"
                  className="relative flex w-[360px] shrink-0 flex-col before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border"
                >
                  <div className="flex h-14 shrink-0 items-center px-4">
                    <h2 className="text-base font-semibold">Chat</h2>
                  </div>
                  {panel}
                </aside>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <Sheet side="right" open={sheetShown} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Chat</SheetTitle>
          </SheetHeader>
          {/* The sheet already pads its content; the panel brings its own gutters. */}
          <div className="-mx-4 -mb-2 flex min-h-0 flex-1 flex-col">{panel}</div>
        </SheetContent>
      </Sheet>
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

/** The room before its first state: same frame, skeletons for the people list, the game area and the chat. */
export function RoomLoading({ code }: { code: string }) {
  return (
    <RoomFrame code={code} members={null} actions={null} chat={null}>
      <GameAreaSkeleton />
    </RoomFrame>
  );
}

function RemovedState() {
  return (
    <>
      <SiteBar />
      <main id="main-content" className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserXIcon aria-hidden="true" strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>
              <h1 className="text-[28px] leading-8 font-semibold tracking-[-0.03em] sm:text-[40px] sm:leading-[44px]">
                Você foi removido da sala
              </h1>
            </EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Voltar ao início
            </Link>
          </EmptyContent>
        </Empty>
      </main>
    </>
  );
}

function actionErrorMessage(error: ErrorCode): string {
  if (error === "not-owner") return "Só o dono da sala pode remover pessoas.";
  if (error === "invalid-target") return "Essa pessoa já saiu da sala.";
  return "Não deu certo. Tenta de novo.";
}

type RoomShellProps = {
  code: string;
  sessionToken: string;
  onInvalidSession: () => void;
  focusOnMount?: boolean;
};

export function RoomShell({ code, sessionToken, onInvalidSession, focusOnMount }: RoomShellProps) {
  const { status, room, events, chat, chatLoaded, unread, setChatVisible, send, clock } = useRoom(
    code,
    sessionToken,
  );
  const router = useRouter();
  // After "Sair da sala" the server revokes the token and hangs up: that is not an invalid session.
  const left = useRef(false);
  const [removeTarget, setRemoveTarget] = useState<MemberView | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const connected = status === "connected";

  useEffect(() => {
    if (status === "invalid-session" && !left.current) onInvalidSession();
  }, [status, onInvalidSession]);

  useEffect(() => {
    if (status === "kicked") clearSession(code);
  }, [status, code]);

  const onLeave = useCallback(async () => {
    const ack = await send("room:leave");
    if (!ack.ok) {
      toast.error(actionErrorMessage(ack.error));
      return;
    }
    left.current = true;
    clearSession(code);
    router.replace("/");
  }, [send, code, router]);

  const actions = useMemo<RoomActions | null>(
    () =>
      room
        ? {
            youId: room.you,
            isOwner: room.ownerId === room.you,
            disabled: !connected,
            onRemove: (member) => {
              setRemoveTarget(member);
              setRemoveOpen(true);
            },
            onLeave,
          }
        : null,
    [room, connected, onLeave],
  );

  const chatSlot = useMemo<ChatSlot | null>(
    () =>
      room
        ? {
            unread,
            onVisibleChange: setChatVisible,
            panel: (
              <ChatPanel messages={chat} loading={!chatLoaded} connected={connected} send={send} />
            ),
          }
        : null,
    [room, unread, setChatVisible, chat, chatLoaded, connected, send],
  );

  if (status === "kicked") return <RemovedState />;

  return (
    <>
      <RoomFrame
        code={code}
        members={room?.members ?? null}
        actions={actions}
        chat={chatSlot}
        reconnecting={status === "reconnecting"}
        contest={
          room?.game?.type === "hitline" &&
          room.game.view.phase === "contest" &&
          room.game.view.contestDeadline !== null
            ? { deadline: room.game.view.contestDeadline, clock }
            : null
        }
        focusOnMount={focusOnMount}
      >
        {room ? (
          room.game ? (
            <HitlineBoard
              room={room}
              events={events}
              send={send}
              clock={clock}
              connected={connected}
              onNewGame={() => send("game:reset")}
            />
          ) : (
            <LobbyPanel room={room} send={send} connected={connected} />
          )
        ) : (
          <GameAreaSkeleton />
        )}
      </RoomFrame>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remover ${removeTarget?.name ?? ""}?`}
        description="A pessoa pode voltar pelo código como alguém novo."
        confirmLabel="Remover"
        variant="destructive"
        confirmDisabled={!connected}
        onConfirm={async () => {
          if (!removeTarget) return;
          const ack = await send("room:kick", { targetId: removeTarget.id });
          if (!ack.ok) toast.error(actionErrorMessage(ack.error));
        }}
      />
    </>
  );
}
