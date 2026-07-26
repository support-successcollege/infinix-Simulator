/* ============================================================
   Learner statistics — derived, never stored

   Every number shown to a learner is computed from recorded answers.
   The previous `User` type carried `totalSessions`, `avgScore` and
   `weeklyProgress` as fields, hardcoded to 23 / 78 / 3 at login and
   never updated. A number that can be derived should not be a field;
   storing it is what made fabricating it possible.
   ============================================================ */

/**
 * Sunday 00:00 in Israel, which is where the working week starts.
 * Computed in the browser's zone; for an Israel-based audience the
 * two coincide, and a wrong week boundary here only shifts a progress
 * ring, never a score.
 */
export function startOfWeekIsrael(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  return d;
}

export function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Consecutive days ending today (or yesterday — a streak survives until
 * the day is over) on which at least one session was completed.
 */
export function currentStreakDays(sessionStartTimes: number[], now: Date): number {
  if (sessionStartTimes.length === 0) return 0;

  const days = new Set(sessionStartTimes.map(t => startOfDay(new Date(t)).getTime()));
  const today = startOfDay(now).getTime();

  let cursor = days.has(today) ? today : today - DAY_MS;
  if (!days.has(cursor)) return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}
