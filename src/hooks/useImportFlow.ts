import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  countStoredImportedSessions,
  importBatchTotals,
  importSessionsInChunks,
  nextTask,
  undoImport,
  writeImportedCardio,
} from "@/lib/data/imported";
import { forgetMapping, rememberMapping, type MappingOverride, type MappingOverrides } from "@/lib/import/mapping";
import { parseExport, type ParsedExport } from "@/lib/import/parse";
import { buildImportPreview, type ImportPreview } from "@/lib/import/preview";
import { buildCardioRows, buildSessionRecords } from "@/lib/import/records";
import {
  clearLastImport,
  loadLastImport,
  loadMappingOverrides,
  saveLastImport,
  saveMappingOverrides,
  type ImportUndoRecord,
} from "@/lib/import/remembered";

/** A file's text: `Blob.text()` where the browser has it, else a FileReader (older WebKit). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsText(file);
  });
}

/** Files larger than this are refused before reading: no export of a person's training is near it. */
export const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

export interface ImportResult {
  batchId: string;
  fileName: string;
  sessionsAdded: number;
  /** Sessions in the file that were stored already (an earlier import of it). */
  sessionsAlready: number;
  setsAdded: number;
  runsAdded: number;
  activitiesAdded: number;
  /** Cardio entries left out because they overlap a logged session. */
  cardioOverlapping: number;
  cardioAlready: number;
  /** Cardio entries left out because they have no duration. */
  cardioNoDuration: number;
  undo: ImportUndoRecord;
}

export type ImportState =
  | { step: "pick" }
  | { step: "reading"; fileName: string }
  | { step: "invalid"; fileName: string; message: string }
  | { step: "preview"; fileName: string; parsed: ParsedExport; alreadyStored: number }
  | { step: "importing"; fileName: string; done: number; total: number }
  | { step: "done"; result: ImportResult }
  | { step: "undone"; sessions: number; cardio: number }
  | { step: "failed"; message: string };

export interface ImportFlow {
  state: ImportState;
  /** The preview of the file being reviewed, with the current name choices. */
  preview: ImportPreview | null;
  overrides: MappingOverrides;
  /** The last import on this device that can still be undone. */
  lastImport: ImportUndoRecord | null;
  pickFile: (file: File) => Promise<void>;
  /** Remembers a choice for a name (null forgets it, back to the built-in table). */
  chooseMapping: (name: string, choice: MappingOverride | null) => void;
  runImport: () => Promise<void>;
  undo: (record?: ImportUndoRecord) => Promise<void>;
  reset: () => void;
}

const noSubscription = () => () => {};

/** What this device remembers, as the server renders it: nothing. */
const NOTHING_STORED: { overrides: MappingOverrides; lastImport: ImportUndoRecord | null } = {
  overrides: {},
  lastImport: null,
};

/**
 * The import screen's steps: pick a file, read and preview it (nothing written), review
 * the names, import in chunks with progress, then the result with undo. The file is
 * read on this device and never uploaded; what is written syncs like any other row.
 */
