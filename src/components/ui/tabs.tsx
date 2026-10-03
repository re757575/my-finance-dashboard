import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Tabs({ ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex border-b border-slate-200 dark:border-border",
        className
      )}
      {...props}
    />
  );
}

// 選取狀態以「底線＋粗體」標示，不只靠文字顏色（PRD 第 7 節無障礙規範）；
// hover 與選取中的文字同色，避免滑過選取中的分頁時變色（深色變體亦同）；
// 窄螢幕各分頁平均分配整列寬度（flex-1），sm 以上依文字寬度靠左排列
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px min-w-0 flex-1 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-500 transition-colors outline-none hover:text-slate-800 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-active:border-slate-800 data-active:font-semibold data-active:text-slate-800 sm:flex-none sm:px-4 dark:text-neutral-400 dark:hover:text-neutral-100 dark:data-active:border-neutral-100 dark:data-active:text-neutral-100",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
