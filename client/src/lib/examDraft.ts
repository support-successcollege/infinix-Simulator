/* ============================================================
   examDraft.ts — A full exam in progress, kept in this browser

   A full exam runs up to two and a half hours. A closed tab, a dead
   battery or a reload must not cost the student their answers, so
   every change is written here and the exam resumes at the same
   question with the same clock. One draft per user.
   ============================================================ */

import type { OpenRun, QuizSession } from "@/types/app";
import { STORAGE_KEYS, readJson, removeKey, writeJson } from "@/lib/storage";
import type { YearScope } from "@/lib/exam";

export interface ExamDraft {
  userId: string;
  session: QuizSession;
  /** The chosen option per question; -1 while unanswered. */
  selections: number[];
  /** "Check again" marks. */
  flags: boolean[];
  /** Seconds spent on each question so far. */
  spent: number[];
  current: number;
  /** Epoch ms at which the exam ends. */
  deadline: number;
  scope: YearScope;
}

export function readDraft(userId: string | undefined): ExamDraft | null {
  if (!userId) return null;
  const draft = readJson<ExamDraft | null>(STORAGE_KEYS.examDraft, null);
  if (!draft || draft.userId !== userId || !draft.session?.questions?.length) return null;
  return draft;
}

export function saveDraft(draft: ExamDraft): void {
  writeJson(STORAGE_KEYS.examDraft, draft);
}

export function clearDraft(): void {
  removeKey(STORAGE_KEYS.examDraft);
}

/** The exam date a student set per arena, YYYY-MM-DD. Kept per user in this browser. */
export function readExamDates(userId: string | undefined): Record<string, string> {
  if (!userId) return {};
  const all = readJson<Record<string, Record<string, string>>>(STORAGE_KEYS.examDates, {});
  return all[userId] ?? {};
}

export function saveExamDate(userId: string, arenaName: string, date: string): void {
  const all = readJson<Record<string, Record<string, string>>>(STORAGE_KEYS.examDates, {});
  const mine = { ...(all[userId] ?? {}) };
  if (date) mine[arenaName] = date;
  else delete mine[arenaName];
  writeJson(STORAGE_KEYS.examDates, { ...all, [userId]: mine });
}

// ── Open-question exam (מקצועית ב׳) in progress ────────────────

export interface OpenExamDraft {
  userId: string;
  run: OpenRun;
  /** questionId -> part label -> text */
  answers: Record<string, Record<string, string>>;
  current: number;
  deadline: number;
}

export function readOpenDraft(userId: string | undefined): OpenExamDraft | null {
  if (!userId) return null;
  const draft = readJson<OpenExamDraft | null>(STORAGE_KEYS.openExamDraft, null);
  if (!draft || draft.userId !== userId || !draft.run?.questionIds?.length) return null;
  return draft;
}

export function saveOpenDraft(draft: OpenExamDraft): void {
  writeJson(STORAGE_KEYS.openExamDraft, draft);
}

export function clearOpenDraft(): void {
  removeKey(STORAGE_KEYS.openExamDraft);
}
