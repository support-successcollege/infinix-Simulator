/* ============================================================
   Persisted learner progress

   Note what a SessionRecord does NOT contain: the questions. The old
   QuizSession embedded the full Question[] — stems, options and
   explanations — so one 30-question session was roughly 20 KB and a
   couple of hundred sessions would exhaust the ~5 MB localStorage
   budget. Only question ids are stored; the text is rehydrated from
   the ContentSource when history is displayed.
   ============================================================ */

export type AnswerOutcome = "correct" | "wrong" | "timeout" | "skipped";

export interface AnswerRecord {
  questionId: string;
  topicId: string;
  /** Null for timeout and skipped. */
  selectedIndex: number | null;
  outcome: AnswerOutcome;
  /** Milliseconds spent on the question. */
  ms: number;
}

export interface SessionRecord {
  id: string;
  subjectId: string;
  /** Denormalised so history renders without loading the subject file. */
  subjectTitle: string;
  mode: string;
  startedAt: number;
  endedAt: number;
  questionCount: number;
  answers: AnswerRecord[];
  scorePct: number;
  /** Exam mode only. */
  passed?: boolean;
}

export interface TopicTotals {
  seen: number;
  correct: number;
}

/**
 * Running totals, updated incrementally and never pruned — so trimming
 * old sessions to stay inside quota does not rewrite the learner's history.
 */
export interface LifetimeTotals {
  sessions: number;
  answered: number;
  correct: number;
  byTopic: Record<string, TopicTotals>;
  firstSessionAt: number | null;
}

export function emptyLifetime(): LifetimeTotals {
  return { sessions: 0, answered: 0, correct: 0, byTopic: {}, firstSessionAt: null };
}

export function accumulate(totals: LifetimeTotals, session: SessionRecord): LifetimeTotals {
  const byTopic: Record<string, TopicTotals> = { ...totals.byTopic };
  let answered = 0;
  let correct = 0;

  for (const a of session.answers) {
    // A skipped question is not evidence about what the learner knows.
    if (a.outcome === "skipped") continue;
    answered += 1;
    const isCorrect = a.outcome === "correct";
    if (isCorrect) correct += 1;

    const prev = byTopic[a.topicId] ?? { seen: 0, correct: 0 };
    byTopic[a.topicId] = {
      seen: prev.seen + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
    };
  }

  return {
    sessions: totals.sessions + 1,
    answered: totals.answered + answered,
    correct: totals.correct + correct,
    byTopic,
    firstSessionAt: totals.firstSessionAt ?? session.startedAt,
  };
}
