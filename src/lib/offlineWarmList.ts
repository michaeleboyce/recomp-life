import { EXERCISES } from "./exercises";
import { EXERCISE_MEDIA_IDS, getExerciseMedia } from "./exerciseMedia";

/**
 * URLs the service worker fetches ahead of time so the anatomy views and
 * exercise pages work on the first offline visit, not only after each has
 * been opened once online.
 */
export function getOfflineWarmList(): string[] {
  const urls = new Set<string>([
    "/models/anatomy.glb",
    "/draco/draco_wasm_wrapper.js",
    "/draco/draco_decoder.wasm",
    "/draco/draco_decoder.js",
    "/muscles",
    "/exercises",
  ]);
  for (const id of Object.keys(EXERCISES)) urls.add(`/exercises/${id}`);
  for (const id of EXERCISE_MEDIA_IDS) {
    for (const frame of getExerciseMedia(id)?.frames ?? []) urls.add(frame);
  }
  return [...urls];
}
