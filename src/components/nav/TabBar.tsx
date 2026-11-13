"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, History, House, Plus, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickAddSheet } from "./QuickAddSheet";

type TabId = "today" | "progress" | "log" | "more";

const TABS: Array<{ id: TabId; href: string; label: string; icon: LucideIcon }> = [
  { id: "today", href: "/", label: "Today", icon: House },
  { id: "progress", href: "/progress", label: "Progress", icon: TrendingUp },
  { id: "log", href: "/log", label: "Log", icon: History },
  { id: "more", href: "/more", label: "More", icon: Ellipsis },
];

const PREFIXES: Record<Exclude<TabId, "today">, string[]> = {
  progress: ["/progress", "/muscles"],
  log: ["/log"],
  more: [
    "/more",
    "/settings",
    "/exercises",
    "/research",
    "/1rm-calculator",
    "/plate-calculator",
    // Listed under More > Training (Today's "Coming up" line also opens it); it is
    // not part of the Progress hub, so More is the tab it belongs to.
    "/progress/upcoming",
  ],
};

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Which tab owns this pathname, or null for routes that belong to none (e.g. /weigh-in).
 * The longest matching prefix wins, so /progress/upcoming is More's, not Progress's.
 */
export function activeTab(pathname: string): TabId | null {
  if (pathname === "/") return "today";
  let best: { id: TabId; length: number } | null = null;
  for (const id of Object.keys(PREFIXES) as Array<keyof typeof PREFIXES>) {
    for (const prefix of PREFIXES[id]) {
      if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) {
        best = { id, length: prefix.length };
      }
    }
  }
  return best?.id ?? null;
}

function TabLink({ tab, active }: { tab: (typeof TABS)[number]; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-semibold outline-none transition-colors active:scale-[0.95] focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span>{tab.label}</span>
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname() ?? "";
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const current = activeTab(pathname);
  const [today, progress, log, more] = TABS;

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
          <TabLink tab={today} active={current === today.id} />
          <TabLink tab={progress} active={current === progress.id} />
          <button
            type="button"
            aria-label="Quick add"
            aria-haspopup="dialog"
            aria-expanded={quickAddOpen}
            onClick={() => setQuickAddOpen(true)}
            className="flex size-[52px] items-center justify-center justify-self-center rounded-full bg-primary text-primary-foreground outline-none transition-transform active:scale-[0.95] focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
          <TabLink tab={log} active={current === log.id} />
          <TabLink tab={more} active={current === more.id} />
        </div>
      </nav>
      <QuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </>
  );
}
