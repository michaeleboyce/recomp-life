import { useMemo } from "react";
import { importedStrengthSets } from "@/lib/import/evidence";
import { importedLiftIndex, type ImportedLiftIndex } from "@/lib/import/history";
import type { StrengthSet } from "@/lib/strength";
import { useImportedSessions } from "./useImportedSessions";
import { useMappingOverrides } from "./useMappingOverrides";

/**
 * The imported sessions' sets as strength evidence (`importedStrengthSets`), names
 * mapped as of now (the remembered choices win), each marked `imported`. The same array
 * while nothing it reads changes. `undefined` while loading.
 */
export function useImportedStrengthSets(): StrengthSet[] | undefined {
  const imported = useImportedSessions();
  const overrides = useMappingOverrides();
  return useMemo(
    () => (imported === undefined ? undefined : importedStrengthSets(imported, overrides)),
    [imported, overrides]
  );
}

/**
 * Imported sessions as lift history, per exercise (`importedLiftIndex`): what the lift
 * page, the projection, the Strength tab and Today's cards show beside the app's own
 * log, marked "Imported". Worked out once per change. `undefined` while loading.
 */
export function useImportedLiftIndex(): ImportedLiftIndex | undefined {
  const sets = useImportedStrengthSets();
  return useMemo(() => (sets === undefined ? undefined : importedLiftIndex(sets)), [sets]);
}
