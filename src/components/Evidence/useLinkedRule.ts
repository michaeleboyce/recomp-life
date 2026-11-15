"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { isRuleId, type RuleId } from "@/lib/evidence";

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * The rule a link points at: `/research?rule=<id>` or the older `/research#<id>`.
 * The query wins when both are present. Null when neither names a known rule.
 * Reading the query needs a Suspense boundary above the caller.
 */
export function useLinkedRuleId(): RuleId | null {
  const params = useSearchParams();
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => ""
  );
  const fromQuery = params.get("rule");
  if (fromQuery && isRuleId(fromQuery)) return fromQuery;
  let fromHash = hash.replace(/^#/, "");
  try {
    fromHash = decodeURIComponent(fromHash);
  } catch {
    // A malformed escape is not a rule id.
  }
  return isRuleId(fromHash) ? fromHash : null;
}

/** The full link to one rule, for sharing. */
export function ruleLink(origin: string, ruleId: RuleId): string {
  return `${origin}/research?rule=${encodeURIComponent(ruleId)}`;
}
