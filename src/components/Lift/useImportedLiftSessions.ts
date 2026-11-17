"use client";

import { useMemo } from "react";
import { useImportedSessions } from "@/hooks/useImportedSessions";
import { useMappingOverrides } from "@/hooks/useMappingOverrides";
import { importedLiftSessions, type ImportedLiftSession } from "./sessions";

/**
 * The imported sessions with sets that count as one of `exerciseIds` (the first is the
 * list's own exercise), as session-list rows, names mapped as of now. Undefined while
 * loading.
 */
export function useImportedLiftSessions(exerciseIds: readonly string[]): ImportedLiftSession[] | undefined {
  const sessions = useImportedSessions();
  const overrides = useMappingOverrides();
  // The ids by value, so a caller may pass a new array on every render.
  const key = exerciseIds.join(",");
  return useMemo(
    () => (sessions === undefined ? undefined : importedLiftSessions(sessions, key.split(","), overrides)),
    [sessions, overrides, key]
  );
}
