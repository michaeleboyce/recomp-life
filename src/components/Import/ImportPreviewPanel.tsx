"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { StatTile } from "@/components/ui/stat-tile";
import type { MappingOverride } from "@/lib/import/mapping";
import type { ImportPreview } from "@/lib/import/preview";
import { SOURCE_APP_NAMES } from "@/lib/import/records";
import { NameReview } from "./NameReview";
import { formatRange } from "./format";
import { joinList, pluralGrouped } from "@/lib/text";

const CARDIO_WORDS: Record<string, [string, string]> = {
  run: ["run", "runs"],
  walk: ["walk", "walks"],
  hike: ["hike", "hikes"],
  cycle: ["ride", "rides"],
  elliptical: ["elliptical session", "elliptical sessions"],
  swim: ["swim", "swims"],
  row: ["row", "rows"],
  other: ["other session", "other sessions"],
};

/** Everything the file holds, before anything is written. */
export function ImportPreviewPanel({
  fileName,
  preview,
  alreadyStored,
  choose,
  onImport,
  onCancel,
}: {
  fileName: string;
  preview: ImportPreview;
  alreadyStored: number;
  choose: (name: string, choice: MappingOverride | null) => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  const app = preview.app === "unknown" ? "Unknown" : SOURCE_APP_NAMES[preview.app];
  const fresh = preview.sessions - alreadyStored;
  const cardioParts = Object.entries(preview.cardioByKind).map(([kind, count]) =>
    pluralGrouped(count ?? 0, ...(CARDIO_WORDS[kind] ?? ["session", "sessions"]))
  );

  return (
    <div className="flex flex-col gap-4" data-testid="import-preview">
      <div className="flex items-start gap-3 rounded-xl bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{app} export</p>
          <p className="truncate text-xs text-muted-foreground">
            {fileName} · {pluralGrouped(preview.rowCount, "row", "rows")}
          </p>
          {preview.firstDate && (
            <p className="mt-1 text-sm text-foreground" data-testid="import-range">
              {formatRange(preview.firstDate, preview.lastDate)}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={onCancel}>
          Other file
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Sessions" value={preview.sessions.toLocaleString("en-US")} />
        <StatTile label="Sets" value={preview.sets.toLocaleString("en-US")} />
        <StatTile label="Cardio" value={preview.cardio.toLocaleString("en-US")} />
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          preview.warmups > 0 && pluralGrouped(preview.warmups, "warm-up set", "warm-up sets"),
          preview.drops > 0 && pluralGrouped(preview.drops, "drop set", "drop sets"),
        ]
          .filter(Boolean)
          .join(" and ") || "No warm-ups or drop sets"}
        {cardioParts.length > 0 ? `. Cardio: ${joinList(cardioParts)}.` : "."} Runs become runs and the rest
        activities; any that overlap a session already logged (from Apple Health, say) are left out.
      </p>

      {alreadyStored > 0 && (
        <Callout variant="info" title={fresh > 0 ? `${pluralGrouped(fresh, "new session", "new sessions")}` : "Already imported"}>
          {pluralGrouped(alreadyStored, "session in this file is", "sessions in this file are")} stored already and will not be
          added again.
        </Callout>
      )}

      {preview.rejected.total > 0 && (
        <Callout variant="warning" title={`${pluralGrouped(preview.rejected.total, "row", "rows")} left out`}>
          <ul className="mt-1 space-y-0.5" data-testid="import-rejected">
            {preview.rejected.reasons.map((r) => (
              <li key={r.reason}>
                {pluralGrouped(r.count, "row", "rows")}: {r.reason} (row {r.rows.join(", ")}
                {r.count > r.rows.length ? ", …" : ""})
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {preview.samples.length > 0 && (
        <section aria-label="Sample sets" className="rounded-xl bg-card px-4 py-3">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How weights will read
          </h2>
          <ul className="mt-2 divide-y divide-border" data-testid="import-samples">
            {preview.samples.map((s, i) => (
              <li key={i} className="py-2">
                <p className="text-sm text-foreground">
                  {s.exerciseName}
                  {s.mappedName && s.mappedName !== s.exerciseName ? (
                    <span className="text-muted-foreground"> → {s.mappedName}</span>
                  ) : null}
                </p>
                <p className="font-mono text-sm tabular-nums text-foreground">
                  {s.reps ?? "–"} × {s.load}
                  {s.totalLb !== null && s.load.includes("×") ? (
                    <span className="text-muted-foreground"> ({Math.round(s.totalLb)} lb in all)</span>
                  ) : null}
                </p>
                {s.fileImplements !== null && (
                  <p className="text-xs text-warning">
                    The file counts {s.fileImplements === 1 ? "one implement" : `${s.fileImplements} implements`} here; check
                    the match.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            If a weight looks doubled or halved, map that name to the right exercise below.
          </p>
        </section>
      )}

      <NameReview names={preview.names} choose={choose} />

      {/* Stays in reach above the tab bar while the names are reviewed. */}
      <div className="sticky bottom-24 z-10 rounded-xl bg-background/95 py-2 backdrop-blur">
        <Button size="lg" className="min-h-11 w-full" onClick={onImport} disabled={fresh <= 0 && preview.cardio === 0}>
          {fresh > 0 ? `Import ${pluralGrouped(fresh, "session", "sessions")}` : "Import cardio"}
        </Button>
      </div>
    </div>
  );
}
