/* ============================================================
   /api/question-bank — the shared question bank

   One copy of the bank that every student reads:

     GET     public. Returns the published bank, or 404 when none
             has been published (the client then falls back to the
             bundled JSON).
     PUT     manager only. Validates and publishes a new bank.
     DELETE  manager only. Unpublishes, reverting everyone to the
             bundled JSON.

   Who may write: a signed-in manager (session token from /api/auth),
   or anyone holding ADMIN_UPLOAD_TOKEN. Both are checked here, on the
   server.

   Size: a Vercel Function takes and returns at most 4.5MB, and the
   bank with the insurance past exams is about 10MB of JSON. So the
   bank travels and rests gzip-compressed (about 1.6MB): the client
   sends it compressed (Content-Type application/octet-stream with
   X-Bank-Encoding: gzip), it is stored compressed, and GET returns the
   stored bytes with Content-Encoding: gzip, which the browser unpacks.
   A plain JSON body is still accepted for small banks and old clients.

   Storage is Vercel Blob. Banks published before compression sit at
   the old pathname as a JSON envelope; GET still serves those until
   the next publish replaces them.
   ============================================================ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del, get, list, put } from "@vercel/blob";
import { gunzipSync, gzipSync } from "node:zlib";
import { createAuthService, type AuthEnv } from "./_lib/userAuth.js";
import { blobStore } from "./_lib/userStores.js";

/** Current pathname: the gzipped bank JSON. */
const BLOB_PATHNAME = "question-bank/current.json.gz";
/** Pre-compression pathname: a JSON envelope { bank, publishedAt, size }. */
const LEGACY_PATHNAME = "question-bank/current.json";

/** Uncompressed ceiling, to bound abuse. */
const MAX_BYTES = 40 * 1024 * 1024;

function isConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Accepts the two shapes the client parser understands: the native
 * `{ categories: {...} }` bank and the legacy `{ exams: [...] }`
 * exam export. Anything else is rejected here rather than being
 * published and breaking the app for every student at once.
 */
function validateBank(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "הקובץ אינו אובייקט JSON תקין";
  }
  const data = input as Record<string, unknown>;

  const hasCategories =
    data.categories && typeof data.categories === "object" && !Array.isArray(data.categories);
  const hasExams = Array.isArray(data.exams);

  if (!hasCategories && !hasExams) {
    return "לא נמצא שדה categories או exams במבנה הקובץ";
  }
  if (hasCategories && Object.keys(data.categories as object).length === 0) {
    return "המאגר אינו מכיל אף קטגוריה";
  }
  return null;
}

function hasAdminToken(req: VercelRequest): boolean {
  const expected = process.env.ADMIN_UPLOAD_TOKEN;
  if (!expected) return false;

  const header = req.headers.authorization || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== expected.length) return false;

  // Constant-time-ish compare: the loop's runtime doesn't depend on
  // how many leading characters happened to match.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function isAuthorized(req: VercelRequest): Promise<boolean> {
  if (hasAdminToken(req)) return true;
  const secret = process.env.AUTH_SECRET;
  if (!secret || !isConfigured()) return false;
  try {
    const auth = createAuthService(blobStore(secret), process.env as AuthEnv);
    return await auth.isManager(req.headers.authorization);
  } catch (err) {
    console.error("[question-bank] session check failed", err);
    return false;
  }
}

