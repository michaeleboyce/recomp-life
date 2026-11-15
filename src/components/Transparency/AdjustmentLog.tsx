"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { EmptyState } from "@/components/ui/empty-state";
import { GradeChip } from "@/components/ui/grade-chip";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Stripes } from "@/components/ui/stripes";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FEED_GROUPS, entryGrade, filterFeed } from "@/lib/adjustments";
import type { FeedGroup } from "@/lib/adjustments";
import { recordAdjustment } from "@/lib/data/adjustments";
import { useAdjustmentFeed } from "@/hooks";
import type { AdjustmentEntry } from "@/types";

/** Starting weights are dated in 1970 in the data; they are shown last as "Start". */
export function isStartEntry(entry: Pick<AdjustmentEntry, "at">): boolean {
  return new Date(entry.at).getFullYear() < 2000;
}

/** Newest first, with the starting weights after every dated entry. */
export function orderForLog(entries: readonly AdjustmentEntry[]): AdjustmentEntry[] {
  const dated = entries.filter((e) => !isStartEntry(e));
  const starts = entries.filter(isStartEntry);
  return [...dated, ...starts];
}

/** The verb on an entry's link, by where it goes. */
export function linkLabel(href: string): string {
  if (href.startsWith("/research")) return "Rule";
  if (href.startsWith("/progress/forecasts")) return "Forecast";
  if (href.startsWith("/progress/lift") || href.startsWith("/exercises")) return "Lift";
  if (href.startsWith("/settings")) return "Settings";
  return "Open";
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** "Start", "Today" with the time, or a short weekday and date. Takes `now` for tests. */
export function dateLabel(entry: AdjustmentEntry, now: Date): { top: string; bottom?: string } {
  if (isStartEntry(entry)) return { top: "Start" };
  const at = new Date(entry.at);
  if (sameDay(at, now)) {
    return {
      top: "Today",
      bottom: at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    };
  }
  return {
    top: at.toLocaleDateString(undefined, { weekday: "short" }),
    bottom: at.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    }),
  };
}

function EntryRow({
  entry,
  now,
  canUndo,
  onUndo,
}: {
  entry: AdjustmentEntry;
  now: Date;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const grade = entryGrade(entry);
  const date = dateLabel(entry, now);
  return (
    <li className="flex gap-4 border-b border-border py-4 last:border-b-0">
      <div className="w-12 shrink-0 font-mono text-[11px] leading-tight text-muted-foreground">
        <p>{date.top}</p>
        {date.bottom && <p>{date.bottom}</p>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[15px] font-bold text-foreground">{entry.title}</p>
        {entry.detail && <p className="text-[13px] text-muted-foreground">{entry.detail}</p>}
        <div className="flex min-h-11 items-center justify-between gap-3">
          {grade ? <GradeChip strength={grade} /> : <span />}
          <span className="flex items-center gap-4">
            {canUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline underline-offset-4"
              >
                Undo
              </button>
            )}
            {entry.href && (
              <Link
                href={entry.href}
                className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline underline-offset-4"
              >
                {linkLabel(entry.href)}
              </Link>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

export function AdjustmentLog() {
  const feed = useAdjustmentFeed();
  const [group, setGroup] = useState<FeedGroup>("all");
  const [pending, setPending] = useState<AdjustmentEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);

  const entries = feed?.entries;
  const shown = useMemo(
    () => (entries ? orderForLog(filterFeed(entries, group)) : []),
    [entries, group]
  );

  const confirmUndo = async () => {
    if (!pending || !feed) return;
    const undo = feed.undoFor(pending);
    if (!undo) {
      setPending(null);
      toast({ message: "That change can no longer be undone." });
      return;
    }
    setBusy(true);
    try {
      await recordAdjustment(undo);
      toast({ message: "Change undone." });
    } catch {
      toast({ message: "Could not undo that change. Nothing was changed." });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <PageShell className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <PageHeader title="Adjustment log" backHref="/more" />
        <Stripes />
        <p className="text-sm text-muted-foreground">
          Every change the app has made to your plan, its forecasts or its own rules, newest
          first, with the reason.
        </p>
      </div>

      {feed === undefined ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : feed.entries.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="Nothing has changed yet"
          body="When the app raises a weight, resets a lift, updates a forecast or changes a rule, it is listed here with the reason."
        />
      ) : (
        <>
          <ChipGroup
            ariaLabel="Filter the log"
            size="sm"
            className="flex-wrap"
            value={group}
            onChange={(value) => setGroup(value as FeedGroup)}
            options={FEED_GROUPS.map((g) => ({
              value: g.id,
              label: g.id === "all" ? `${g.label} ${feed.entries.length}` : g.label,
            }))}
          />
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing in this group yet.
            </p>
          ) : (
            <ul>
              {shown.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  canUndo={!!entry.undo && feed.undoFor(entry) !== null}
                  onUndo={() => setPending(entry)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Undo this change?</DialogTitle>
            <DialogDescription>
              {pending?.title}. The earlier values come back from today. Your history stays as it
              is, and the undo is added to this log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button variant="ghost" className="min-h-11" onClick={() => setPending(null)} disabled={busy}>
              Keep it
            </Button>
            <Button className="min-h-11" onClick={confirmUndo} disabled={busy}>
              Undo the change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
