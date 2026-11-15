// Data layer: profile, bodyweight, pain, run and maintenance writes. Every write
// stamps `updatedAt` and marks the row unsynced (see stamp.ts).
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import { getPhaseAccessoryCap } from "@/lib/accessories";
import { REPS_MODEL } from "@/lib/forecast/coefficients";
import { formatRestDuration, getRestSeconds } from "@/lib/restTimes";
import type {
  BodyweightLog,
  PainSorenessEntry,
  RunLog,
  ActivityLog,
  TrainingPhase,
  UserProfile,
  UserSettings,
} from "@/types";
import { recordCoachEvent, type CoachEventInput } from "./coachEvents";
import { attemptLedgerWrite, recordBodyweightForecast } from "./forecasts";
import { softDelete } from "./logEdits";
import { editStamps, newRowStamps } from "./stamp";

type NewRecord<T> = Omit<T, "id" | "clientId" | "synced" | "updatedAt" | "deletedAt">;

/** Reads the single profile and applies `change` to it, in one transaction. */
async function modifyProfile(
  change: (profile: UserProfile) => Partial<UserProfile>
): Promise<void> {
  await db.transaction("rw", db.userProfile, async () => {
    const profile = await db.userProfile.toCollection().first();
    if (!profile) {
      throw new Error("No user profile: the database has not been initialised");
    }
    await db.userProfile.update(profile.id, { ...change(profile), ...editStamps(profile) });
  });
}

/** The tiers whose rest depends on the phase, heaviest first. */
const PHASE_REST_TIERS = ["T1", "T2"] as const;

/**
 * The adjustment-log entry for a change of training phase: what the app does
 * differently from now on (rest after heavy sets, the accessory limit, forecasts),
 * with every number read from the code that decides it. Null when the mode is the
 * same. Pure.
 */
export function phaseChangeEvent(from: TrainingPhase, to: TrainingPhase): CoachEventInput | null {
  if (from.mode === to.mode) return null;

  const rests = PHASE_REST_TIERS.map((tier) => ({
    tier,
    before: getRestSeconds(tier, from),
    after: getRestSeconds(tier, to),
  }));
  const changedRests = rests.filter((rest) => rest.before !== rest.after);
  const restText =
    changedRests.length > 0
      ? `Rest ${changedRests
          .map(
            (rest) =>
              `after ${rest.tier} sets goes from ${formatRestDuration(rest.before)} to ${formatRestDuration(rest.after)}`
          )
          .join(" and ")}.`
      : "Rest times stay as they are.";

  const capBefore = getPhaseAccessoryCap(from);
  const capAfter = getPhaseAccessoryCap(to);
  const capText =
    capBefore === capAfter
      ? `The accessory limit stays at ${capAfter}.`
      : `The accessory limit goes from ${capBefore} to ${capAfter}.`;

  const cut = `${Number((-REPS_MODEL.cuttingLevelShift * 100).toPrecision(3))}%`;
  const forecastText =
    to.mode === "cutting"
      ? `Forecasts of your last-set reps assume ${cut} less strength until most of your recent sessions were done while cutting, and session-length forecasts use the longer rests.`
      : from.mode === "cutting"
        ? "Forecasts of your last-set reps no longer allow for a cut, and session-length forecasts use the shorter rests."
        : "Forecasts made from now on record the new phase; the numbers behind them do not change.";

  const data: NonNullable<CoachEventInput["data"]> = {
    setting: "trainingPhase",
    from: from.mode,
    to: to.mode,
    accessoryCapFrom: capBefore,
    accessoryCapTo: capAfter,
  };
  for (const rest of rests) {
    data[`rest${rest.tier}From`] = rest.before;
    data[`rest${rest.tier}To`] = rest.after;
  }

  return {
    kind: "settingsChange",
    title: `Training phase set to ${to.mode}`,
    detail: `You changed it from ${from.mode}. ${restText} ${capText} ${forecastText} Forecasts already stored are not touched.`,
    // The rest bonus is the change with a rule of its own; without it, the accessory limit's.
    ruleId: changedRests.length > 0 ? "rest-cut-bonus" : "accessories-in-cut",
    data,
  };
}