async function readBlob(pathname: string): Promise<{ bytes: Buffer; uploadedAt: Date } | null> {
  const result = await get(pathname, { access: "public", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { bytes, uploadedAt: result.blob.uploadedAt };
}

/** Deletes the blobs at exactly these pathnames. */
async function deletePaths(...pathnames: string[]) {
  const { blobs } = await list({ prefix: "question-bank/" });
  const doomed = blobs.filter(b => pathnames.includes(b.pathname)).map(b => b.url);
  if (doomed.length) await del(doomed);
}

/** The request body as a bank object, whichever way it was sent. */
function readBank(req: VercelRequest): { bank?: unknown; error?: string } {
  const encoding = String(req.headers["x-bank-encoding"] || "").toLowerCase();
  const body = req.body as unknown;

  if (encoding === "gzip") {
    const raw = Buffer.isBuffer(body)
      ? body
      : typeof body === "string"
        ? Buffer.from(body, "binary")
        : null;
    if (!raw) return { error: "גוף הבקשה חסר" };
    let text: Buffer;
    try {
      text = gunzipSync(raw, { maxOutputLength: MAX_BYTES });
    } catch {
      return { error: `המאגר גדול מדי או פגום (עד ${MAX_BYTES / 1024 / 1024}MB)` };
    }
    try {
      return { bank: JSON.parse(text.toString("utf8")) };
    } catch {
      return { error: "JSON לא תקין" };
    }
  }

  if (typeof body === "string") {
    try {
      return { bank: JSON.parse(body) };
    } catch {
      return { error: "JSON לא תקין" };
    }
  }
  return { bank: body };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── Read ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const notFound = () => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(404).json({ error: "no published bank" });
    };
    if (!isConfigured()) return notFound();

    try {
      const current = await readBlob(BLOB_PATHNAME);
      const legacy = current ? null : await readBlob(LEGACY_PATHNAME);
      if (!current && !legacy) return notFound();

      // Students may hit this on every load, so it is cached at the
      // edge, but only briefly, so a publish reaches everyone within
      // the minute.
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
      res.setHeader("Content-Type", "application/json; charset=utf-8");

      if (current) {
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("X-Published-At", current.uploadedAt.toISOString());
        res.status(200).send(current.bytes);
        return;
      }

      const envelope = JSON.parse(legacy!.bytes.toString("utf8")) as { bank: unknown; publishedAt?: string };
      res.setHeader("X-Published-At", envelope.publishedAt || "");
      res.status(200).send(JSON.stringify(envelope.bank));
    } catch (err) {
      console.error("[question-bank] read failed", err);
      notFound();
    }
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // ── Write ─────────────────────────────────────────────────────
  if (req.method === "PUT" || req.method === "POST") {
    if (!(await isAuthorized(req))) {
      res.status(401).json({ error: "רק מנהל מחובר או בעל טוקן ניהול יכול לפרסם" });
      return;
    }
    if (!isConfigured()) {
      res.status(503).json({
        error: "אחסון Blob לא מוגדר בפרויקט. צור Blob store ב-Vercel ופרוס מחדש.",
      });
      return;
    }

    const { bank, error } = readBank(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const invalid = validateBank(bank);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const payload = Buffer.from(JSON.stringify(bank), "utf8");
    if (payload.length > MAX_BYTES) {
      res.status(413).json({ error: `המאגר גדול מדי (${Math.round(payload.length / 1024 / 1024)}MB)` });
      return;
    }

    try {
      await put(BLOB_PATHNAME, gzipSync(payload, { level: 9 }), {
        access: "public",
        contentType: "application/gzip",
        // Without both of these each publish would create a new
        // randomly-suffixed object and the old bank would keep
        // serving alongside it.
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      });
      // The pre-compression copy would otherwise come back if this
      // one were ever removed.
      await deletePaths(LEGACY_PATHNAME).catch(() => undefined);
      res.status(200).json({ ok: true, publishedAt: new Date().toISOString(), size: payload.length });
    } catch (err) {
      console.error("[question-bank] publish failed", err);
      res.status(500).json({ error: "פרסום המאגר נכשל" });
    }
    return;
  }

  // ── Unpublish ─────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!(await isAuthorized(req))) {
      res.status(401).json({ error: "רק מנהל מחובר או בעל טוקן ניהול יכול לבטל פרסום" });
      return;
    }
    if (!isConfigured()) {
      res.status(200).json({ ok: true });
      return;
    }

    try {
      await deletePaths(BLOB_PATHNAME, LEGACY_PATHNAME);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[question-bank] unpublish failed", err);
      res.status(500).json({ error: "ביטול הפרסום נכשל" });
    }
    return;
  }

  res.setHeader("Allow", "GET, PUT, POST, DELETE");
  res.status(405).json({ error: "method not allowed" });
}
