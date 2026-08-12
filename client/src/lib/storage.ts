/* ============================================================
   storage.ts — localStorage helpers that never throw

   localStorage blows up in more situations than people expect:
   Safari private mode, disabled cookies, quota exhaustion, and
   corrupt JSON left behind by an older build. Every call site in
   the app goes through here so a storage failure degrades to
   "this session isn't remembered" instead of a white screen.
   ============================================================ */

export const STORAGE_KEYS = {
  /** A bank imported into this browser only — a local override. */
  questionBank: "ic_question_bank_v1",
  /**
   * The manager's publish token. This is a convenience so it isn't
   * retyped on every upload; it is not a credential the app checks.
   * The real check happens on the server (see api/question-bank.ts),
   * so a copy sitting here grants nothing that the person holding
   * this browser didn't already have.
   */
  adminToken: "ic_admin_upload_token_v1",
  authUsers: "ic_auth_users_v2",
  legacyAuthUsers: "ic_auth_users_v1",
  session: "ic_active_session_v1",
  history: "ic_session_history_v1",
  trainingConfig: "ic_training_config_v1",
} as const;

function getStore(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    // Touch the API — Safari private mode throws only on write.
    const probe = "__ic_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const store = getStore();
    if (!store) return fallback;
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[storage] failed to read "${key}"`, err);
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    const store = getStore();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[storage] failed to write "${key}"`, err);
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    getStore()?.removeItem(key);
  } catch (err) {
    console.warn(`[storage] failed to remove "${key}"`, err);
  }
}

export function isStorageAvailable(): boolean {
  return getStore() !== null;
}
