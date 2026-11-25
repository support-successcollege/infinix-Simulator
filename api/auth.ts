/* ============================================================
   /api/auth — sign-in and user management

     POST   ?action=login     { email, password }  -> { token, user }
     GET    ?action=me                             -> { user }
     POST   ?action=password  { currentPassword, newPassword }
     GET    ?action=users                          manager: list
     POST   ?action=users     { name, email, password, role }
     PATCH  ?action=users&id= { role?, name?, password? }
     DELETE ?action=users&id=

   The logic lives in ./_lib/userAuth.ts; this file only adapts the
   Vercel request and picks the Blob store.
   ============================================================ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAuthService, type AuthEnv } from "./_lib/userAuth.js";
import { blobStore } from "./_lib/userStores.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const secret = process.env.AUTH_SECRET || "";
  if (!secret || !process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(503).json({ error: "שירות המשתמשים לא מוגדר בשרת" });
    return;
  }

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

  try {
    const service = createAuthService(blobStore(secret), process.env as AuthEnv);
    const out = await service.handle({
      method: req.method || "GET",
      action: one(req.query.action),
      id: one(req.query.id) || undefined,
      body: req.body,
      authorization: req.headers.authorization,
    });
    res.status(out.status).json(out.body);
  } catch (err) {
    console.error("[auth] request failed", err);
    res.status(500).json({ error: "שגיאת שרת, נסה שוב" });
  }
}
