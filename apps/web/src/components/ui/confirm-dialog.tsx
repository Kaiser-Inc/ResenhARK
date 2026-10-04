"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  /** Element that opens the dialog. Omit it to control the dialog with `open`. */
  trigger?: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  /**
   * Runs on confirm. While the returned promise is pending the dialog shows a
   * loading state; it closes when the promise resolves and stays open when it
   * rejects, so the caller can surface the error.
   */
  onConfirm: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

// Drop-in replacement for window.confirm().
function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
  open: openProp,
  onOpenChange,
}: ConfirmDialogProps) {
  const [openState, setOpenState] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const open = openProp ?? openState;

  function setOpen(next: boolean) {
    if (pending && !next) return;
    setOpenState(next);
    onOpenChange?.(next);
  }

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      setOpenState(false);
      onOpenChange?.(false);
    } catch {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            loading={pending}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
