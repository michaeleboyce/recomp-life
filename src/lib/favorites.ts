import type {
  FavoriteSnapshotEntry,
  FavoriteWorkout,
  PlanEdit,
  Tier,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import { EXERCISES } from "@/lib/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { overridesFromSession } from "@/lib/workout/buildPlan";
import {
  pinSnapshot,
  snapshotOfPlan,
  snapshotOfSets,
  structuralEdits,
} from "@/lib/workout/planEdits";
import { excludeWarmUps, isWorkingSet } from "@/lib/workout/setSelectors";
import type { WorkoutPlan } from "@/lib/workout/types";

/** How a favourite is started: the frozen copy, or the same structure at today's numbers. */
export type FavoriteMode = "as-saved" | "current";

/** Longest favourite name stored. */
export const FAVORITE_NAME_MAX_LENGTH = 40;

/** The edits that pin one snapshot entry, and the exercise its weight belongs to. */
export interface FavoritePin {
  exerciseId: string;
  tier: Tier;
  /** At home: the home exercise the pinned weight is for (as lifted). */
  performedAs?: string;
  /** Its `scheme` and `weight` pins, as they appear in `planEdits`. */
  edits: PlanEdit[];
}

/** What `startWorkout` and the plan builder need to run a favourite. */
export interface ResolvedFavorite {
  favoriteId: string;
  templateId: string;
  location: WorkoutLocation;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  /** Home substitutes: template exerciseId -> substitute exerciseId. */
  overrides: Record<string, string>;
  planEdits: PlanEdit[];
  /** The pinned entries of `planEdits` (`location` is where their weights were set). */
  pins?: FavoritePin[];
}

/** A pin left out of a favourite's edits, and why. */
export interface DroppedPin {
  exerciseId: string;
  tier: Tier;
  performedAs?: string;
  /** "otherLocation": set at the other location. "otherExercise": for another home exercise. */
  reason: "otherLocation" | "otherExercise";
}

interface NewFavoriteIdentity {
  id: string;
  clientId: string;
  name: string;
  now: Date;
}

/** A trimmed, length-limited favourite name; `fallback` when nothing is left. */
export function cleanFavoriteName(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, FAVORITE_NAME_MAX_LENGTH).trim();
  return trimmed || fallback;
}

function newFavorite(
  identity: NewFavoriteIdentity,
  fields: Omit<
    FavoriteWorkout,
    "id" | "clientId" | "name" | "createdAt" | "updatedAt" | "deletedAt" | "synced"
  >
): FavoriteWorkout {
  return {
    id: identity.id,
    clientId: identity.clientId,
    name: cleanFavoriteName(identity.name, `Workout ${fields.templateId}`),
    ...fields,
    createdAt: identity.now,
    updatedAt: identity.now.getTime(),
    deletedAt: null,
    synced: false,
  };
}

/** A favourite from the pre-workout screen: the choices made there and the plan they built. */
export function favoriteFromSetup(
  identity: NewFavoriteIdentity,
  setup: {
    templateId: string;
    location: WorkoutLocation;
    includeWarmUps: boolean;
    selectedAccessories: string[];
    substitutes: Record<string, string>;
    edits: PlanEdit[];
    /** The plan as previewed, edits applied. */
    plan: WorkoutPlan;
  }
): FavoriteWorkout {
  return newFavorite(identity, {
    templateId: setup.templateId,
    location: setup.location,
    includeWarmUps: setup.includeWarmUps,
    selectedAccessories: [...setup.selectedAccessories],
    substitutes: { ...setup.substitutes },
    edits: structuralEdits(setup.edits),
    snapshot: snapshotOfPlan(setup.plan),
  });
}

/** A favourite from a finished session: its choices, its edits and what was logged. */
export function favoriteFromSession(
  identity: NewFavoriteIdentity,
  session: WorkoutSession
): FavoriteWorkout {
  return newFavorite(identity, {
    templateId: session.templateId,
    location: session.location,
    includeWarmUps: session.includeWarmUps,
    selectedAccessories: [...(session.selectedAccessories ?? [])],
    substitutes: overridesFromSession(session),
    edits: structuralEdits(session.planEdits),
    snapshot: snapshotOfSets(session.sets ?? []),
    sourceSessionId: session.id,
  });
}

