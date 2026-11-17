import { useMemo, useState } from "react";
import { importedStrengthSets } from "@/lib/import/evidence";
import {
  importedE1rmPoints,
  importedLiftIndex,
  withImportedPoints,
  type ImportedLiftIndex,
} from "@/lib/import/history";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import type { RangeKey } from "@/lib/metrics/types";
import type { StrengthSet } from "@/lib/strength";
import { useImportedSessions } from "./useImportedSessions";
import { useMappingOverrides } from "./useMappingOverrides";
import { useMetricSource, type MetricResult } from "./useMetric";

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

/**
 * One lift's estimated 1RM (the "e1rm" metric) with the estimates of its imported
 * sessions added, marked imported, limited to `range` (default "all"). What Today's
 * lift cards show. `undefined` while loading.
 */
export function useLiftE1RM(exerciseId: string, range: RangeKey = "all"): MetricResult | undefined {
  const source = useMetricSource();
  const index = useImportedLiftIndex();
  // Taken once per mount, so the range window does not slide on every render.
  const [now] = useState(() => Date.now());
  const full = useMemo(
    () =>
      source && index
        ? withImportedPoints(computeMetric("e1rm", source, { exerciseId }), importedE1rmPoints(index.get(exerciseId) ?? []))
        : undefined,
    [source, index, exerciseId]
  );
  return useMemo(() => {
    if (!full) return undefined;
    const series = inRange(full, range, now);
    return { full, series, summary: summarize(series) };
  }, [full, range, now]);
}
