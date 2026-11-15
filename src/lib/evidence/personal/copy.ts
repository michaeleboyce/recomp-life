// Shared wording for "Your own numbers". Pure strings.
import type { PersonalVerdict } from "./types";

/** How a session's result is measured against what was expected, for the method text. */
export const EXPECTED_SENTENCE =
  "Each result is the reps logged against the reps expected for that session: the forecast the app made when the workout started, or for workouts without one, the trend of your earlier sessions of that lift. That way a lift getting heavier, or you getting stronger, does not pass for a difference. Any readiness adjustment is taken back out of the forecast first, and a lift's first session, with nothing to expect from, is left out.";

/** Shown before every verdict: the card never claims a cause. */
export const NOT_PROOF = "A hint from your own log, not proof";

export const VERDICT_LABELS: Record<PersonalVerdict, string> = {
  agrees: "agrees with the research",
  unclear: "no clear difference yet",
  opposite: "points the other way",
};

/**
 * A number of reps with its sign and one decimal, with a true minus sign: "−1.1",
 * "+0.3", "0.0". A value that rounds to zero has no sign.
 */
export function formatSignedReps(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0 || Object.is(rounded, -0)) return "0.0";
  const text = Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${text}` : `−${text}`;
}
