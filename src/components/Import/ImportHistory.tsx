"use client";

import { useRef } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useImportedSessions } from "@/hooks/useImportedSessions";
import { useImportFlow, type ImportResult } from "@/hooks/useImportFlow";
import type { ImportUndoRecord } from "@/lib/import/remembered";
import { ImportPreviewPanel } from "./ImportPreviewPanel";
import { StartingWeights } from "./StartingWeights";
import { formatDay } from "./format";
import { joinList, pluralGrouped } from "@/lib/text";

function describeResult(result: ImportResult): string {
  const added = [
    result.sessionsAdded > 0 &&
      `${pluralGrouped(result.sessionsAdded, "session", "sessions")} (${pluralGrouped(result.setsAdded, "set", "sets")})`,
    result.runsAdded > 0 && pluralGrouped(result.runsAdded, "run", "runs"),
    result.activitiesAdded > 0 && pluralGrouped(result.activitiesAdded, "activity", "activities"),
  ].filter((p): p is string => Boolean(p));
  const left = [
    result.sessionsAlready > 0 && `${pluralGrouped(result.sessionsAlready, "session was", "sessions were")} imported before`,
    result.cardioAlready > 0 && `${pluralGrouped(result.cardioAlready, "cardio entry was", "cardio entries were")} imported before`,
    result.cardioOverlapping > 0 &&
      `${pluralGrouped(result.cardioOverlapping, "cardio entry overlaps", "cardio entries overlap")} one already logged`,
    result.cardioNoDuration > 0 && `${pluralGrouped(result.cardioNoDuration, "cardio entry has", "cardio entries have")} no duration`,
  ].filter((p): p is string => Boolean(p));
  const first = added.length > 0 ? `Added ${joinList(added)}.` : "Nothing new to add.";
  const second = left.length > 0 ? ` Left out: ${joinList(left)}.` : "";
  return first + second;
}

function FilePicker({ onPick, label }: { onPick: (file: File) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        aria-label="Export file"
        data-testid="import-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <Button size="lg" className="min-h-11 w-full" onClick={() => input.current?.click()}>
        <FileUp aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}

function LastImport({ record, onUndo }: { record: ImportUndoRecord; onUndo: () => void }) {
  const cardio = record.runIds.length + record.activityIds.length;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card px-4 py-3">
      <p className="text-sm font-medium text-foreground">Last import on this device</p>
      <p className="text-xs text-muted-foreground">
        {record.fileName}, {formatDay(new Date(record.at))}: {pluralGrouped(record.sessions, "session", "sessions")}
        {cardio > 0 ? ` and ${pluralGrouped(cardio, "cardio entry", "cardio entries")}` : ""}.
      </p>
      <Button variant="outline" className="min-h-11" onClick={onUndo}>
        Undo this import
      </Button>
    </div>
  );
}

/** Settings → Import history: pick an export, review it, import it, undo it. */
export function ImportHistory() {
  const flow = useImportFlow();
  const imported = useImportedSessions();
  const { state } = flow;
  const hasHistory = (imported?.length ?? 0) > 0;

  if (state.step === "reading") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="text-sm text-muted-foreground">Reading {state.fileName}…</p>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state.step === "preview" && flow.preview) {
    return (
      <ImportPreviewPanel
        fileName={state.fileName}
        preview={flow.preview}
        alreadyStored={state.alreadyStored}
        choose={flow.chooseMapping}
        onImport={() => void flow.runImport()}
        onCancel={flow.reset}
      />
    );
  }

  if (state.step === "importing") {
    const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 100;
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-card px-4 py-4" data-testid="import-progress">
        <p className="text-sm font-medium text-foreground">Importing {state.fileName}</p>
        <Progress value={percent} aria-label="Import progress" />
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {state.done.toLocaleString("en-US")} of {pluralGrouped(state.total, "session", "sessions")} written
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.step === "done" && (
        <Callout
          variant="success"
          title="Import finished"
          actions={
            state.result.undo.sessions + state.result.undo.runIds.length + state.result.undo.activityIds.length > 0 ? (
              <Button variant="outline" className="min-h-11" onClick={() => void flow.undo(state.result.undo)}>
                Undo this import
              </Button>
            ) : undefined
          }
        >
          <span data-testid="import-result">{describeResult(state.result)}</span> Imported sessions are history: they
          inform strength estimates and muscle work, never the workout rotation or progression.
        </Callout>
      )}
      {state.step === "undone" && (
        <Callout variant="info" title="Import undone">
          Removed {pluralGrouped(state.sessions, "session", "sessions")}
          {state.cardio > 0 ? ` and ${pluralGrouped(state.cardio, "cardio entry", "cardio entries")}` : ""}. Importing the file
          again will not bring them back.
        </Callout>
      )}
      {state.step === "invalid" && (
        <Callout variant="danger" title={`Could not use ${state.fileName}`}>
          {state.message}
        </Callout>
      )}
      {state.step === "failed" && (
        <Callout variant="danger" title="Something went wrong">
          {state.message}
        </Callout>
      )}

      <div className="flex flex-col gap-3 rounded-xl bg-card px-4 py-4">
        <p className="text-sm text-foreground">
          Bring in your training history from a Fitbod or Gravl export (a CSV file).
        </p>
        <p className="text-xs text-muted-foreground">
          The file is read on this device and never uploaded. You see what it holds before anything is saved, and an
          import can be undone. Importing the same file again adds nothing twice.
        </p>
        <FilePicker
          onPick={(file) => void flow.pickFile(file)}
          label={state.step === "pick" ? "Choose an export file" : "Choose another file"}
        />
      </div>

      {state.step !== "done" && flow.lastImport && (
        <LastImport record={flow.lastImport} onUndo={() => void flow.undo(flow.lastImport ?? undefined)} />
      )}

      {hasHistory && <StartingWeights />}
    </div>
  );
}
