// What one finished session did to each of its program lifts. The logic lives in
// src/lib/workout/outcomes.ts, built on the outcome the progression code reports; this
// file re-exports it for the Log components.
export { describeOutcome, describeOutcomes } from "@/lib/workout/outcomes";
export type { LiftOutcome, OutcomeKind, ProgramTier } from "@/lib/workout/outcomes";
