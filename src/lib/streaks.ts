/**
 * Calculate the number of consecutive weeks (Mon-Sun) with 3+ completed workouts.
 * Current week counts even if incomplete. Counts backwards from current week.
 */
export function calculateConsistencyStreak(
  workoutDates: Date[],
  now: Date
): number {
  if (workoutDates.length === 0) return 0;

  // Group by ISO week
  const weekCounts = new Map<string, number>();

  for (const date of workoutDates) {
    const weekKey = getISOWeekKey(date);
    weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
  }

  // Count consecutive weeks with 3+ workouts, starting from current week
  let streak = 0;
  const checkDate = new Date(now);

  // Start from current week's Monday (using UTC to avoid timezone issues)
  const day = checkDate.getUTCDay();
  const diff = checkDate.getUTCDate() - day + (day === 0 ? -6 : 1);
  checkDate.setUTCDate(diff);
  checkDate.setUTCHours(0, 0, 0, 0);

  while (true) {
    const weekKey = getISOWeekKey(checkDate);
    const count = weekCounts.get(weekKey) ?? 0;

    if (count >= 3) {
      streak++;
      // Move to previous week
      checkDate.setUTCDate(checkDate.getUTCDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  // Get Monday of this week
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
