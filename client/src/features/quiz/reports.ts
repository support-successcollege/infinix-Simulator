/* ============================================================
   Learner question reports

   A question with no explanation is a dead end for the learner. The
   report button turns it into a work item instead: the manager's
   content tab reads this queue, so gaps surface from real use rather
   than waiting for someone to audit the bank.

   Device-local, like everything else without a backend.
   ============================================================ */

import { globalKey, readVersioned, writeVersioned } from "@/lib/storage";
import type { Question } from "@/content/types";

const REPORTS_KEY = globalKey("reports");
const REPORTS_VERSION = 1;
const MAX_REPORTS = 200;

export type ReportReason = "missing-explanation" | "wrong-answer" | "unclear" | "other";

export interface QuestionReport {
  questionId: string;
  subjectId: string;
  topicId: string;
  stem: string;
  reason: ReportReason;
  reportedAt: number;
}

export function readReports(): QuestionReport[] {
  return (
    readVersioned<QuestionReport[]>(REPORTS_KEY, {
      currentVersion: REPORTS_VERSION,
      validate: data => (Array.isArray(data) ? (data as QuestionReport[]) : null),
    }) ?? []
  );
}

export function reportQuestion(question: Question, reason: ReportReason): void {
  const existing = readReports();
  // One open report per question is enough; re-reporting refreshes the date.
  const withoutDuplicate = existing.filter(r => r.questionId !== question.id);
  const next: QuestionReport[] = [
    {
      questionId: question.id,
      subjectId: question.subjectId,
      topicId: question.topicId,
      stem: question.stem.slice(0, 200),
      reason,
      reportedAt: Date.now(),
    },
    ...withoutDuplicate,
  ].slice(0, MAX_REPORTS);

  writeVersioned(REPORTS_KEY, REPORTS_VERSION, next);
}

export function clearReport(questionId: string): void {
  writeVersioned(
    REPORTS_KEY,
    REPORTS_VERSION,
    readReports().filter(r => r.questionId !== questionId)
  );
}
