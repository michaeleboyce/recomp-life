import { useLiveQuery } from "dexie-react-hooks";
import { readLedgerRecords, type LedgerRecords } from "@/lib/data/forecasts";
import { useMappingOverrides } from "./useMappingOverrides";

/**
 * Every row the forecasts, the decision traces and the readiness score are worked out
 * from, read as one snapshot; `undefined` while loading, and live afterwards. An empty
 * database gives empty lists and the default settings.
 *
 * `readAt` is when the snapshot was taken. The hooks built on this use it as "now",
 * so a workout finished while a screen is open is never newer than the clock the
 * models read. Imported names are read through the choices remembered on this device,
 * and a remap reads the records again, as every other planning path does.
 */
export function useLedgerRecords(): LedgerRecords | undefined {
  const overrides = useMappingOverrides();
  return useLiveQuery(() => readLedgerRecords(new Date(), overrides), [overrides]);
}
