"use client";

import { cn } from "@/lib/utils";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

type SheetSide = "right" | "bottom";

// swipeDirection lives on Drawer.Root, so the side is set on Sheet and shared
// with SheetContent for styling.
const SheetSideContext = React.createContext<SheetSide>("right");

// The popup runs 3rem past the screen edge (the "bleed") so an overscroll
// drag never opens a gap between the sheet and the edge.
const sideClasses: Record<SheetSide, string> = {
  right:
    "h-full w-[calc(400px+3rem)] max-w-screen -mr-12 pr-12 dark:border-l [transform:translateX(var(--drawer-swipe-movement-x))] data-starting-style:[transform:translateX(calc(100%-3rem+2px))] data-ending-style:[transform:translateX(calc(100%-3rem+2px))]",
  bottom:
    "max-h-[calc(80vh+3rem)] w-full -mb-12 rounded-t-lg dark:border-t pb-[calc(3rem+env(safe-area-inset-bottom,0px))] [transform:translateY(var(--drawer-swipe-movement-y))] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-ending-style:[transform:translateY(calc(100%-3rem+2px))]",
};

function Sheet({ side = "right", ...props }: DrawerPrimitive.Root.Props & { side?: SheetSide }) {
  return (
    <SheetSideContext.Provider value={side}>
      <DrawerPrimitive.Root swipeDirection={side === "bottom" ? "down" : "right"} {...props} />
    </SheetSideContext.Provider>
  );
}

function SheetTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Fechar",
  ...props
}: DrawerPrimitive.Popup.Props & { showCloseButton?: boolean; closeLabel?: string }) {
  const side = React.useContext(SheetSideContext);
  return (
    <DrawerPrimitive.VirtualKeyboardProvider>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop
          data-slot="sheet-overlay"
          className="fixed inset-0 z-50 min-h-dvh bg-background/70 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 ease-drawer data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(min(var(--drawer-swipe-strength,1),0.75)*400ms)] data-swiping:duration-0"
        />
        <DrawerPrimitive.Viewport
          data-slot="sheet-viewport"
          className={cn(
            "fixed inset-0 z-50 flex",
            side === "bottom" ? "items-end justify-center" : "justify-end",
          )}
        >
          <DrawerPrimitive.Popup
            data-slot="sheet-content"
            data-side={side}
            className={cn(
              "relative flex flex-col bg-popover text-popover-foreground shadow-[var(--shadow-overlay)] outline-hidden transition-transform duration-300 ease-drawer data-swiping:duration-0 data-swiping:select-none data-ending-style:duration-[calc(min(var(--drawer-swipe-strength,1),0.75)*400ms)] dark:border-border",
              sideClasses[side],
              className,
            )}
            {...props}
          >
            {side === "bottom" && (
              <div
                data-slot="sheet-handle"
                aria-hidden="true"
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong"
              />
            )}
            <DrawerPrimitive.Content className="relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-6">
              {children}
              {showCloseButton && (
                <DrawerPrimitive.Close
                  data-slot="sheet-close-button"
                  render={
                    <Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" />
                  }
                  aria-label={closeLabel}
                >
                  <XIcon strokeWidth={1.75} />
                </DrawerPrimitive.Close>
              )}
            </DrawerPrimitive.Content>
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.VirtualKeyboardProvider>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 pr-8", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-lg leading-7 font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-pretty text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
