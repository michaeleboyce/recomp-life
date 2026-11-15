"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  canGoBackInApp,
  getNavStack,
  installNavHistory,
  previousUrl,
  subscribeNavStack,
  syncNavHistory,
  type NavStack,
} from "./navHistory";
import { screenName } from "./screenNames";

const serverSnapshot = (): NavStack | null => null;

/** Records in-app navigation for the back arrows. AppChrome calls it once. */
export function useNavHistory(): void {
  const pathname = usePathname();
  useEffect(() => {
    installNavHistory();
  }, []);
  useEffect(() => {
    syncNavHistory();
  }, [pathname]);
}

export interface PreviousScreen {
  url: string;
  /** The screen's name, or null when it has none ("Back" is shown). */
  name: string | null;
}

/** The in-app screen before this one, or null when there is none to go back to. */
export function usePreviousScreen(): PreviousScreen | null {
  const stack = useSyncExternalStore(subscribeNavStack, getNavStack, serverSnapshot);
  const url = previousUrl(stack);
  return url === null ? null : { url, name: screenName(url) };
}

/**
 * Go back the way a back arrow does: to the previous in-app screen when there is
 * one (the router's back), otherwise to `fallback`. For saves that leave the page.
 */
export function useGoBack(fallback: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBackInApp()) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