/**
 * Merges a patch into the single profile's settings and marks the profile unsynced.
 * A change of training phase is also recorded in the coach's change log, in the same
 * transaction, so the adjustment log can never miss one.
 */
export async function updateSettings(
  patch: Partial<UserSettings>,
  now: number = Date.now()
): Promise<void> {
  await db.transaction("rw", [db.userProfile, db.coachEvents], async () => {
    const profile = await db.userProfile.toCollection().first();
    if (!profile) {
      throw new Error("No user profile: the database has not been initialised");
    }
    const settings = { ...profile.settings, ...patch };
    await db.userProfile.update(profile.id, { settings, ...editStamps(profile, now) });

    const event = phaseChangeEvent(profile.settings.trainingPhase, settings.trainingPhase);
    if (event) await recordCoachEvent(event, now);
  });
}

/** Merges a patch into the single profile (name, bodyweight, height) and marks it unsynced. */
export async function updateProfile(
  patch: Partial<Pick<UserProfile, "name" | "bodyweight" | "heightInches">>
): Promise<void> {
  await modifyProfile(() => patch);
}

/**
 * Adds a bodyweight entry and returns its id. The bodyweight forecast for a date
 * weeks ahead is then written to the ledger as things stand at `now`, at most one a
 * week; a failure there is logged and the entry is saved all the same.
 */
export async function logBodyweight(
  entry: NewRecord<BodyweightLog>,
  now: Date = new Date()
): Promise<string> {
  const id = uuidv4();
  await db.bodyweight.add({ ...entry, id, clientId: id, ...newRowStamps() });
  await attemptLedgerWrite("Forecasting bodyweight after a weigh-in", () =>
    recordBodyweightForecast(now)
  );
  return id;
}

/** Edits a bodyweight entry. Does nothing when it does not exist. */
export async function updateBodyweight(
  id: string,
  patch: Partial<NewRecord<BodyweightLog>>
): Promise<void> {
  await db.transaction("rw", db.bodyweight, async () => {
    const row = await db.bodyweight.get(id);
    if (!row) return;
    await db.bodyweight.update(id, { ...patch, ...editStamps(row) });
  });
}

/** Adds or replaces a pain/soreness entry and returns its id. */
export async function savePainEntry(
  entry: NewRecord<PainSorenessEntry> & { id?: string }
): Promise<string> {
  const { id: givenId, ...fields } = entry;
  const id = givenId ?? uuidv4();
  await db.transaction("rw", db.painEntries, async () => {
    const existing = givenId ? await db.painEntries.get(givenId) : undefined;
    await db.painEntries.put({
      ...fields,
      id,
      clientId: existing?.clientId ?? uuidv4(),
      // Saving an entry makes it live again, whatever it was before.
      deletedAt: null,
      ...editStamps(existing),
    });
  });
  return id;
}

/** Edits a pain/soreness entry. Does nothing when it does not exist. */
export async function updatePainEntry(
  id: string,
  patch: Partial<NewRecord<PainSorenessEntry>>
): Promise<void> {
  await db.transaction("rw", db.painEntries, async () => {
    const row = await db.painEntries.get(id);
    if (!row) return;
    await db.painEntries.update(id, { ...patch, ...editStamps(row) });
  });
}

/** Soft-deletes a pain/soreness entry, so the delete can sync and be undone. */
export async function deletePainEntry(id: string): Promise<void> {
  await softDelete("painEntries", id);
}

/** Adds a run and returns its id. */
export async function logRun(run: NewRecord<RunLog>): Promise<string> {
  const id = uuidv4();
  await db.runs.add({ ...run, id, clientId: id, ...newRowStamps() });
  return id;
}

/** Adds a non-running activity (yoga, cycling, hiking...) and returns its id. */
export async function logActivity(activity: NewRecord<ActivityLog>): Promise<string> {
  const id = uuidv4();
  await db.activities.add({ ...activity, id, clientId: id, ...newRowStamps() });
  return id;
}

/** Empties every local table (Settings > Data). Does not re-seed. */
export async function clearAllData(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
