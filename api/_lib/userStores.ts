/* Where the user document is kept: Vercel Blob in production, a
   git-ignored file in local development. Both hold the same
   encrypted text, so a dev file is as unreadable as the real one. */

import fs from "node:fs";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import {
  ConflictError,
  EMPTY_DOC,
  decryptDoc,
  encryptDoc,
  storePathname,
  type StoreAdapter,
  type UserDoc,
} from "./userAuth.js";

export function blobStore(secret: string): StoreAdapter {
  const pathname = storePathname(secret);
  return {
    async read() {
      // useCache: false reads origin storage, so a user created a
      // moment ago is already there on the next request.
      const result = await get(pathname, { access: "public", useCache: false });
      if (!result || result.statusCode !== 200) return { doc: EMPTY_DOC, etag: null };
      const text = await new Response(result.stream).text();
      return { doc: decryptDoc(text, secret), etag: result.blob.etag };
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
