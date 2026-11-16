import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { VariantState } from "@/types";

/**
 * The home exercises' own states (weight, scheme, which one is current), as the rebuild
 * last wrote them, sorted by id. Pass them to `buildWorkoutPlan` / `planForSession` /
 * `prescribedFor` as `variantStates` so home lifts are planned from their own weights.
 */
export function useVariantStates(): VariantState[] | undefined {
  return useLiveQuery(
    async () => (await db.variantStates.toArray()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    []
  );
}
