/* ============================================================
   types/app.ts — Shared domain types

   Extracted out of AppContext so the pure logic modules (and their
   tests) can import types without pulling in React.
   ============================================================ */

export type Screen = "hub" | "wizard" | "quiz" | "exam" | "open" | "results" | "profile" | "manager" | "settings";

/** A run of open questions: practice one by one, or a full past sitting against the clock. */
export interface OpenRun {
  id: string;
  mode: "practice" | "exam";
  arenaName: string;
  questionIds: string[];
  /** The sitting, for a full exam ("מקצועית ב׳ · קיץ 2026"). */
  examLabel?: string;
  startTime: string;
}

export type TrainingMode = "full" | "quick" | "mistakes" | "exam";

export type UserRole = "trainee" | "manager";

/**
 * Practice-pool filters. An EMPTY array means "no constraint on that
 * axis" — never "match nothing". Axes combine with AND, values inside
 * one axis with OR.
 */
export interface QuestionFilters {
  years: number[];
  topics: string[];
  qtypes: string[];
  repeatedOnly: boolean;
}

export interface TrainingConfig {
  mode: TrainingMode;
  questionCount: number;
  /** Seconds per question; 0 means untimed. */
  timePerQuestion: number;
  arenaId: string | null;
  arenaName: string;
  filters: QuestionFilters;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** The explanation was drafted by AI and the manager has not approved it yet. */
  explanationPending?: boolean;
  coach?: string;
  arena: string;
  difficulty?: "easy" | "medium" | "hard";
  /** Exam metadata — present only on banks that carry the taxonomy. */
  year?: number;
  /** Exam sitting, formatted "MM/YYYY". */
  moed?: string;
  topic?: string;
  topicLabel?: string;
  qtype?: string;
  qtypeLabel?: string;
  subtags?: string[];
  /** How many sittings this question has appeared in. */
  timesAsked?: number;
}

export interface Arena {
  id: string;
  name: string;
  /** "open": written answers graded by AI (מקצועית ב׳), not multiple choice. */
  kind?: "open";
  icon: string;
  questionCount: number;
  category: string;
  summary: string;
}

export interface QuizAnswer {
  questionId: string;
  /** -1 when the timer expired without a selection. */
  selectedIndex: number;
  isCorrect: boolean;
  timeSpent: number;
  /** Open questions: points awarded and available for this part. */
  score?: number;
  max?: number;
}

export interface QuizSession {
  id: string;
  arenaName: string;
  mode: TrainingMode;
  questions: Question[];
  answers: QuizAnswer[];
  /** ISO strings — these round-trip through localStorage. */
  startTime: string;
  endTime?: string;
  score: number;
  /** True when the session ran on built-in demo questions. */
  isDemo: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  joinDate: string;
  weeklyGoal: number;
  /** Topics this user may practise; absent = every topic. */
  arenas?: string[];
  /** "lms": signs in from the learning system, has no password here. */
  source?: "lms";
}

/** One recorded sitting in which a question appeared. */
export interface QuestionAppearance {
  exam?: string;
  moed?: string;
  number?: number;
}

/** One graded part of an open question. */
export interface OpenPartEntry {
  label: string;
  prompt: string;
  points: number;
  modelAnswer: string;
  rubric: { points: number; criterion: string }[];
  aiFlag?: string | null;
  aiNote?: string;
}

export interface QuestionBankEntry {
  id?: string;
  /** "open": a case with written parts, graded by AI against a rubric. */
  type?: "open";
  parts?: OpenPartEntry[];
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  /** "pending": drafted by AI, waiting for the manager. "approved": checked. */
  explanationStatus?: "pending" | "approved";
  /** What the AI pass noticed, for the manager only (never shown to students). */
  aiFlag?: string;
  aiNote?: string;
  /** Taken out of practice (status "draft") because the check found it broken. */
  hiddenByCheck?: boolean;
  coachNote?: string;
  difficulty?: "easy" | "medium" | "hard" | string;
  status?: string;
  // ── Exam taxonomy (added by the bank sync script) ─────────────
  year?: number;
  /** Exam sitting, formatted "MM/YYYY". */
  moed?: string;
  month?: number;
  examLabel?: string;
  topic?: string;
  topicLabel?: string;
  qtype?: string;
  qtypeLabel?: string;
  subtags?: string[];
  /** Flat list: year + topicLabel + qtypeLabel + subtags. */
  tags?: string[];
  timesAsked?: number;
  years?: number[];
  appearances?: QuestionAppearance[];
}

export interface QuestionBankCategory {
  icon?: string;
  product?: string;
  nextStep?: string;
  painPoints?: string[];
  questions?: QuestionBankEntry[];
}

/** Id → Hebrew label maps that back the filter chips. */
export interface QuestionBankTaxonomy {
  topics?: Record<string, string>;
  qtypes?: Record<string, string>;
}

export interface QuestionBankMeta {
  version?: string;
  language?: string;
  format?: string;
  note?: string;
  questionsPerCategory?: Record<string, number>;
  taxonomy?: QuestionBankTaxonomy;
}

export interface QuestionBankData {
  meta?: QuestionBankMeta;
  categories?: Record<string, QuestionBankCategory>;
}

/** Stored account record. Never holds a plaintext password. */
export interface AuthUserAccount {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  /** Set on the bootstrap admin until its default password is rotated. */
  mustChangePassword?: boolean;
}

/** The subset of an account that is safe to expose to the UI. */
export type PublicAuthUser = Pick<AuthUserAccount, "id" | "name" | "email" | "role"> & {
  arenas?: string[];
  source?: "lms";
};
