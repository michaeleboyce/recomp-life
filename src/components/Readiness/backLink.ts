import { backTarget, type BackTarget } from "@/components/nav/backTarget";

/** The Ready screen links to readiness as `?from=ready`; other start points are in backTarget. */
const READY: BackTarget = { href: "/workout/configure", label: "Ready" };

/** Where the readiness screen's back link goes: the page the user came from, else Today. */
export function readinessBackTarget(from: string | null | undefined): BackTarget {
  return from === "ready" ? READY : backTarget(from);
}
