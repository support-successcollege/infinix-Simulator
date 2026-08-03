/* ============================================================
   types/app.ts — Shared domain types

   Extracted out of AppContext so the pure logic modules (and their
   tests) can import types without pulling in React.
   ============================================================ */

export type Screen = "hub" | "wizard" | "quiz" | "results" | "profile" | "manager" | "settings";

export type TrainingMode = "full" | "quick" | "mistakes";

export type UserRole = "trainee" | "manager";

export interface TrainingConfig {
  mode: TrainingMode;
  questionCount: number;
  /** Seconds per question; 0 means untimed. */
  timePerQuestion: number;
  arenaId: string | null;
  arenaName: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  coach?: string;
  arena: string;
  difficulty?: "easy" | "medium" | "hard";
}

export interface Arena {
  id: string;
  name: string;
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
}

export interface QuestionBankEntry {
  id?: string;
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  coachNote?: string;
  difficulty?: "easy" | "medium" | "hard" | string;
  status?: string;
}

export interface QuestionBankCategory {
  icon?: string;
  product?: string;
  nextStep?: string;
  painPoints?: string[];
  questions?: QuestionBankEntry[];
}

export interface QuestionBankData {
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
export type PublicAuthUser = Pick<AuthUserAccount, "id" | "name" | "email" | "role">;
