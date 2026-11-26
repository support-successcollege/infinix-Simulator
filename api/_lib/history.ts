/* ============================================================
   Practice history, kept per user on the server.

   Each user has one document: the sessions they finished, newest
   first. It is encrypted with a key derived from AUTH_SECRET and
   stored at a pathname derived from the same secret and the user
   id, so the public Blob store reveals neither who practised nor
   how they did.

   A stored session keeps the question ids and the answers, not the
   questions themselves: the bank holds the text, and a thousand
   sessions of full question copies would be megabytes per student.
   ============================================================ */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { ConflictError } from "./userAuth.js";

export interface StoredAnswer {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timeSpent: number;
}

export interface StoredSession {
  id: string;
  arenaName: string;
  mode: string;
  questionIds: string[];
  answers: StoredAnswer[];
  startTime: string;
  endTime?: string;
  score: number;
}

export interface HistoryDoc {
  version: 1;
  sessions: StoredSession[];
}

export interface HistoryStore {
  read(userId: string): Promise<{ doc: HistoryDoc; etag: string | null }>;
  /** Throws ConflictError when the document changed since `etag`. */
  write(userId: string, doc: HistoryDoc, etag: string | null): Promise<void>;
}

const EMPTY: HistoryDoc = { version: 1, sessions: [] };
/** Enough for a year of daily practice; the oldest fall off. */
const MAX_SESSIONS = 1000;
const MAX_QUESTIONS = 200;

function key(secret: string, label: string): Buffer {
  return createHmac("sha256", secret).update(label).digest();
}

export function historyPathname(secret: string, userId: string): string {
  return `history/${key(secret, `history-path:${userId}`).toString("hex").slice(0, 40)}.json`;
}

export function sealHistory(doc: HistoryDoc, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, "history-encryption"), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(doc), "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}

export function openHistory(text: string, secret: string): HistoryDoc {
  const box = JSON.parse(text) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv("aes-256-gcm", key(secret, "history-encryption"), Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
  const doc = JSON.parse(plain.toString("utf8")) as HistoryDoc;
  return { version: 1, sessions: Array.isArray(doc.sessions) ? doc.sessions : [] };
}

/** A session from a request, cleaned, or null when it is not one. */
export function toStoredSession(raw: unknown): StoredSession | null {
  const s = (raw || {}) as Record<string, unknown>;
  const id = String(s.id || "").slice(0, 80);
  const arenaName = String(s.arenaName || "").slice(0, 120);
  const startTime = String(s.startTime || "");
  if (!id || !arenaName || Number.isNaN(Date.parse(startTime))) return null;
  const questionIds = (Array.isArray(s.questionIds) ? s.questionIds : [])
    .slice(0, MAX_QUESTIONS)
    .map(q => String(q).slice(0, 120));
  const answers = (Array.isArray(s.answers) ? s.answers : []).slice(0, MAX_QUESTIONS).map(a => {
    const x = (a || {}) as Record<string, unknown>;
    return {
      questionId: String(x.questionId || "").slice(0, 120),
      selectedIndex: Number.isInteger(x.selectedIndex) ? Number(x.selectedIndex) : -1,
      isCorrect: x.isCorrect === true,
      timeSpent: Math.max(0, Math.min(36_000, Number(x.timeSpent) || 0)),
      ...(Number.isFinite(Number(x.score)) && x.score != null ? { score: Math.max(0, Math.min(100, Number(x.score))) } : {}),
      ...(Number.isFinite(Number(x.max)) && x.max != null ? { max: Math.max(0, Math.min(100, Number(x.max))) } : {}),
    };
  });
  const endTime = s.endTime && !Number.isNaN(Date.parse(String(s.endTime))) ? String(s.endTime) : undefined;
  const score = Math.max(0, Math.min(100, Math.round(Number(s.score) || 0)));
  return { id, arenaName, mode: String(s.mode || "full").slice(0, 20), questionIds, answers, startTime, endTime, score };
}

export interface HistoryRequest {
  method: string;
  body?: unknown;
  authorization?: string;
}

export function createHistoryService(
  store: HistoryStore,
  currentUser: (authorization?: string) => Promise<{ id: string } | null>
) {
  async function handle(req: HistoryRequest): Promise<{ status: number; body: unknown }> {
    const user = await currentUser(req.authorization);
    if (!user) return { status: 401, body: { error: "יש להתחבר מחדש" } };
    const method = req.method.toUpperCase();

    if (method === "GET") {
      const { doc } = await store.read(user.id);
      return { status: 200, body: { sessions: doc.sessions } };
    }

    if (method === "POST") {
      const session = toStoredSession((req.body as { session?: unknown } | undefined)?.session);
      if (!session) return { status: 400, body: { error: "נתוני התרגול אינם תקינים" } };
      for (let attempt = 0; attempt < 4; attempt++) {
        const { doc, etag } = await store.read(user.id);
        const sessions = [session, ...doc.sessions.filter(s => s.id !== session.id)].slice(0, MAX_SESSIONS);
        try {
          await store.write(user.id, { version: 1, sessions }, etag);
          return { status: 200, body: { ok: true } };
        } catch (err) {
          if (err instanceof ConflictError) continue;
          throw err;
        }
      }
      return { status: 409, body: { error: "שמירת התרגול נכשלה, נסה שוב" } };
    }

    return { status: 405, body: { error: "method not allowed" } };
  }

  return { handle };
}

/** In-memory store, for tests. */
export function memoryHistoryStore(): HistoryStore & { docs: Map<string, HistoryDoc> } {
  const docs = new Map<string, HistoryDoc>();
  const versions = new Map<string, number>();
  return {
    docs,
    async read(userId) {
      const doc = docs.get(userId) || EMPTY;
      const v = versions.get(userId) || 0;
      return { doc: JSON.parse(JSON.stringify(doc)), etag: v ? String(v) : null };
    },
    async write(userId, doc, etag) {
      const v = versions.get(userId) || 0;
      if ((etag || null) !== (v ? String(v) : null)) throw new ConflictError();
      docs.set(userId, JSON.parse(JSON.stringify(doc)));
      versions.set(userId, v + 1);
    },
  };
}

export { EMPTY as EMPTY_HISTORY };
