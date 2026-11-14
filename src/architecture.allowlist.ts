// Files that still break an architecture rule (see architecture.test.ts).
// One entry per line. Remove a line when its file is migrated; never add one for a
// new file without saying why in a comment beside it.

/** Rule R8: pages and components must not import the Dexie database directly. */
export const DB_IMPORT_ALLOWLIST: string[] = [
  "src/app/exercises/page.tsx",
  "src/components/Charts/E1RMChart.tsx",
  // Added by the interactive-anatomy branch; migrate to src/hooks once that work has landed.
  "src/components/Dashboard/MuscleHeatCard.tsx",
];

/** Rule R9: pages and components must use theme tokens, not raw palette classes. */
export const PALETTE_ALLOWLIST: string[] = [
  "src/components/Exercises/ExerciseRow.tsx",
];

/**
 * Directories exempt from the palette rule for good: anatomical figures need
 * colours that are not part of the app theme.
 */
export const PALETTE_EXEMPT_PREFIXES: string[] = [
  "src/components/Anatomy/",
  "src/components/BodyMap/BodyMapSVG.tsx",
];
