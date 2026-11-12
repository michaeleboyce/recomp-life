"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Delta } from "@/components/ui/delta";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { updateBodyweight } from "@/lib/data/records";
import type { BodyweightLog } from "@/types";
import { weighInGroups, type WeighInRow } from "./bodyMath";

/** Entries shown before "Show all". */
export const PAGE_SIZE = 30;
const MIN_WEIGHT = 50;
const MAX_WEIGHT = 500;

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function Editor({ row, onClose }: { row: WeighInRow; onClose: () => void }) {
  const [value, setValue] = useState(String(row.weight));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const weight = parseFloat(value);
    if (!Number.isFinite(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      setError(`Enter a weight between ${MIN_WEIGHT} and ${MAX_WEIGHT} lbs.`);
      return;
    }
    setSaving(true);
    try {
      await updateBodyweight(row.id, { weight });
      onClose();
    } catch {
      setError("Could not save. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3">
      <label className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>Weight (lbs)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Weight for ${DAY.format(row.date)}`}
          className="h-9 w-28 rounded-md border border-input bg-background px-3 font-mono text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Every weigh-in, newest first and grouped by month; tap one to edit its weight. */
export function WeighInList({ log, better }: { log: BodyweightLog[]; better: "up" | "down" | "none" }) {
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const groups = useMemo(() => weighInGroups(log, showAll ? Infinity : PAGE_SIZE), [log, showAll]);

  return (
    <section className="flex flex-col gap-4" aria-label="All weigh-ins">
      {groups.map((group) => (
        <div key={group.key}>
          <SectionHeader as="h3" title={group.label} />
          {group.rows.map((row) =>
            editingId === row.id ? (
              <Editor key={row.id} row={row} onClose={() => setEditingId(null)} />
            ) : (
              <ListRow
                key={row.id}
                title={DAY.format(row.date)}
                subtitle={row.timeLabel || undefined}
                value={row.weight.toFixed(1)}
                valueSub={row.diff !== null ? <Delta value={row.diff} better={better} /> : undefined}
                onClick={() => setEditingId(row.id)}
                showChevron={false}
              />
            )
          )}
        </div>
      ))}
      {!showAll && log.length > PAGE_SIZE && (
        <Button variant="outline" onClick={() => setShowAll(true)}>
          Show all ({log.length})
        </Button>
      )}
    </section>
  );
}
