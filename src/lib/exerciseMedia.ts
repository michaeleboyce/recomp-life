import raw from "./exerciseMedia.generated.json";

export interface ExerciseMedia {
  sourceId: string;
  sourceName: string;
  /** [start position, end position] image paths, served from /public. */
  frames: [string, string];
  instructions: string[];
}

const MEDIA = raw as unknown as Record<string, ExerciseMedia>;

/** Reference photos + how-to steps for an exercise, or null when none exist. */
export function getExerciseMedia(exerciseId: string): ExerciseMedia | null {
  return Object.prototype.hasOwnProperty.call(MEDIA, exerciseId)
    ? MEDIA[exerciseId]
    : null;
}

export function hasExercisePhotos(exerciseId: string): boolean {
  return getExerciseMedia(exerciseId) !== null;
}

export const EXERCISE_MEDIA_IDS: string[] = Object.keys(MEDIA);
