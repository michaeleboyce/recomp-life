import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { CoachEvent } from "@/types";
import { liveRows } from "./liveRows";

/** The coach's change log, newest first. */
export function useCoachEvents(): CoachEvent[] | undefined {
  return useLiveQuery(
    async () => liveRows(await db.coachEvents.orderBy("at").reverse().toArray()),
    []
  );
}
