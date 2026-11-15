// Plain names for the screens that show a rule. The registry lists the component files;
// the rule page shows where in the app a person would see it.

/** Longest matching prefix wins. */
const SURFACE_NAMES: ReadonlyArray<readonly [prefix: string, name: string]> = [
  ["src/components/Today/", "Today"],
  ["src/components/ActiveWorkout/RestTimer", "Rest timer during a workout"],
  ["src/components/ActiveWorkout/", "During a workout"],
  ["src/app/workout/active", "During a workout"],
  ["src/app/workout/configure", "Setting up a workout"],
  ["src/components/PreWorkout/", "Before a workout"],
  ["src/components/Log/", "Workout history"],
  ["src/components/Lift/", "A lift's page"],
  ["src/components/Projection/", "Strength projection"],
  ["src/components/Progress/body", "Body progress"],
  ["src/components/Progress/BodyTab", "Body progress"],
  ["src/components/Progress/MusclesTab", "Muscles"],
  ["src/components/Progress/", "Progress"],
  ["src/app/progress/upcoming", "Coming up"],
  ["src/app/1rm-calculator", "1RM calculator"],
];

/** Distinct screen names for a rule's surface files, in the order first met. */
export function getRuleSurfaces(files: readonly string[]): string[] {
  const names: string[] = [];
  for (const file of files) {
    const hit = SURFACE_NAMES.find(([prefix]) => file.startsWith(prefix));
    const name = hit ? hit[1] : "Elsewhere in the app";
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
