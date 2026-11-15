import { useLiveQuery } from "dexie-react-hooks";
import { readLedgerRecords, type LedgerRecords } from "@/lib/data/forecasts";

/**
 * Every row the forecasts, the decision traces and the readiness score are worked out
 * from, read as one snapshot; `undefined` while loading, and live afterwards. An empty
 * database gives empty lists and the default settings.
 *
 * `readAt` is when the snapshot was taken. The hooks built on this use it as "now",
 * so a workout finished while a screen is open is never newer than the clock the
 * models read.
 */
export function useLedgerRecords(): LedgerRecords | undefined {
  return useLiveQuery(() => readLedgerRecords(), []);
}
