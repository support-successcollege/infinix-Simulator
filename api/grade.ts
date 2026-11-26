/* ============================================================
   /api/grade — AI grading of an open question

     POST { questionId, answers: { [partLabel]: text } }
       -> { grades: [{ label, score, max, feedback, criteria }], total, max }

   Signed-in users only, for an arena they hold, within a daily quota.
   The question, model answer and rubric are read from the published
   bank on the server. Needs ANTHROPIC_API_KEY; without it the endpoint
   answers 503 and the app shows the model answer for self-checking.
   The logic lives in ./_lib/grading.ts.
   ============================================================ */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { get } from "@vercel/blob";
import { gunzipSync } from "node:zlib";
import { createAuthService, type AuthEnv } from "./_lib/userAuth.js";
import { anthropicGrader, createGradeService, openQuestionsOf, type OpenQuestion } from "./_lib/grading.js";
import { blobQuotaStore, blobStore } from "./_lib/userStores.js";

const BANK_PATHNAME = "question-bank/current.json.gz";

// The bank's open questions, kept while this instance is warm and the
// published bank has not changed.
let cached: { uploadedAt: number; questions: Map<string, OpenQuestion> } | null = null;

async function findQuestion(id: string): Promise<OpenQuestion | null> {
  if (!id) return null;
  const result = await get(BANK_PATHNAME, { access: "public" });
  if (!result || result.statusCode !== 200) return null;
  const uploadedAt = new Date(result.blob.uploadedAt).getTime();
  if (!cached || cached.uploadedAt !== uploadedAt) {
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    const bank = JSON.parse(gunzipSync(bytes).toString("utf8"));
    cached = { uploadedAt, questions: openQuestionsOf(bank) };
  } else {
    await result.stream?.cancel?.();
  }
  return cached.questions.get(id) ?? null;
}

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
    const service = createGradeService({
      currentUser: auth.currentUser,
      findQuestion,
      grader: process.env.ANTHROPIC_API_KEY ? anthropicGrader(new Anthropic()) : null,
      quota: blobQuotaStore(secret),
    });
    const out = await service.handle({ method: req.method || "POST", body: req.body, authorization: req.headers.authorization });
    res.status(out.status).json(out.body);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "שירות הבדיקה עמוס כרגע, נסו שוב בעוד דקה" });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[grade] Claude API error", err.status, err.message);
      res.status(502).json({ error: "הבדיקה האוטומטית נכשלה, נסו שוב" });
      return;
    }
    console.error("[grade] request failed", err);
    res.status(500).json({ error: "שגיאת שרת, נסה שוב" });
  }
}