export function useImportFlow(): ImportFlow {
  const [state, setState] = useState<ImportState>({ step: "pick" });
  const busy = useRef(false);

  // Device storage is read once the page has hydrated (false on the server and while
  // hydrating), so the first render matches the server's. What this screen changes
  // afterwards is held here, and saved to storage as it is made.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const stored = useMemo(
    () => (hydrated ? { overrides: loadMappingOverrides(), lastImport: loadLastImport() } : NOTHING_STORED),
    [hydrated]
  );
  const [chosenOverrides, setOverrides] = useState<MappingOverrides | null>(null);
  const [changedLastImport, setLastImport] = useState<{ record: ImportUndoRecord | null } | null>(null);
  const overrides = chosenOverrides ?? stored.overrides;
  const lastImport = changedLastImport ? changedLastImport.record : stored.lastImport;

  const parsed = state.step === "preview" ? state.parsed : null;
  const preview = useMemo(() => (parsed ? buildImportPreview(parsed, overrides) : null), [parsed, overrides]);

  const pickFile = useCallback(async (file: File) => {
    if (busy.current) return;
    busy.current = true;
    const fileName = file.name || "export";
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setState({ step: "invalid", fileName, message: "This file is too large to be an export of workouts." });
        return;
      }
      setState({ step: "reading", fileName });
      const text = await readFileText(file);
      // Let the screen show that the file is being read before the parse runs.
      await nextTask();
      const result = parseExport(text);
      if (result.error || result.app === "unknown") {
        setState({
          step: "invalid",
          fileName,
          message: `${result.error ?? "The file is not an export this app can read."} Choose a CSV export from Fitbod or Gravl.`,
        });
        return;
      }
      if (result.sessions.length === 0 && result.cardio.length === 0) {
        setState({ step: "invalid", fileName, message: "The file has no workouts or cardio this app can read." });
        return;
      }
      const alreadyStored = await countStoredImportedSessions(result.sessions.map((s) => s.id));
      setState({ step: "preview", fileName, parsed: result, alreadyStored });
    } catch (error) {
      console.error("Reading an export failed:", error);
      setState({ step: "invalid", fileName, message: "The file could not be read. Nothing was imported." });
    } finally {
      busy.current = false;
    }
  }, []);

  const chooseMapping = useCallback((name: string, choice: MappingOverride | null) => {
    setOverrides((chosen) => {
      const current = chosen ?? stored.overrides;
      const next = choice ? rememberMapping(current, name, choice) : forgetMapping(current, name);
      saveMappingOverrides(next);
      return next;
    });
  }, [stored]);

  const runImport = useCallback(async () => {
    if (state.step !== "preview" || busy.current) return;
    busy.current = true;
    const { fileName, parsed: file } = state;
    const batchId = `import-${uuidv4()}`;
    try {
      const sessions = buildSessionRecords(file, batchId, overrides);
      const cardio = buildCardioRows(file);
      setState({ step: "importing", fileName, done: 0, total: sessions.length });
      const sessionsAdded = await importSessionsInChunks(sessions, {
        onProgress: (done, total) => setState({ step: "importing", fileName, done, total }),
      });
      const written = await writeImportedCardio(cardio.rows);
      const undo: ImportUndoRecord = {
        batchId,
        at: Date.now(),
        fileName,
        sessions: sessionsAdded,
        runIds: written.runIds,
        activityIds: written.activityIds,
      };
      const anything = sessionsAdded + written.runIds.length + written.activityIds.length > 0;
      if (anything) {
        saveLastImport(undo);
        setLastImport({ record: undo });
      }
      const totals = await importBatchTotals(batchId);
      setState({
        step: "done",
        result: {
          batchId,
          fileName,
          sessionsAdded,
          sessionsAlready: sessions.length - sessionsAdded,
          setsAdded: totals.sets,
          runsAdded: written.runIds.length,
          activitiesAdded: written.activityIds.length,
          cardioOverlapping: written.overlapping,
          cardioAlready: written.alreadyStored,
          cardioNoDuration: cardio.noDuration,
          undo,
        },
      });
    } catch (error) {
      console.error("Import failed:", error);
      setState({
        step: "failed",
        message: "The import stopped part way. Sessions already written stay; importing the file again adds only the rest.",
      });
    } finally {
      busy.current = false;
    }
  }, [state, overrides]);

  const undo = useCallback(
    async (record?: ImportUndoRecord) => {
      const target = record ?? (state.step === "done" ? state.result.undo : lastImport);
      if (!target || busy.current) return;
      busy.current = true;
      try {
        const undone = await undoImport(target);
        clearLastImport();
        setLastImport({ record: null });
        setState({ step: "undone", sessions: undone.sessions, cardio: undone.runs + undone.activities });
      } catch (error) {
        console.error("Undoing an import failed:", error);
        setState({ step: "failed", message: "The import could not be undone. Nothing was changed; try again." });
      } finally {
        busy.current = false;
      }
    },
    [state, lastImport]
  );

  const reset = useCallback(() => setState({ step: "pick" }), []);

  return { state, preview, overrides, lastImport, pickFile, chooseMapping, runImport, undo, reset };
}
