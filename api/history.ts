/* ============================================================
   /api/history — the signed-in user's practice history

     GET                              -> { sessions }
     POST  { session }                -> { ok }   (adds or replaces by id)

   The logic lives in ./_lib/history.ts.
   ============================================================ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAuthService, type AuthEnv } from "./_lib/userAuth.js";
import { createHistoryService } from "./_lib/history.js";
import { blobHistoryStore, blobStore } from "./_lib/userStores.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const secret = process.env.AUTH_SECRET || "";
  if (!secret || !process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(503).json({ error: "שירות המשתמשים לא מוגדר בשרת" });
    return;
  }

  try {
    const auth = createAuthService(blobStore(secret), process.env as AuthEnv);
    const service = createHistoryService(blobHistoryStore(secret), auth.currentUser);
    const out = await service.handle({ method: req.method || "GET", body: req.body, authorization: req.headers.authorization });
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("[history] request failed", err);
    res.status(500).json({ error: "שגיאת שרת, נסה שוב" });
  }
}
