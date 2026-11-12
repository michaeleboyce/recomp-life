import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import type { UserProfile, UserSettings } from "@/types";

/** The single user profile; `null` once loaded if none exists. */
export function useProfile(): UserProfile | null | undefined {
  return useLiveQuery(async () => (await db.userProfile.toCollection().first()) ?? null, []);
}

/** The profile's settings; `null` once loaded if there is no profile. */
export function useSettings(): UserSettings | null | undefined {
  const profile = useProfile();
  if (profile === undefined) return undefined;
  return profile?.settings ?? null;
}
