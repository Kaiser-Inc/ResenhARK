"use client";

import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { type VariantProps, cva } from "class-variance-authority";

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center border-b border-border bg-transparent text-muted-foreground group-data-[orientation=horizontal]/tabs:h-control group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        line: "bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  activateOnFocus = true,
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      activateOnFocus={activateOnFocus}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        renderBeforeHydration
        className="pointer-events-none absolute top-0 left-0 bg-primary-text transition-[translate,width,height] duration-[120ms] ease-out  group-data-[orientation=horizontal]/tabs:top-auto group-data-[orientation=horizontal]/tabs:-bottom-px group-data-[orientation=horizontal]/tabs:h-0.5 group-data-[orientation=horizontal]/tabs:w-(--active-tab-width) group-data-[orientation=horizontal]/tabs:translate-x-(--active-tab-left) group-data-[orientation=vertical]/tabs:w-0.5 group-data-[orientation=vertical]/tabs:h-(--active-tab-height) group-data-[orientation=vertical]/tabs:translate-y-(--active-tab-top)"
      />
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-control flex-1 items-center justify-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-[120ms] ease-out outline-hidden group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:text-subtle-foreground aria-disabled:pointer-events-none aria-disabled:text-subtle-foreground data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-hidden animate-in fade-in-0 duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
