"use client";

import { RulesSheet } from "@/components/rules-sheet";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type Send, gameErrorMessage } from "@/lib/game-errors";
import type { RulesSetup } from "@/lib/game-rules";
import { type ReactNode, createContext, useContext, useState } from "react";
import { toast } from "sonner";

export const RoomChatAction = createContext<ReactNode>(null);
export const RoomPanelCycle = createContext("wide:game");

export function RoomHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const chat = useContext(RoomChatAction);
  return (
    <header
      data-slot="room-header"
      className="flex min-w-0 flex-wrap items-center justify-between gap-4"
    >
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">{children}</div>
      <div
        data-slot="room-header-actions"
        className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2"
      >
        {actions}
        {chat}
      </div>
    </header>
  );
}

export function GameActions({
  setup,
  owner,
  over,
  connected,
  send,
}: {
  setup: RulesSetup;
  owner: boolean;
  over: boolean;
  connected: boolean;
  send: Send;
}) {
  const [resetting, setResetting] = useState(false);
  async function act(event: string) {
    const ack = await send(event);
    if (!ack.ok)
      toast.error(gameErrorMessage(ack.error, setup.type === "taleclue" ? "taleclue" : undefined));
  }
  return (
    <>
      {owner ? (
        over ? (
          <Button
            type="button"
            loading={resetting}
            disabled={!connected}
            onClick={async () => {
              setResetting(true);
              try {
                await act("game:reset");
              } finally {
                setResetting(false);
              }
            }}
          >
            Outra rodada
          </Button>
        ) : (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" disabled={!connected}>
                Encerrar partida
              </Button>
            }
            title="Encerrar a partida?"
            description="Todo mundo vê o resultado agora."
            confirmLabel="Encerrar"
            variant="destructive"
            confirmDisabled={!connected}
            onConfirm={() => act("game:end")}
          />
        )
      ) : null}
      <RulesSheet setup={setup} />
    </>
  );
}
