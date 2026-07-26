/* ============================================================
   useQuestionTimer

   Two bugs this replaces:

   1. The old timer called `submitAnswer(-1, …)` from *inside* a
      `setTimeLeft` updater. Updaters must be pure; React 19 StrictMode
      invokes them twice, so the timeout answer could be recorded
      twice. It also raced the `selectedIndex` value captured in the
      effect's dependency array.

   2. It decremented a counter once per interval tick. Mobile browsers
      throttle background intervals heavily, so the displayed time
      drifted from real time — tolerable for a 60-second question,
      a correctness bug for a two-hour mock exam.

   Remaining time is now derived from a wall-clock deadline, and expiry
   is reported through an effect that fires at most once per deadline.
   ============================================================ */

import { useEffect, useRef, useState } from "react";

export interface QuestionTimer {
  /** Whole seconds remaining, floored at 0. */
  secondsLeft: number;
  /** Fraction 0–1 of the limit still available; 1 when untimed. */
  fraction: number;
  expired: boolean;
}

export interface UseQuestionTimerOptions {
  /** Seconds allowed. 0 or less means untimed. */
  limitSeconds: number;
  /** Restarts the clock whenever this changes (e.g. the question index). */
  resetKey: string | number;
  /** Pauses the countdown, e.g. while feedback is showing. */
  paused: boolean;
  /** Called once per deadline, never during a state update. */
  onExpire: () => void;
}

export function useQuestionTimer({
  limitSeconds,
  resetKey,
  paused,
  onExpire,
}: UseQuestionTimerOptions): QuestionTimer {
  const untimed = limitSeconds <= 0;
  const [deadline, setDeadline] = useState<number>(() => Date.now() + limitSeconds * 1000);
  const [now, setNow] = useState<number>(() => Date.now());

  // Held in a ref so changing the callback does not restart the clock.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    const next = Date.now() + limitSeconds * 1000;
    setDeadline(next);
    setNow(Date.now());
    firedFor.current = null;
  }, [resetKey, limitSeconds]);

  useEffect(() => {
    if (untimed || paused) return;
    // 250ms so the displayed second changes promptly after a tab regains focus.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [untimed, paused, deadline]);

  const remainingMs = untimed ? Number.POSITIVE_INFINITY : Math.max(0, deadline - now);
  const expired = !untimed && remainingMs <= 0;

  useEffect(() => {
    if (!expired || paused) return;
    if (firedFor.current === deadline) return;
    firedFor.current = deadline;
    onExpireRef.current();
  }, [expired, paused, deadline]);

  return {
    secondsLeft: untimed ? 0 : Math.ceil(remainingMs / 1000),
    fraction: untimed ? 1 : Math.max(0, Math.min(1, remainingMs / (limitSeconds * 1000))),
    expired,
  };
}
