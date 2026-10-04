"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// State color lives on the icon only; the toast surface is the neutral popover.
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={(resolvedTheme ?? "dark") as ToasterProps["theme"]}
      className="toaster group"
      containerAriaLabel="Notificações"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" strokeWidth={1.75} />,
        info: <InfoIcon className="size-4 text-primary-text" strokeWidth={1.75} />,
        warning: <TriangleAlertIcon className="size-4 text-warning" strokeWidth={1.75} />,
        error: <OctagonXIcon className="size-4 text-destructive" strokeWidth={1.75} />,
        loading: (
          <Loader2Icon
            className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
            strokeWidth={1.75}
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-sm shadow-[var(--shadow-overlay)]",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
