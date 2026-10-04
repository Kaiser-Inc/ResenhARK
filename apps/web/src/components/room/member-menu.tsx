"use client";

import { Menu } from "@base-ui/react/menu";
import { EllipsisIcon, UserMinusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Owner-only menu on a person's row. One action today, so it stays local to the room.
export function MemberMenu({
  name,
  disabled,
  onRemove,
}: {
  name: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        aria-label={`Opções de ${name}`}
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Menu.Popup className="min-w-44 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-[var(--shadow-overlay)] outline-hidden transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-96 data-starting-style:scale-96 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:border dark:border-border dark:shadow-none">
            <Menu.Item
              onClick={onRemove}
              className="flex h-control cursor-default items-center gap-2 rounded-md px-3 text-sm text-destructive outline-hidden select-none data-highlighted:bg-accent data-disabled:text-subtle-foreground [&_svg]:size-4 [&_svg]:shrink-0"
            >
              <UserMinusIcon aria-hidden="true" strokeWidth={1.75} />
              Remover da sala
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