/**
 * The exercises a favourite's edits bring in that the program does not prescribe:
 * swap replacements and added exercises.
 */
function broughtIn(favorite: FavoriteWorkout): Set<string> {
  const ids = new Set<string>();
  for (const edit of favorite.edits) {
    if (edit.kind === "swap") ids.add(edit.replacementId);
    if (edit.kind === "add") ids.add(edit.exerciseId);
  }
  return ids;
}

/**
 * The inputs to start a favourite.
 *
 * - "as-saved": the structural edits plus a pin for every snapshot entry, so sets,
 *   reps and weights are exactly what was saved.
 * - "current": the structural edits only, so program lifts take today's prescription.
 *   Exercises the edits bring in have no prescription: they keep the saved sets and
 *   reps and use the last weight logged for them (`lastWeights`), or the saved weight
 *   when they have not been done since.
 */
export function resolveFavorite(
  favorite: FavoriteWorkout,
  mode: FavoriteMode,
  lastWeights: Record<string, number> = {}
): ResolvedFavorite {
  const pinned: FavoriteSnapshotEntry[] =
    mode === "as-saved"
      ? favorite.snapshot
      : favorite.snapshot
          .filter((entry) => broughtIn(favorite).has(entry.exerciseId))
          .map((entry) => ({ ...entry, weight: lastWeights[entry.exerciseId] ?? entry.weight }));
  const pins: FavoritePin[] = pinned.map((entry) => ({
    exerciseId: entry.exerciseId,
    tier: entry.tier,
    ...(entry.performedAs ? { performedAs: entry.performedAs } : {}),
    edits: pinSnapshot([], [entry]),
  }));
  const planEdits = pinSnapshot(favorite.edits, pinned);

  // As saved, a home favourite asks for the home exercises its weights were for.
  const overrides = { ...favorite.substitutes };
  if (mode === "as-saved" && favorite.location === "home") {
    for (const entry of favorite.snapshot) {
      if (entry.performedAs && isProgramSlot(favorite.templateId, entry)) overrides[entry.exerciseId] = entry.performedAs;
    }
  }

  return {
    favoriteId: favorite.id,
    templateId: favorite.templateId,
    location: favorite.location,
    includeWarmUps: favorite.includeWarmUps,
    selectedAccessories: [...favorite.selectedAccessories],
    overrides,
    planEdits,
    pins,
  };
}

const PROGRAM_TIERS: readonly Tier[] = ["T1", "T2", "T3"];

/** True when the template prescribes this lift at this tier (a slot a home exercise may fill). */
function isProgramSlot(templateId: string, entry: { exerciseId: string; tier: Tier }): boolean {
  return (
    PROGRAM_TIERS.includes(entry.tier) &&
    (WORKOUT_TEMPLATES[templateId]?.exercises ?? []).some(
      (ex) => ex.exerciseId === entry.exerciseId && ex.tier === entry.tier
    )
  );
}

/**
 * True when a pinned weight means something different at the two locations: an entry
 * done as a home exercise, or a program lift that needs the gym (at home it is done as
 * a home exercise at that exercise's own weight).
 */
function locationBound(templateId: string, pin: FavoritePin): boolean {
  if (pin.performedAs) return true;
  return isProgramSlot(templateId, pin) && Boolean(EXERCISES[pin.exerciseId]?.requiresGym);
}

