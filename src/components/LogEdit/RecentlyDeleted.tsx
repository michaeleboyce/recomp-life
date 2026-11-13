"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { toast } from "@/components/ui/toast";
import { useRecentlyDeleted } from "@/hooks";
import { restore, softDelete, type DeletedItem } from "@/lib/data/logEdits";
import { errorText, formatDay } from "./format";
import { useCommitLogChange } from "./useCommitLogChange";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Deleted today", "Deleted yesterday", "Deleted Tue, Nov 10, 2026". */
function dayLabel(dayStart: number, now: number): string {
  const today = startOfDay(now);
  if (dayStart === today) return "Deleted today";
  if (dayStart === startOfDay(today - DAY_MS / 2)) return "Deleted yesterday";
  return `Deleted ${formatDay(new Date(dayStart))}`;
}

/** Items grouped by the local day they were deleted, newest day first. */
export function groupByDeletionDay(
  items: DeletedItem[],
  now: number
): { key: number; label: string; items: DeletedItem[] }[] {
  const groups = new Map<number, DeletedItem[]>();
  for (const item of [...items].sort((a, b) => b.deletedAt - a.deletedAt)) {
    const key = startOfDay(item.deletedAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, label: dayLabel(key, now), items: list }));
}

/** Soft-deleted entries from the last 30 days, each with a Restore button. */
export function RecentlyDeleted({ now }: { now?: number } = {}) {
  const items = useRecentlyDeleted();
  const { submit, sheet } = useCommitLogChange();
  const [restoring, setRestoring] = useState<string | null>(null);

  if (items === undefined) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Trash2 />}
        title="Nothing deleted"
        body="Entries you delete stay here for 30 days and can be restored."
      />
    );
  }

  async function onRestore(item: DeletedItem) {
    setRestoring(item.id);
    try {
      if (item.table === "workouts") {
        // Restoring a workout can change the next one: same flow as any other change.
        await submit(
          { kind: "restoreWorkout", workoutId: item.id },
          {
            message: `${item.label} restored`,
            commit: () => restore("workouts", item.id),
            undo: () => softDelete("workouts", item.id),
            undoneMessage: `${item.label} deleted again`,
            confirmLabel: "Restore workout",
          }
        );
        return;
      }
      await restore(item.table, item.id);
      toast({ message: `${item.label} restored` });
    } catch (e) {
      toast({ message: `Could not restore: ${errorText(e)}` });
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {groupByDeletionDay(items, now ?? Date.now()).map((group) => (
        <section key={group.key} aria-label={group.label}>
          <SectionHeader as="h3" title={group.label} />
          {group.items.map((item) => (
            <ListRow
              key={`${item.table}:${item.id}`}
              title={item.label}
              subtitle={formatDay(item.date)}
              trailing={
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={restoring === item.id}
                  onClick={() => void onRestore(item)}
                  aria-label={`Restore ${item.label}`}
                >
                  Restore
                </Button>
              }
            />
          ))}
        </section>
      ))}
      {sheet}
    </div>
  );
}
