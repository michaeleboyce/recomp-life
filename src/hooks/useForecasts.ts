import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { Forecast } from "@/types";
import { liveRows } from "./liveRows";

/** Stored forecasts, oldest made first. */
export function useForecasts(): Forecast[] | undefined {
  return useLiveQuery(async () => liveRows(await db.forecasts.orderBy("madeAt").toArray()), []);
}
