/* ============================================================
   Content completeness

   Explanations were removed from the quiz UI (commits fe64b95,
   4301e0e) because imported exam data had `explanation: ""` and the
   UI rendered an empty labelled box. The fix is not "render it
   anyway" — it is to make completeness a typed state that both the
   build validator and the UI branch on, so an empty section can
   never be rendered and an incomplete question can never be served.
   ============================================================ */

import type { LegalRef, Question, QuestionStatus } from "./types";

/** Below this, an "explanation" is a stub, not an explanation. */
export const MIN_EXPLANATION_CHARS = 20;

export type ExplanationState =
  /** Has real prose. Render the full explanation section. */
  | "full"
  /** No prose, but cites a source. Render the refs and say the prose is pending. */
  | "reference-only"
  /** Neither. Render no explanation section at all — offer a report button. */
  | "missing";

type ExplainableQuestion = Pick<Question, "explanation"> & { legalRefs?: LegalRef[] };

export function getExplanationState(q: ExplainableQuestion): ExplanationState {
  if (q.explanation.trim().length >= MIN_EXPLANATION_CHARS) return "full";
  if ((q.legalRefs?.length ?? 0) > 0) return "reference-only";
  return "missing";
}

/**
 * Whether a question is allowed to carry `status: "published"`.
 * Enforced by the zod schema, so the build fails rather than shipping
 * a question a learner would hit with nothing to learn from.
 */
export function isPublishable(q: ExplainableQuestion): boolean {
  return getExplanationState(q) !== "missing";
}

export interface Coverage {
  explanation: number;
  legalRef: number;
}

/** Fractions 0–1. An empty input scores 1 (nothing missing) rather than NaN. */
export function coverageOf(questions: ExplainableQuestion[]): Coverage {
  if (questions.length === 0) return { explanation: 1, legalRef: 1 };
  const withExplanation = questions.filter(
    q => q.explanation.trim().length >= MIN_EXPLANATION_CHARS
  ).length;
  const withRef = questions.filter(q => (q.legalRefs?.length ?? 0) > 0).length;
  return {
    explanation: withExplanation / questions.length,
    legalRef: withRef / questions.length,
  };
}

export const QUESTION_STATUSES: readonly QuestionStatus[] = [
  "draft",
  "review",
  "published",
  "archived",
] as const;
