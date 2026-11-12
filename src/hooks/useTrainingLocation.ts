import { useCallback } from "react";
import { updateSettings } from "@/lib/data/records";
import type { WorkoutLocation } from "@/types";
import { useSettings } from "./useProfile";

/**
 * Where the user trains by default (`settings.defaultLocation`, else "gym") and a
 * setter that saves it. Meant as the one source of truth for "which location am I
 * in": Today, Configure, Upcoming and More should all read and write this.
 */
export function useTrainingLocation(): {
  location: WorkoutLocation;
  setLocation: (next: WorkoutLocation) => Promise<void>;
  isLoading: boolean;
} {
  const settings = useSettings();
  const setLocation = useCallback(
    (next: WorkoutLocation) => updateSettings({ defaultLocation: next }),
    []
  );
  return {
    location: settings?.defaultLocation ?? "gym",
    setLocation,
    isLoading: settings === undefined,
  };
}
