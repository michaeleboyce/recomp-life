// "Your own numbers" for a rule page. The maths lives in src/lib/evidence/personal;
// this only reads the log and memoises the result.
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { RuleId } from "@/lib/evidence";
import {
  hasPersonalEvidence,
  personalEvidenceFor,
  type PersonalEvidence,
  type PersonalLog,
} from "@/lib/evidence/personal";

/** The log as one snapshot, with the time it was read. Null when it could not be read. */
async function readPersonalLog(): Promise<{ log: PersonalLog; readAt: Date } | null> {
  try {
    return await db.transaction(
      "r",
      [db.workouts, db.forecasts, db.readinessLogs, db.runs, db.activities],
      async () => ({
        log: {
          workouts: await db.workouts.toArray(),
          forecasts: await db.forecasts.toArray(),
          readinessLogs: await db.readinessLogs.toArray(),
          runs: await db.runs.toArray(),
          activities: await db.activities.toArray(),
        },
        readAt: new Date(),
      })
    );
  } catch {
    // The card is an extra on a page that is otherwise static: if the local database
    // cannot be read (no IndexedDB, a private window), the page shows without it.
    return null;
  }
}

/**
 * What the user's own log says about a rule's question, for the rules that have a
 * "Your own numbers" card (`hasPersonalEvidence`). `undefined` while loading; `null`
 * for any other rule or when the log cannot be read. Live: it updates as workouts,
 * runs and check-ins are logged. Below the minimum sample `result` is null and
 * `needed` says how many more each group needs.
 */
export function usePersonalEvidence(ruleId: RuleId): PersonalEvidence | null | undefined {
  const supported = hasPersonalEvidence(ruleId);
  const snapshot = useLiveQuery(
    async () => (supported ? readPersonalLog() : null),
    [supported]
  );
  return useMemo(() => {
    if (!supported) return null;
    if (snapshot === undefined) return undefined;
    if (snapshot === null) return null;
    return personalEvidenceFor(ruleId, snapshot.log, snapshot.readAt);
  }, [ruleId, supported, snapshot]);
}
