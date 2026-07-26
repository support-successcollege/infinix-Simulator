/* ============================================================
   Versioned, quota-safe, per-user localStorage

   The previous code called `setItem` in five places with no
   try/catch. In Safari private mode that throws; one of those calls
   sits inside a useEffect, so it surfaced as an unhandled error.
   It also shared one global key per concern, which is why `login()`
   had to wipe session history — there was no way to tell two users
   on the same machine apart.
   ============================================================ */

const PREFIX = "infx";

export type WriteResult = "ok" | "quota" | "unavailable";

interface VersionedBlob {
  v: number;
  data: unknown;
}

export interface ReadOptions<T> {
  currentVersion: number;
  /** Keyed by the version being migrated *from*. Applied in ascending order. */
  migrations?: Record<number, (data: unknown) => unknown>;
  /** Return null to reject the blob; it will be quarantined, not thrown away silently. */
  validate: (data: unknown) => T | null;
}

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    // Safari private mode exposes localStorage but throws on write.
    const probe = `${PREFIX}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Namespaced key builder. Global (non-user) data uses `globalKey`. */
export function createUserScope(userId: string) {
  const safeId = encodeURIComponent(userId);
  return {
    key(name: string): string {
      return `${PREFIX}.v1.${name}.${safeId}`;
    },
  };
}

export function globalKey(name: string): string {
  return `${PREFIX}.v1.${name}`;
}

/**
 * Move an unreadable blob aside rather than deleting it. If a migration
 * is wrong we want the original still recoverable from DevTools.
 */
function quarantine(store: Storage, key: string, raw: string): void {
  try {
    store.setItem(`${PREFIX}.v1.quarantine.${key}.${Date.now()}`, raw);
  } catch {
    /* Quarantine is best-effort — never let it break the read path. */
  }
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readVersioned<T>(key: string, opts: ReadOptions<T>): T | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let blob: VersionedBlob;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.v !== "number") {
      quarantine(store, key, raw);
      return null;
    }
    blob = parsed as VersionedBlob;
  } catch {
    quarantine(store, key, raw);
    return null;
  }

  // A blob written by a newer build of the app. Do not guess at it.
  if (blob.v > opts.currentVersion) {
    quarantine(store, key, raw);
    return null;
  }

  let data = blob.data;
  for (let v = blob.v; v < opts.currentVersion; v += 1) {
    const migrate = opts.migrations?.[v];
    if (!migrate) {
      quarantine(store, key, raw);
      return null;
    }
    try {
      data = migrate(data);
    } catch {
      quarantine(store, key, raw);
      return null;
    }
  }

  const validated = opts.validate(data);
  if (validated === null) {
    quarantine(store, key, raw);
    return null;
  }
  return validated;
}

export function writeVersioned(key: string, version: number, data: unknown): WriteResult {
  const store = storage();
  if (!store) return "unavailable";
  try {
    store.setItem(key, JSON.stringify({ v: version, data } satisfies VersionedBlob));
    return "ok";
  } catch (err) {
    return isQuotaError(err) ? "quota" : "unavailable";
  }
}

export function removeKey(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Names differ across browsers; the numeric codes are the reliable signal.
  const code = (err as unknown as { code?: number }).code;
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

/** Rough byte size of everything this app has stored. Used for the health banner. */
export function approximateUsageBytes(): number {
  const store = storage();
  if (!store) return 0;
  let total = 0;
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || !key.startsWith(`${PREFIX}.`)) continue;
      total += key.length + (store.getItem(key)?.length ?? 0);
    }
  } catch {
    return total;
  }
  return total * 2; // UTF-16 code units
}

export function isStorageAvailable(): boolean {
  return storage() !== null;
}
