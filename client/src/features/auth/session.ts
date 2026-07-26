/* ============================================================
   Signed-in session persistence

   The logged-in user lived in React state only, so every refresh
   dropped the user back to the login screen — mid-quiz included.
   Only the identity is stored, never the password.
   ============================================================ */

import { globalKey, readVersioned, removeKey, writeVersioned } from "@/lib/storage";

const SESSION_KEY = globalKey("session");
const VERSION = 1;

export interface StoredSession {
  userId: string;
  /** Re-checked against the account list on load, so a deleted user cannot resume. */
  email: string;
  /** When this account first signed in, so "joined" is stable across refreshes. */
  joinedAt: number;
}

export function readSession(): StoredSession | null {
  return readVersioned<StoredSession>(SESSION_KEY, {
    currentVersion: VERSION,
    validate: data => {
      if (!data || typeof data !== "object") return null;
      const s = data as Partial<StoredSession>;
      if (typeof s.userId !== "string" || typeof s.email !== "string") return null;
      return {
        userId: s.userId,
        email: s.email,
        joinedAt: typeof s.joinedAt === "number" ? s.joinedAt : Date.now(),
      };
    },
  });
}

export function writeSession(session: StoredSession): void {
  writeVersioned(SESSION_KEY, VERSION, session);
}

export function clearSession(): void {
  removeKey(SESSION_KEY);
}
