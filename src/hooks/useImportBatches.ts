import { useLiveQuery } from "dexie-react-hooks";
import { listImportBatches, type ImportBatchSummary } from "@/lib/data/imported";

/** Every import on this device, live or undone, newest first. Undefined while loading. */
export function useImportBatches(): ImportBatchSummary[] | undefined {
  return useLiveQuery(() => listImportBatches(), []);
}
