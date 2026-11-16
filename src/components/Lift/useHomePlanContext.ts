"use client";

import { useMemo } from "react";
import { useLiftStates, useNextWorkout, useSettings, useStrengthSets, useVariantStates } from "@/hooks";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { HomePlanContext } from "./homeVersion";

/**
 * What a home exercise's next session is planned from: the next workout at home as
 * Today plans it, and the stored states and strength sets it was built from.
 * Undefined while loading.
 */
export function useHomePlanContext(): HomePlanContext | undefined {
  const next = useNextWorkout("home");
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const strengthSets = useStrengthSets();
  const settings = useSettings();

  return useMemo(() => {
    if (!next || !liftStates || !variantStates || !strengthSets || settings === undefined) return undefined;
    const equipment = (settings ?? DEFAULT_USER_PROFILE.settings).equipment;
    return { next, liftStates, variantStates, strengthSets, equipment };
  }, [next, liftStates, variantStates, strengthSets, settings]);
}
