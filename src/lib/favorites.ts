import type {
  FavoriteSnapshotEntry,
  FavoriteWorkout,
  PlanEdit,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import { overridesFromSession } from "@/lib/workout/buildPlan";
import {
  pinSnapshot,
  snapshotOfPlan,
  snapshotOfSets,
  structuralEdits,
} from "@/lib/workout/planEdits";
import { excludeWarmUps } from "@/lib/workout/setSelectors";
import type { WorkoutPlan } from "@/lib/workout/types";

/** How a favourite is started: the frozen copy, or the same structure at today's numbers. */
export type FavoriteMode = "as-saved" | "current";

/** Longest favourite name stored. */
export const FAVORITE_NAME_MAX_LENGTH = 40;

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
  let planEdits: PlanEdit[];

  if (mode === "as-saved") {
    planEdits = pinSnapshot(favorite.edits, favorite.snapshot);
  } else {
    const extra = broughtIn(favorite);
    const carried: FavoriteSnapshotEntry[] = favorite.snapshot
      .filter((entry) => extra.has(entry.exerciseId))
      .map((entry) => ({ ...entry, weight: lastWeights[entry.exerciseId] ?? entry.weight }));
    planEdits = pinSnapshot(favorite.edits, carried);
  }

  return {
    favoriteId: favorite.id,
    templateId: favorite.templateId,
    location: favorite.location,
    includeWarmUps: favorite.includeWarmUps,
    selectedAccessories: [...favorite.selectedAccessories],
    overrides: { ...favorite.substitutes },
    planEdits,
  };
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
 * exercise actually performed (the substitute when there was one). Warm-ups are left
 * out. Used to suggest a weight for an exercise the program does not prescribe.
 */
export function lastLoggedWeights(
  workouts: Pick<WorkoutSession, "startedAt" | "sets">[]
): Record<string, number> {
  const ordered = [...workouts].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const weights: Record<string, number> = {};
  for (const workout of ordered) {
    for (const set of excludeWarmUps(workout.sets ?? [])) {
      weights[set.substituteExerciseId ?? set.exerciseId] = set.weight;
    }
  }
  return weights;
}
