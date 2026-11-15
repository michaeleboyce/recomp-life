// Data layer: the coach's change log. Only changes that cannot be worked out from the
// rest of the data are stored. Rows are append-only.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import type { CoachEvent } from "@/types";
import { newRowStamps } from "./stamp";

export type CoachEventInput = Pick<CoachEvent, "kind" | "title" | "detail" | "ruleId" | "data"> & {
  /** When it happened; defaults to now. */
  at?: Date;
};

/** Stores one event and returns it. */
export async function recordCoachEvent(
  input: CoachEventInput,
  now: number = Date.now()
): Promise<CoachEvent> {
  const id = uuidv4();
  const event: CoachEvent = {
    id,
    clientId: id,
    at: input.at ?? new Date(now),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    ...(input.ruleId !== undefined ? { ruleId: input.ruleId } : {}),
    ...(input.data !== undefined ? { data: input.data } : {}),
    ...newRowStamps(now),
  };
  await db.coachEvents.add(event);
  return event;
}

/** Every stored event that is not soft-deleted, newest first. */
export async function listCoachEvents(): Promise<CoachEvent[]> {
  const rows = await db.coachEvents.orderBy("at").reverse().toArray();
  return rows.filter((row) => row.deletedAt == null);
}
