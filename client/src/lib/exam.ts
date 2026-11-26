/* ============================================================
   exam.ts — The real exam format, readiness and open mistakes

   Pure functions only, tested in exam.test.ts. Arena names are
   matched through arenaKey-style normalisation so "מקצועית א׳" and
   "מקצועית א" are the same exam.
   ============================================================ */

import type { Question, QuizAnswer, QuizSession } from "@/types/app";
import { pickQuestions } from "@/lib/questionBank";

export interface ExamFormat {
  questions: number;
  minutes: number;
  /** Passing score, in percent. */
  pass: number;
  /** The insurance commissioner has not published a pass mark; 60 is what prep courses use. */
  passAssumed?: boolean;
  calculator?: boolean;
  formulaSheet?: boolean;
}

/** The two families of exams, as the regulators set them. */
const ISA_EXAM: ExamFormat = { questions: 20, minutes: 150, pass: 60, calculator: true };
const INSURANCE_EXAM: ExamFormat = { questions: 50, minutes: 90, pass: 60, passAssumed: true, calculator: true };

const key = (name: string) =>
  String(name || "")
    .replace(/[׳״'"`׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Israel Securities Authority (ISA) and insurance exams, from the regulators' instructions. */
const FORMATS: Record<string, ExamFormat> = {
  [key("דיני ניירות ערך ואתיקה מקצועית")]: { ...ISA_EXAM, questions: 25, calculator: false },
  [key("כלכלה")]: ISA_EXAM,
  [key("חשבונאות")]: ISA_EXAM,
  [key("סטטיסטיקה ומימון")]: { ...ISA_EXAM, formulaSheet: true },
  [key("מקצועית א")]: { ...ISA_EXAM, questions: 25, formulaSheet: true },
  [key("יסודות הביטוח")]: INSURANCE_EXAM,
  [key("ביטוח רכוש")]: INSURANCE_EXAM,
  [key("ביטוח תאונות")]: INSURANCE_EXAM,
  [key("גמר פנסיוני")]: INSURANCE_EXAM,
  // Open questions, one full past sitting; the ISA has not changed its length or pass mark.
  [key("מקצועית ב")]: { questions: 0, minutes: 150, pass: 60, calculator: true, formulaSheet: true },
};

/** An arena with no published format gets the ISA shape. */
export function examFormat(arenaName: string): ExamFormat {
  return FORMATS[key(arenaName)] ?? ISA_EXAM;
}

/** "Ready" is 10 full exams in the arena within 7 days, each this far above the pass mark. */
export const READY_EXAMS = 10;
export const READY_WINDOW_DAYS = 7;
export const READY_MARGIN = 15;

export type YearScope = "all" | "last5";

/** The most recent `count` distinct exam years found in the pool, newest first. */
export function recentYears(questions: Question[], count = 5): number[] {
  const years = Array.from(new Set(questions.map(q => q.year).filter((y): y is number => typeof y === "number")));
  return years.sort((a, b) => b - a).slice(0, count);
}

/** The pool a full exam draws from: every year, or only the last five. */
export function examPool(questions: Question[], scope: YearScope): Question[] {
  if (scope === "all") return questions;
  const years = new Set(recentYears(questions, 5));
  return questions.filter(q => q.year != null && years.has(q.year));
}

/** Questions for one full exam: the real number, drawn without repeats. */
export function buildExam(questions: Question[], format: ExamFormat, scope: YearScope): Question[] {
  return pickQuestions(examPool(questions, scope), format.questions);
}

const sameArena = (a: string, b: string) => key(a) === key(b);

export interface Readiness {
  /** Full exams in the arena within the window. */
  recentExams: number;
  /** Of those, the ones at or above the ready score. */
  qualifying: number;
  /** 0–100: qualifying exams out of the ten that make "ready". */
  percent: number;
  ready: boolean;
  /** The score a qualifying exam needs. */
  readyScore: number;
  lastScore: number | null;
  passScore: number;
}

export function readiness(sessions: QuizSession[], arenaName: string, now = Date.now()): Readiness {
  const format = examFormat(arenaName);
  const readyScore = format.pass + READY_MARGIN;
  const since = now - READY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const exams = sessions
    .filter(s => s.mode === "exam" && s.endTime && sameArena(s.arenaName, arenaName))
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
  const recent = exams.filter(s => Date.parse(s.endTime!) >= since);
  const qualifying = recent.filter(s => s.score >= readyScore).length;
  return {
    recentExams: recent.length,
    qualifying,
    percent: Math.round((Math.min(qualifying, READY_EXAMS) / READY_EXAMS) * 100),
    ready: qualifying >= READY_EXAMS,
    readyScore,
    lastScore: exams.length ? exams[0].score : null,
    passScore: format.pass,
  };
}

/**
 * Questions still to fix in an arena: answered wrong at some point, and
 * not answered right twice in a row since the last wrong answer.
 */
export function openMistakes(sessions: QuizSession[], arenaName: string): Set<string> {
  const history = new Map<string, boolean[]>();
  sessions
    .filter(s => sameArena(s.arenaName, arenaName))
    .slice()
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .forEach(s =>
      s.answers.forEach(a => {
        const list = history.get(a.questionId) ?? [];
        list.push(a.isCorrect);
        history.set(a.questionId, list);
      })
    );
  const open = new Set<string>();
  history.forEach((results, id) => {
    const lastWrong = results.lastIndexOf(false);
    if (lastWrong === -1) return;
    if (results.length - 1 - lastWrong < 2) open.add(id);
  });
  return open;
}

export interface TopicScore {
  topic: string;
  correct: number;
  total: number;
  percent: number;
}

/** Correct answers per topic, weakest first. Questions with no topic are left out. */
export function topicBreakdown(questions: Question[], answers: QuizAnswer[]): TopicScore[] {
  const byId = new Map(answers.map(a => [a.questionId, a]));
  const tally = new Map<string, { correct: number; total: number }>();
  questions.forEach(q => {
    const label = q.topicLabel || q.topic;
    if (!label) return;
    const row = tally.get(label) ?? { correct: 0, total: 0 };
    row.total += 1;
    if (byId.get(q.id)?.isCorrect) row.correct += 1;
    tally.set(label, row);
  });
  return Array.from(tally.entries())
    .map(([topic, { correct, total }]) => ({ topic, correct, total, percent: Math.round((correct / total) * 100) }))
    .sort((a, b) => a.percent - b.percent || b.total - a.total);
}

/** Whole days from `now` until an exam date given as YYYY-MM-DD; null when none or past. */
export function daysUntil(date: string | undefined, now = new Date()): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((target - today) / 86_400_000);
  return days >= 0 ? days : null;
}
