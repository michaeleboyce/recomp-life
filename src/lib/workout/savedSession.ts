// One interpretation of a saved workout: what its stored prescription (`prescribed`,
// with `.home`) means for each lift. Resume (`planForSession`) and the history rebuild
// (`rebuildDerived`, rule 4) both read a saved session through `resolveSavedSession`,
// so a session cannot resume at one weight and be credited at another. Pure.
import { anchorToPrescription, emptyLiftState } from "@/lib/rebuild/fold";
import type { StrengthSet } from "@/lib/strength";
import type {
  EquipmentProfile,
  LiftState,
  VariantSeed,
  VariantState,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import { overridesFromSession } from "./buildPlan";
import { resolveLifts, type LiftResolution } from "./liftResolution";
import { anchorVariant, isVariantTier, seedVariantState, variantKey } from "./variant";

export interface SavedSessionInput {
  session: Pick<WorkoutSession, "prescribed" | "location" | "modifications"> & Partial<Pick<WorkoutSession, "startedAt">>;
  /** The session's template; unknown, no lift is resolved (the states are still anchored). */
  template: WorkoutTemplate | undefined;
  /** The lift states going in (the stored ones on resume, the running ones in the rebuild). */
  liftStates: readonly LiftState[];
  /** The home exercises' states going in. */
  variantStates: readonly VariantState[];
  /** The equipment now (resume) or as stored with the session (rebuild). */
  equipment: EquipmentProfile;
  /** Strength evidence from before the session: seeds a home exercise it did first (H3). */
  strengthSets?: readonly StrengthSet[];
}

export interface SavedSessionResolution {
  /** The lift states with the stored prescription laid on top (rule 4). */
  liftStates: LiftState[];
  /**
   * The home exercises' states the session is planned from: each stored home exercise
   * anchored to its prescription and the current one for its lift and tier.
   */
  variantStates: VariantState[];
  /**
   * Each stored home exercise anchored to its prescription (`anchorVariant`), by variant
   * id, its `current` flag as it was; one the session did first is seeded, then anchored.
   */
  anchored: Map<string, VariantState>;
  /** How the home exercises the session did first were seeded, by variant id. */
  seeds: Map<string, VariantSeed>;
  /**
   * Each program lift as the session does it. A lift with a stored prescription keeps
   * what was recorded: its exercise, weight and scheme, whatever the equipment set now
   * allows (`beyondEquipment` on the plan says when it no longer does).
   */
  lifts: LiftResolution[];
}

/**
 * The home exercises' states with a session's stored home prescriptions laid on top
 * (rule 4 for home exercises): each prescribed home exercise takes its stored weight and
 * scheme. One never used is seeded first; `seeds` says how, by variant id. The lift
 * states should already be anchored.
 */
function anchorHomePrescriptions(
  input: Omit<SavedSessionInput, "session"> & { session: Pick<WorkoutSession, "prescribed"> & Partial<Pick<WorkoutSession, "startedAt">> }
): { anchored: Map<string, VariantState>; seeds: Map<string, VariantSeed> } {
  const { session, template, equipment, strengthSets } = input;
  const byId = new Map(input.liftStates.map((state) => [state.exerciseId, state]));
  const variants = new Map(input.variantStates.map((v) => [v.id, v]));
  const anchored = new Map<string, VariantState>();
  const seeds = new Map<string, VariantSeed>();
  for (const entry of session.prescribed ?? []) {
    if (!entry.home || !isVariantTier(entry.tier)) continue;
    const tier = entry.tier;
    const id = variantKey(entry.exerciseId, entry.home.exerciseId, tier);
    const stored = variants.get(id);
    // Seeded from the sets before the session, as the plan seeded it (its weight is then
    // the stored one; the seed says how the plan got there).
    const going =
      stored ??
      seedVariantState({
        liftId: entry.exerciseId,
        exerciseId: entry.home.exerciseId,
        tier,
        liftState: byId.get(entry.exerciseId),
        equipment,
        ...(strengthSets ? { strengthSets } : {}),
        // Planned for the day the session started.
        ...(session.startedAt ? { now: new Date(session.startedAt) } : {}),
      });
    if (!stored) seeds.set(id, going.seed);
    const slot = template?.exercises.find((ex) => ex.exerciseId === entry.exerciseId && ex.tier === tier);
    anchored.set(id, anchorVariant(going, entry.home, slot ? { sets: slot.sets, reps: slot.reps } : undefined));
  }
  return { anchored, seeds };
}

/**
 * A saved session read once, for resume and for the rebuild alike.
 *
 * With a stored prescription: the lift states take its weights and stages
 * (`anchorToPrescription`), each stored home exercise takes its own (`anchorVariant`)
 * and becomes the current one for its lift and tier, and the lifts are resolved from
 * those states (`resolveLifts`, with the session's home substitutes). Each lift then
 * keeps what the session recorded: the stored sets and reps of the lift, or of the home
 * exercise when it is the one performed, and the stored weight as lifted. A saved session
 * keeps the weight it recorded: a home weight heavier than the heaviest dumbbell set now
 * (or off the dumbbell step) is not capped again. A home exercise the session did first
 * keeps the note of how it was seeded.
 *
 * Without one (sessions saved before prescriptions were stored), the lifts are resolved
 * from the states given.
 */
export function resolveSavedSession(input: SavedSessionInput): SavedSessionResolution {
  const { session, template, equipment, strengthSets } = input;
  const prescribed = session.prescribed;

  let liftStates = [...input.liftStates];
  let variantStates = [...input.variantStates];
  let anchored = new Map<string, VariantState>();
  let seeds = new Map<string, VariantSeed>();
  if (prescribed) {
    const byId = new Map(liftStates.map((state) => [state.exerciseId, state]));
    for (const entry of prescribed) {
      const state = byId.get(entry.exerciseId) ?? emptyLiftState(entry.exerciseId);
      byId.set(entry.exerciseId, anchorToPrescription(state, entry));
    }
    liftStates = [...byId.values()];
    ({ anchored, seeds } = anchorHomePrescriptions({ ...input, liftStates }));
    const variants = new Map(variantStates.map((v) => [v.id, v]));
    for (const [id, state] of anchored) {
      for (const other of variants.values()) {
        if (other.liftId === state.liftId && other.tier === state.tier && other.id !== id) {
          variants.set(other.id, { ...other, current: false });
        }
      }
      variants.set(id, { ...state, current: true });
    }
    variantStates = [...variants.values()];
  }

  const resolved = template
    ? resolveLifts({
        template,
        liftStates,
        location: session.location,
        equipment,
        variantStates,
        overrides: overridesFromSession(session),
        ...(strengthSets ? { strengthSets } : {}),
        ...(session.startedAt ? { now: new Date(session.startedAt) } : {}),
      })
    : [];
  const lifts = prescribed
    ? resolved.map((lift): LiftResolution => {
        const seed = lift.home ? seeds.get(lift.home.variantId) : undefined;
        const seeded = seed && lift.home ? { ...lift, home: { ...lift.home, seed } } : lift;
        const stored = prescribed.find((p) => p.exerciseId === lift.liftId && p.tier === lift.tier);
        if (!stored) return seeded;
        if (!seeded.home) return { ...seeded, sets: stored.sets, reps: stored.reps };
        // A home exercise has its own scheme: the stored home one, else the variant's.
        if (stored.home?.exerciseId !== seeded.exerciseId) return seeded;
        // The weight it recorded, as lifted, not capped again by today's equipment.
        const home = { ...seeded.home };
        delete home.cappedFrom;
        return { ...seeded, weight: stored.home.weight, sets: stored.home.sets, reps: stored.home.reps, home };
      })
    : resolved;

  return { liftStates, variantStates, anchored, seeds, lifts };
}
