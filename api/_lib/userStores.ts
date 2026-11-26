/* Where the user document is kept: Vercel Blob in production, a
   git-ignored file in local development. Both hold the same
   encrypted text, so a dev file is as unreadable as the real one. */

import fs from "node:fs";
import { BlobNotFoundError, BlobPreconditionFailedError, copy, del, list, put } from "@vercel/blob";
import {
  ConflictError,
  EMPTY_DOC,
  decryptDoc,
  encryptDoc,
  storePathname,
  type StoreAdapter,
  type UserDoc,
} from "./userAuth.js";
import { EMPTY_HISTORY, historyPathname, openHistory, sealHistory, type HistoryStore } from "./history.js";

// ── Versioned documents on public Blob ────────────────────────
//
// A public blob is served through the CDN, and `get(..., { useCache: false })`
// bypasses that cache only for private blobs. The CDN also ignores the query
// string, and a blob written without `cacheControlMaxAge` is cached for a
// month. Overwriting one pathname therefore kept serving the copy from before
// the last write, with that copy's ETag, and every guarded write after it was
// refused ("עדכון המשתמשים נכשל").
//
// So nothing is overwritten. Each write is a new pathname, <base>/v<n>.json,
// created only if it does not exist yet: two writers racing for the same n
// cannot both win, which is the compare-and-swap the ETag used to give. The
// latest n comes from list(), an API call the CDN does not cache, and its URL
// was never fetched before it was written, so what the CDN holds for it is the
// current content. The last few versions are kept; older ones go.

const KEEP_VERSIONS = 3;

export const versionPath = (base: string, n: number) => `${base}/v${String(n).padStart(10, "0")}.json`;

const versionOf = (pathname: string) => {
  const match = pathname.match(/\/v(\d{10})\.json$/);
  return match ? Number(match[1]) : 0;
};

const isTaken = (err: unknown) =>
  err instanceof BlobPreconditionFailedError ||
  /already exists|precondition/i.test(String((err as Error)?.message || ""));

async function versions(base: string): Promise<{ n: number; url: string }[]> {
  const found: { n: number; url: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${base}/v`, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const n = versionOf(blob.pathname);
      if (n) found.push({ n, url: blob.url });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found.sort((a, b) => b.n - a.n);
}

/** The document written before versions existed becomes version 1. */
async function adoptLegacy(base: string, legacy: string): Promise<{ n: number; url: string } | null> {
  try {
    // copy() works on storage, not through the CDN, so it carries the current bytes.
    const made = await copy(legacy, versionPath(base, 1), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { n: 1, url: made.url };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    if (isTaken(err)) return (await versions(base))[0] || null;
    throw err;
  }
}

export function versionedDoc(base: string, legacy?: string) {
  return {
    /** The latest text and its version, or null text and version 0. */
    async read(): Promise<{ text: string | null; version: number }> {
      for (let attempt = 0; attempt < 3; attempt++) {
        let latest: { n: number; url: string } | null = (await versions(base))[0] || null;
        if (!latest && legacy) latest = await adoptLegacy(base, legacy);
        if (!latest) return { text: null, version: 0 };
        const res = await fetch(latest.url);
        // Pruned between the listing and the fetch: list again.
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`blob read failed: ${res.status}`);
        return { text: await res.text(), version: latest.n };
      }
      throw new ConflictError();
    },

    /** Writes the version after `version`; ConflictError if someone else did first. */
    async write(text: string, version: number): Promise<void> {
      try {
        await put(versionPath(base, version + 1), text, {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: false,
        });
      } catch (err) {
        if (isTaken(err)) throw new ConflictError();
        throw err;
      }
      // Best effort: a failed cleanup leaves an extra file, nothing worse.
      try {
        const old = (await versions(base)).filter(v => v.n <= version + 1 - KEEP_VERSIONS);
        if (old.length) await del(old.map(v => v.url));
      } catch (err) {
        console.warn("[blob] cleanup failed", err);
      }
    },
  };
}

const versionBase = (pathname: string) => pathname.replace(/\.json$/, "");

export function blobStore(secret: string): StoreAdapter {
  const pathname = storePathname(secret);
  const doc = versionedDoc(versionBase(pathname), pathname);
  return {
    async read() {
      const { text, version } = await doc.read();
      if (text === null) return { doc: EMPTY_DOC, etag: null };
      return { doc: decryptDoc(text, secret), etag: String(version) };
    },
    async write(next: UserDoc, etag: string | null) {
      await doc.write(encryptDoc(next, secret), Number(etag || 0));
    },
  };
}

export function fileStore(filePath: string, secret: string): StoreAdapter {
  return {
    async read() {
      if (!fs.existsSync(filePath)) return { doc: EMPTY_DOC, etag: null };
      const text = fs.readFileSync(filePath, "utf8");
      return { doc: decryptDoc(text, secret), etag: String(fs.statSync(filePath).mtimeMs) };
    },
    async write(doc: UserDoc, etag: string | null) {
      const current = fs.existsSync(filePath) ? String(fs.statSync(filePath).mtimeMs) : null;
      if (current !== etag) throw new ConflictError();
      fs.writeFileSync(filePath, encryptDoc(doc, secret), "utf8");
    },
  };
}

// ── Practice history: one document per user ───────────────────

export function blobHistoryStore(secret: string): HistoryStore {
  const docFor = (userId: string) => {
    const pathname = historyPathname(secret, userId);
    return versionedDoc(versionBase(pathname), pathname);
  };
  return {
    async read(userId) {
      const { text, version } = await docFor(userId).read();
      if (text === null) return { doc: EMPTY_HISTORY, etag: null };
      return { doc: openHistory(text, secret), etag: String(version) };
    },
    async write(userId, doc, etag) {
      await docFor(userId).write(sealHistory(doc, secret), Number(etag || 0));
    },
  };
}

export function fileHistoryStore(dir: string, secret: string): HistoryStore {
  const fileFor = (userId: string) => `${dir}/${historyPathname(secret, userId).replace("history/", "")}`;
  return {
    async read(userId) {
      const f = fileFor(userId);
      if (!fs.existsSync(f)) return { doc: EMPTY_HISTORY, etag: null };
      return { doc: openHistory(fs.readFileSync(f, "utf8"), secret), etag: String(fs.statSync(f).mtimeMs) };
    },
    async write(userId, doc, etag) {
      const f = fileFor(userId);
      const current = fs.existsSync(f) ? String(fs.statSync(f).mtimeMs) : null;
      if (current !== etag) throw new ConflictError();
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(f, sealHistory(doc, secret), "utf8");
    },
  };
}
