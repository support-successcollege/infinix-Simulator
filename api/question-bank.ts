/* ============================================================
   /api/question-bank — the shared question bank

   Until now the bank lived in each visitor's localStorage, so a
   manager's upload only ever reached that manager's browser. This
   endpoint gives the app one copy that every student reads:

     GET     public. Returns the published bank, or 404 when none
             has been published (the client then falls back to the
             bundled JSON, and finally to demo content).
     PUT     manager only. Validates and publishes a new bank.
     DELETE  manager only. Unpublishes, reverting everyone to the
             bundled JSON.

   Writes are gated by ADMIN_UPLOAD_TOKEN, checked here on the
   server. That matters: the sign-in screen is a display gate that
   runs in the visitor's own browser and can be bypassed with
   devtools (see docs/SECURITY.md), so it cannot be what protects
   a write that changes what every student sees. This check can't
   be reached from the client at all.

   Storage is a single Vercel Blob object. If the Blob store is not
   configured the endpoint degrades quietly: GET 404s and the app
   behaves exactly as it did before.
   ============================================================ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del, list, put } from "@vercel/blob";

/** Stable pathname, so publishing overwrites rather than accumulates. */
const BLOB_PATHNAME = "question-bank/current.json";

/** Generous for a question bank, small enough to bound abuse. */
const MAX_BYTES = 4 * 1024 * 1024;

interface PublishedEnvelope {
  bank: unknown;
  publishedAt: string;
  /** Bytes of the raw bank payload, for the manager's readout. */
  size: number;
}

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

function isAuthorized(req: VercelRequest): boolean {
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

async function findBlobUrl(): Promise<string | null> {
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  return blobs[0]?.url ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // ── Read ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    if (!isConfigured()) {
      res.status(404).json({ error: "no published bank" });
      return;
    }

    try {
      const url = await findBlobUrl();
      if (!url) {
        res.status(404).json({ error: "no published bank" });
        return;
      }

      // `cache: no-store` on the origin fetch, because the CDN header
      // below is what controls freshness for students — reading a
      // stale copy here would make publishing look like it failed.
      const upstream = await fetch(url, { cache: "no-store" });
      if (!upstream.ok) {
        res.status(404).json({ error: "no published bank" });
        return;
      }

      const envelope = (await upstream.json()) as PublishedEnvelope;

      // Students may hit this on every load, so it is cached at the
      // edge — but only briefly, so a publish reaches everyone within
      // the minute rather than whenever their browser feels like it.
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=30, stale-while-revalidate=300"
      );
      res.setHeader("X-Published-At", envelope.publishedAt || "");
      res.status(200).send(JSON.stringify(envelope.bank));
    } catch (err) {
      console.error("[question-bank] read failed", err);
      res.status(404).json({ error: "no published bank" });
    }
    return;
  }

  // ── Write ─────────────────────────────────────────────────────
  if (req.method === "PUT" || req.method === "POST") {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "טוקן ניהול שגוי או חסר" });
      return;
    }
    if (!isConfigured()) {
      res.status(503).json({
        error: "אחסון Blob לא מוגדר בפרויקט. צור Blob store ב-Vercel ופרוס מחדש.",
      });
      return;
    }

    const bank = req.body;
    const invalid = validateBank(bank);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const payload = JSON.stringify(bank);
    const size = Buffer.byteLength(payload, "utf8");
    if (size > MAX_BYTES) {
      res.status(413).json({ error: `המאגר גדול מדי (${Math.round(size / 1024)}KB)` });
      return;
    }

    const envelope: PublishedEnvelope = {
      bank,
      publishedAt: new Date().toISOString(),
      size,
    };

    try {
      await put(BLOB_PATHNAME, JSON.stringify(envelope), {
        access: "public",
        contentType: "application/json; charset=utf-8",
        // Without both of these each publish would create a new
        // randomly-suffixed object and the old bank would keep
        // serving alongside it.
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      res.status(200).json({ ok: true, publishedAt: envelope.publishedAt, size });
    } catch (err) {
      console.error("[question-bank] publish failed", err);
      res.status(500).json({ error: "פרסום המאגר נכשל" });
    }
    return;
  }

  // ── Unpublish ─────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "טוקן ניהול שגוי או חסר" });
      return;
    }
    if (!isConfigured()) {
      res.status(200).json({ ok: true });
      return;
    }

    try {
      const url = await findBlobUrl();
      if (url) await del(url);
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
