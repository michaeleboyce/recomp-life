// Personal records of one session, judged against earlier sessions only. Pure.
import type { Estimated1RM } from "@/types";

export interface SessionPR {
  exerciseId: string;
  /** The session's best estimated 1RM for the lift. */
  best: number;
  /** The best estimate from sessions before this one. */
  previousBest: number;
}

const time = (row: Estimated1RM) => {
  const ms = new Date(row.date).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Lifts whose best estimated 1RM in `sessionId` beats every estimate from earlier
 * sessions. "Earlier" means another session's row dated before this session's first
 * row; the session's own rows and later sessions never count. A lift with no earlier
 * estimate has nothing to beat, so its first estimate is not a PR.
 */
export function sessionPRs(sessionId: string, e1rms: Estimated1RM[]): SessionPR[] {
  const own = e1rms.filter((r) => r.workoutSessionId === sessionId);
  if (own.length === 0) return [];
  const start = Math.min(...own.map(time));

  const bestOwn = new Map<string, number>();
  for (const row of own) {
    bestOwn.set(row.exerciseId, Math.max(bestOwn.get(row.exerciseId) ?? -Infinity, row.estimated1RM));
  }

  const prs: SessionPR[] = [];
  for (const [exerciseId, best] of bestOwn) {
    const earlier = e1rms.filter(
      (r) => r.exerciseId === exerciseId && r.workoutSessionId !== sessionId && time(r) < start
    );
    if (earlier.length === 0) continue;
    const previousBest = Math.max(...earlier.map((r) => r.estimated1RM));
    if (best > previousBest) prs.push({ exerciseId, best, previousBest });
  }
  return prs.sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1));
}
