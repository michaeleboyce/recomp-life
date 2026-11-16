import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { ImportedSessionRecord } from "@/types";
import { liveRows } from "./liveRows";

/** Imported sessions, oldest first. Undefined while loading. */
export function useImportedSessions(): ImportedSessionRecord[] | undefined {
  return useLiveQuery(async () => liveRows(await db.importedSessions.orderBy("startedAt").toArray()), []);
}
