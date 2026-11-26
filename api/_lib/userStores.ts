/* Where the user document is kept: Vercel Blob in production, a
   git-ignored file in local development. Both hold the same
   encrypted text, so a dev file is as unreadable as the real one. */

import fs from "node:fs";
import { BlobNotFoundError, BlobPreconditionFailedError, head, put } from "@vercel/blob";
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

// ── Reading a public blob as it is now ────────────────────────
//
// A public blob is served through the CDN, and `get(..., { useCache: false })`
// only bypasses that cache for private blobs. Reading through it handed back a
// copy from before the last write, with that copy's ETag, so every guarded
// write that followed was refused as a conflict ("עדכון המשתמשים נכשל").
// `head()` asks the Blob API, which is not cached, for the current ETag; the
// content is then fetched at a URL no one has asked for before, and checked
// against that ETag before it is trusted.

const bareEtag = (etag: string | null | undefined) => String(etag || "").replace(/^W\//, "").replace(/"/g, "");

export async function readFresh(
  pathname: string
): Promise<{ bytes: Buffer; etag: string; uploadedAt: Date } | null> {
  let meta;
  try {
    meta = await head(pathname);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
  // A write can take a moment to reach every copy, so later tries wait.
  const waits = [0, 250, 600, 1200, 2500];
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await new Promise(resolve => setTimeout(resolve, waits[attempt]));
    const url = new URL(meta.url);
    url.searchParams.set("cache", "0");
    url.searchParams.set("v", bareEtag(meta.etag));
    if (attempt) url.searchParams.set("r", Math.random().toString(36).slice(2));
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`blob read failed: ${res.status}`);
    const served = res.headers.get("etag");
    if (served && bareEtag(served) !== bareEtag(meta.etag)) {
      console.warn("[blob] stale copy", { attempt, want: meta.etag, served, cache: res.headers.get("x-vercel-cache"), age: res.headers.get("age") });
      continue;
    }
    if (attempt) console.warn("[blob] fresh after", attempt, "retries");
    return { bytes: Buffer.from(await res.arrayBuffer()), etag: meta.etag, uploadedAt: meta.uploadedAt };
  }
  // The CDN kept serving another version. Writing over what was read would
  // lose whatever changed since, so give up and let the caller retry.
  throw new ConflictError();
}

export function blobStore(secret: string): StoreAdapter {
  const pathname = storePathname(secret);
  return {
    async read() {
      // Read as it is now, so a user created a moment ago is already
      // there on the next request and the ETag guards the next write.
      const result = await readFresh(pathname);
      if (!result) return { doc: EMPTY_DOC, etag: null };
      return { doc: decryptDoc(result.bytes.toString("utf8"), secret), etag: result.etag };
    },
    async write(doc: UserDoc, etag: string | null) {
      try {
        await put(pathname, encryptDoc(doc, secret), {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false,
          // First write: refuse to replace a document someone else just
          // created. Later writes: only over the version that was read.
          ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
        });
      } catch (err) {
        const message = String((err as Error)?.message || "");
        if (err instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(message)) {
          throw new ConflictError();
        }
        throw err;
      }
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
  return {
    async read(userId) {
      const result = await readFresh(historyPathname(secret, userId));
      if (!result) return { doc: EMPTY_HISTORY, etag: null };
      return { doc: openHistory(result.bytes.toString("utf8"), secret), etag: result.etag };
    },
    async write(userId, doc, etag) {
      try {
        await put(historyPathname(secret, userId), sealHistory(doc, secret), {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false,
          ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
        });
      } catch (err) {
        const message = String((err as Error)?.message || "");
        if (err instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(message)) {
          throw new ConflictError();
        }
        throw err;
      }
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