const sameEdit = (a: PlanEdit, b: PlanEdit) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * A favourite's edits for a session at `location`, without the pins that do not belong
 * there: a weight set at the other location for a lift done differently there (a home
 * exercise's dumbbell weight would land on the barbell lift, a barbell weight on the
 * home exercise), and, at home with the `plan` known, a weight saved for another home
 * exercise than the one planned. Those lifts take today's plan weight instead. Every
 * other edit in `edits` (structural edits, other pins, the user's own changes since)
 * is kept, in order. `dropped` says which lifts lost a pin, for `favoritePinNote`; a pin
 * none of whose edits is still in `edits` (reset, or another day) lost nothing.
 */
export function favoriteEditsAt(
  favorite: Pick<ResolvedFavorite, "templateId" | "location" | "planEdits" | "pins">,
  location: WorkoutLocation,
  edits: PlanEdit[] = favorite.planEdits,
  plan?: WorkoutPlan
): { edits: PlanEdit[]; dropped: DroppedPin[] } {
  const dropped: DroppedPin[] = [];
  const drop: PlanEdit[] = [];
  for (const pin of favorite.pins ?? []) {
    if (!pin.edits.some((pinned) => edits.some((edit) => sameEdit(pinned, edit)))) continue;
    let reason: DroppedPin["reason"] | null = null;
    if (location !== favorite.location) {
      if (locationBound(favorite.templateId, pin)) reason = "otherLocation";
    } else if (location === "home" && pin.performedAs && plan) {
      const entry = plan.find((e) => !e.isWarmUp && e.exerciseId === pin.exerciseId && e.tier === pin.tier);
      if (entry && entry.substituteExerciseId !== pin.performedAs) reason = "otherExercise";
    }
    if (!reason) continue;
    dropped.push({
      exerciseId: pin.exerciseId,
      tier: pin.tier,
      ...(pin.performedAs ? { performedAs: pin.performedAs } : {}),
      reason,
    });
    drop.push(...pin.edits);
  }
  if (drop.length === 0) return { edits, dropped };
  return { edits: edits.filter((edit) => !drop.some((pin) => sameEdit(pin, edit))), dropped };
}

const nameOf = (exerciseId: string) => (EXERCISES[exerciseId]?.name ?? exerciseId).replace(/^Barbell /, "");

/** "Squat", "Squat and Bench Press", "Squat, Bench Press and Lat Pulldown". */
function listOf(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What the setup says when `favoriteEditsAt` dropped pins; null when it dropped none. */
export function favoritePinNote(dropped: readonly DroppedPin[], location: WorkoutLocation): string | null {
  const parts: string[] = [];
  const moved = dropped.filter((d) => d.reason === "otherLocation").map((d) => nameOf(d.exerciseId));
  if (moved.length > 0) {
    parts.push(
      location === "gym"
        ? `Saved at home: the gym uses today's program weights for ${listOf(moved)}.`
        : `Saved at the gym: at home each lift uses its home exercise's own weight for ${listOf(moved)}.`
    );
  }
  for (const d of dropped) {
    if (d.reason !== "otherExercise") continue;
    parts.push(
      `The saved weight for ${nameOf(d.exerciseId)} was for ${nameOf(d.performedAs ?? d.exerciseId)}, so today's plan weight is used.`
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** The favourite saved from a session, if there is one that has not been deleted. */
export function favoriteForSession(
  favorites: FavoriteWorkout[],
  sessionId: string
): FavoriteWorkout | undefined {
  return favorites.find((f) => f.sourceSessionId === sessionId && f.deletedAt == null);
}

/** Favourites that have not been deleted, most recently used (or created) first. */
export function listFavorites(favorites: FavoriteWorkout[]): FavoriteWorkout[] {
  const when = (f: FavoriteWorkout) => new Date(f.lastUsedAt ?? f.createdAt).getTime();
  return favorites.filter((f) => f.deletedAt == null).sort((a, b) => when(b) - when(a));
}

/**
 * The last weight logged for each exercise across the given workouts, keyed by the
 * exercise actually performed (the substitute when there was one). Warm-ups and ramp,
 * back-off and drop sets are left out: the weight is a working set's. Used to suggest a
 * weight for an exercise the program does not prescribe.
 */
export function lastLoggedWeights(
  workouts: Pick<WorkoutSession, "startedAt" | "sets">[]
): Record<string, number> {
  const ordered = [...workouts].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const weights: Record<string, number> = {};
  for (const workout of ordered) {
    for (const set of excludeWarmUps(workout.sets ?? []).filter(isWorkingSet)) {
      weights[set.substituteExerciseId ?? set.exerciseId] = set.weight;
    }
  }
  return weights;
}
