import { EXERCISES } from "@/lib/exercises";

// What a back arrow calls the screen it returns to. Names match each screen's
// heading or its tab; a screen not listed here is just "Back".

const NAMES: Record<string, string> = {
  "/": "Today",
  "/log": "Log",
  "/log/workout": "Workout",
  "/progress": "Progress",
  "/progress/body": "Bodyweight",
  "/progress/forecasts": "Forecasts",
  "/progress/forecasts/record": "Track record",
  "/progress/review": "Weekly review",
  "/progress/upcoming": "Coming up",
  "/more": "More",
  "/more/adjustments": "Adjustment log",
  "/more/deleted": "Recently deleted",
  "/more/glossary": "Glossary",
  "/more/how-it-works": "How it works",
  "/settings": "Settings",
  "/settings/health": "Apple Health",
  "/plate-calculator": "Plates",
  "/1rm-calculator": "Calculator",
  "/exercises": "Exercises",
  "/muscles": "Muscles",
  "/weigh-in": "Log weight",
  "/activity": "Log activity",
  "/run": "Run",
  "/body-check": "Body check",
  "/readiness": "Readiness",
  "/research": "Research",
  "/favorites": "Favourites",
  "/workout/configure": "Ready",
  "/workout/active": "Workout",
  "/workout/summary": "Summary",
};

function exerciseName(id: string | undefined): string | null {
  return id && Object.hasOwn(EXERCISES, id) ? EXERCISES[id].name : null;
}

/** The name of the screen at `url` (path, query and hash), or null when it has none. */
export function screenName(url: string): string | null {
  const path = url.split(/[?#]/, 1)[0].replace(/(.)\/+$/, "$1") || "/";
  if (Object.hasOwn(NAMES, path)) return NAMES[path];

  const lift = /^\/progress\/lift\/([^/]+)(\/projection)?$/.exec(path);
  if (lift) return lift[2] ? "Projection" : exerciseName(lift[1]) ?? "Lift";

  const exercise = /^\/exercises\/([^/]+)$/.exec(path);
  if (exercise) return exerciseName(exercise[1]) ?? "Exercise";

  return null;
}
