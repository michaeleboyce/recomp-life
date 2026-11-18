"use client";

import { useMemo, useRef } from "react";

/**
 * The log-tap guard shared by every log button of the active workout (a set, a drop,
 * starting or ending drops): a tap within `ms` of the last one marked is ignored.
 */
export function useTapGuard(ms: number) {
  const lastAt = useRef(0);
  return useMemo(
    () => ({
      /** True while the last tap marked is less than `ms` ago. */
      tooSoon: () => Date.now() - lastAt.current < ms,
      /** Marks a tap now. */
      mark: () => {
        lastAt.current = Date.now();
      },
      /** Lets the next tap through (a failed save must not block the retry). */
      release: () => {
        lastAt.current = 0;
      },
    }),
    [ms]
  );
}
