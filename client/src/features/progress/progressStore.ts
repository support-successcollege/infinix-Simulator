/* ============================================================
   Progress persistence

   Progress used to live in React state only, and `login()` called
   `setSessions([])` on every sign-in. That wipe existed because there
   was no way to tell two users on one machine apart — a shared college
   machine would have mixed their histories. Scoping storage per user
   fixes the cause, so history can survive a refresh.
   ============================================================ */

import { createUserScope, removeKey, readVersioned, writeVersioned } from "@/lib/storage";
import { accumulate, emptyLifetime, type LifetimeTotals, type SessionRecord } from "./types";

const VERSION = 1;

/** Keeps localStorage bounded. LifetimeTotals still covers everything older. */
export const MAX_STORED_SESSIONS = 200;

export interface ProgressSnapshot {
  sessions: SessionRecord[];
  lifetime: LifetimeTotals;
  /** True when a write failed and progress is no longer being saved. */
  degraded: boolean;
}

function keys(userId: string) {
  const scope = createUserScope(userId);
  return { sessions: scope.key("sessions"), lifetime: scope.key("lifetime") };
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SessionRecord>;
  return (
    typeof s.id === "string" &&
    typeof s.subjectId === "string" &&
    typeof s.scorePct === "number" &&
    Array.isArray(s.answers)
  );
}

export function loadProgress(userId: string): ProgressSnapshot {
  const k = keys(userId);

  const sessions =
    readVersioned<SessionRecord[]>(k.sessions, {
      currentVersion: VERSION,
      validate: data => (Array.isArray(data) ? data.filter(isSessionRecord) : null),
    }) ?? [];

  const lifetime =
    readVersioned<LifetimeTotals>(k.lifetime, {
      currentVersion: VERSION,
      validate: data => {
        if (!data || typeof data !== "object") return null;
        const l = data as Partial<LifetimeTotals>;
        if (typeof l.sessions !== "number" || typeof l.answered !== "number") return null;
        return { ...emptyLifetime(), ...l } as LifetimeTotals;
      },
    }) ?? emptyLifetime();

  return { sessions, lifetime, degraded: false };
}

/**
 * Append a session. On quota exhaustion, drop the oldest quarter and retry
 * once; if it still fails, report degraded so the UI can say so rather than
 * losing the learner's work silently.
 */
export function persistSession(
  userId: string,
  previous: ProgressSnapshot,
  session: SessionRecord
): ProgressSnapshot {
  const k = keys(userId);
  const lifetime = accumulate(previous.lifetime, session);
  let sessions = [session, ...previous.sessions].slice(0, MAX_STORED_SESSIONS);

  // Lifetime totals are small and must never be lost — write them first.
  writeVersioned(k.lifetime, VERSION, lifetime);

  let result = writeVersioned(k.sessions, VERSION, sessions);
  if (result === "quota") {
    sessions = sessions.slice(0, Math.max(1, Math.floor(sessions.length * 0.75)));
    result = writeVersioned(k.sessions, VERSION, sessions);
  }

  return { sessions, lifetime, degraded: result !== "ok" };
}

export function clearProgress(userId: string): ProgressSnapshot {
  const k = keys(userId);
  removeKey(k.sessions);
  removeKey(k.lifetime);
  return { sessions: [], lifetime: emptyLifetime(), degraded: false };
}
