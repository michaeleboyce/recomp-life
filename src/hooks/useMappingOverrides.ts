import { useSyncExternalStore } from "react";
import type { MappingOverrides } from "@/lib/import/mapping/types";
import { MAPPINGS_CHANGED_EVENT, mappingOverridesSnapshot } from "@/lib/import/remembered";

const NONE: MappingOverrides = {};

function subscribe(onChange: () => void): () => void {
  window.addEventListener(MAPPINGS_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MAPPINGS_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The exercise-name choices remembered on this device (the import screen's), live: a
 * name remapped there changes the imported evidence everywhere it is read.
 */
export function useMappingOverrides(): MappingOverrides {
  return useSyncExternalStore(subscribe, () => mappingOverridesSnapshot(), () => NONE);
}
