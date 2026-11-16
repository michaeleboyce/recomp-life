"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EXERCISES } from "@/lib/exercises";
import type { MappingOverride } from "@/lib/import/mapping";
import type { ImportPreview, PreviewName } from "@/lib/import/preview";
import { MUSCLE_IDS, formatMuscle } from "@/lib/muscles";
import type { MuscleId } from "@/types";
import { plural } from "./format";

type Choose = (name: string, choice: MappingOverride | null) => void;

const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

/** The library's exercises by name, for the "map to" menu. */
function useExerciseOptions() {
  return useMemo(
    () => Object.values(EXERCISES).map((e) => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
}

function ChangeControls({ row, choose, onDone }: { row: PreviewName; choose: Choose; onDone: () => void }) {
  const exercises = useExerciseOptions();
  const id = `remap-${row.key.replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label htmlFor={`${id}-exercise`} className="text-xs text-muted-foreground">
        Map to a library exercise
      </label>
      <select
        id={`${id}-exercise`}
        className={selectClass}
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          choose(row.name, { kind: "exercise", exerciseId: e.target.value });
          onDone();
        }}
      >
        <option value="">Choose an exercise…</option>
        {exercises.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-muscle`} className="text-xs text-muted-foreground">
        Or keep its own name, for the muscle it trains
      </label>
      <select
        id={`${id}-muscle`}
        className={selectClass}
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          choose(row.name, { kind: "custom", primary: [e.target.value as MuscleId] });
          onDone();
        }}
      >
        <option value="">Choose a muscle…</option>
        {MUSCLE_IDS.map((m) => (
          <option key={m} value={m}>
            {formatMuscle(m)}
          </option>
        ))}
      </select>
      <Button variant="ghost" size="sm" className="self-start" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

function NameRow({
  row,
  choose,
  editing,
  setEditing,
}: {
  row: PreviewName;
  choose: Choose;
  editing: boolean;
  setEditing: (key: string | null) => void;
}) {
  const chosen = row.mapping.kind !== "unknown" && row.mapping.confidence === "user";
  const guess = row.mapping.kind === "guess" ? row.mapping : null;
  return (
    <li className="border-b border-border py-3 last:border-b-0" data-testid="import-name-row">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {plural(row.sets, "set", "sets")} · {row.mapping.kind === "unknown" ? "not recognised" : row.label}
            {chosen ? " · your choice" : ""}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            {guess && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                aria-label={`Confirm the muscles for ${row.name}`}
                onClick={() => choose(row.name, { kind: "custom", primary: guess.muscles.primary, secondary: guess.muscles.secondary })}
              >
                Confirm
              </Button>
            )}
            {chosen ? (
              <Button variant="ghost" size="sm" className="min-h-11" aria-label={`Forget your choice for ${row.name}`} onClick={() => choose(row.name, null)}>
                Reset
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="min-h-11" aria-label={`Change what ${row.name} maps to`} onClick={() => setEditing(row.key)}>
                Change
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && <ChangeControls row={row} choose={choose} onDone={() => setEditing(null)} />}
    </li>
  );
}

function Group({
  title,
  hint,
  rows,
  open,
  choose,
  editing,
  setEditing,
}: {
  title: string;
  hint: string;
  rows: PreviewName[];
  open: boolean;
  choose: Choose;
  editing: string | null;
  setEditing: (key: string | null) => void;
}) {
  if (rows.length === 0) return null;
  const sets = rows.reduce((n, r) => n + r.sets, 0);
  return (
    <details open={open} className="group rounded-xl bg-card px-4" data-testid={`import-group-${title.toLowerCase().split(" ")[0]}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3">
        <span className="text-sm font-semibold text-foreground">
          {title} <span className="font-mono tabular-nums text-muted-foreground">{rows.length}</span>
        </span>
        <span className="text-xs text-muted-foreground">{plural(sets, "set", "sets")}</span>
      </summary>
      <p className="pb-2 text-xs text-muted-foreground">{hint}</p>
      <ul>
        {rows.map((row) => (
          <NameRow key={row.key} row={row} choose={choose} editing={editing === row.key} setEditing={setEditing} />
        ))}
      </ul>
    </details>
  );
}

/** Every exercise name in the file, grouped by how it was matched, with a way to change each. */
export function NameReview({ names, choose }: { names: ImportPreview["names"]; choose: Choose }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section aria-label="Exercise names" className="flex flex-col gap-3">
      <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exercise names</h2>
      <Group
        title="Not recognised"
        hint="Kept under their own name with no muscles. Map each to an exercise or a muscle, or leave it: it then counts for nothing."
        rows={names.unknown}
        open
        choose={choose}
        editing={editing}
        setEditing={setEditing}
      />
      <Group
        title="Muscles guessed"
        hint="Kept under their own name; the guess counts toward muscle volume but never toward a lift's strength. Confirm it, or map the name to an exercise."
        rows={names.guessed}
        open={names.unknown.length === 0}
        choose={choose}
        editing={editing}
        setEditing={setEditing}
      />
      <Group
        title="Matched"
        hint="Counted as these library exercises, and toward a lift's strength when they are one. Your choices are remembered for the next import."
        rows={names.mapped}
        open={false}
        choose={choose}
        editing={editing}
        setEditing={setEditing}
      />
    </section>
  );
}
