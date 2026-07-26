/* ============================================================
   AppContext — auth, navigation, training config, quiz session

   Content no longer lives here. It is owned by ContentProvider and
   reached through `useContent()`. Deleted from this file:

     • DEMO_ARENAS            12 arenas with fabricated question counts
     • generateQuestions      10 hardcoded sales questions served as
                              the silent fallback whenever content
                              failed to load — which was always
     • parseQuestionBank      runtime schema guessing, now build-time
     • parseLegacyMergedExamSchema   → scripts/content/import-legacy.ts
     • pickQuestions          padded small pools by cycling, so one
                              quiz could contain the same question
                              three times with the same id
     • getQuestionBankEndpoints      three-URL fallback chain

   This provider is being split (auth → AuthProvider, quiz →
   QuizProvider). Until that lands, treat it as frozen: no new code
   here — that is how it reached 913 lines.
   ============================================================ */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useContent } from "@/content/ContentProvider";
import type { Difficulty, Question } from "@/content/types";

export type { Question };

// ── Types ──────────────────────────────────────────────────────

export type Screen = "hub" | "wizard" | "quiz" | "results" | "profile" | "manager" | "settings";

export type TrainingMode = "full" | "quick" | "mistakes";

export interface TrainingConfig {
  mode: TrainingMode;
  questionCount: number;
  timePerQuestion: number; // seconds
  arenaId: string | null;
  arenaName: string;
}

/**
 * A subject as the screens currently consume it. This is a shim over
 * `SubjectSummary` while screens migrate to the subject/topic model.
 * Unlike the old DEMO_ARENAS, every number here is real.
 */
export interface Arena {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
  category: string;
  summary: string;
  /** Derived from the actual difficulty mix, not from how many questions exist. */
  difficultyLabel: string;
}

export interface QuizAnswer {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timeSpent: number;
}

export interface QuizSession {
  id: string;
  arenaName: string;
  subjectId: string;
  mode: TrainingMode;
  questions: Question[];
  answers: QuizAnswer[];
  startTime: Date;
  endTime?: Date;
  score: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "trainee" | "manager";
  avatar?: string;
  joinDate: Date;
  weeklyGoal: number;
}

interface AuthUserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "trainee" | "manager";
}

const AUTH_USERS_STORAGE_KEY = "ic_auth_users_v1";

/**
 * There is no seeded account.
 *
 * This used to be `support@successcollege.co.il` / `123456`, hardcoded
 * here and therefore compiled into the public bundle — anyone who
 * opened DevTools on the live site had manager access. Moving it to a
 * build-time env var would not have fixed that: Vite inlines VITE_*
 * values, so the credential would still ship.
 *
 * Instead the first visit asks the manager to create the account, so
 * no credential exists in the repository or the bundle. This is still
 * not real authentication — client-side auth never is, and the account
 * lives only in this browser — but nothing secret is published.
 */
function getDefaultAuthUsers(): AuthUserAccount[] {
  return [];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "קל",
  medium: "בינוני",
  hard: "קשה",
};

/** The dominant difficulty in a subject, or "—" when it has no questions. */
function describeDifficulty(mix: Record<Difficulty, number>): string {
  const entries = (Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map(
    d => [d, mix[d] ?? 0] as const
  );
  const total = entries.reduce((n, [, c]) => n + c, 0);
  if (total === 0) return "—";
  const [top] = entries.slice().sort((a, b) => b[1] - a[1]);
  return DIFFICULTY_LABEL[top[0]];
}

// ── Context ────────────────────────────────────────────────────

interface AppContextValue {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, name?: string) => boolean;
  logout: () => void;
  updateUserProfile: (patch: Partial<Pick<User, "name" | "weeklyGoal">>) => void;
  /** True on first run: no accounts exist yet, so one must be created. */
  needsSetup: boolean;
  completeSetup: (payload: { name: string; email: string; password: string }) => void;
  authUsers: Array<Pick<AuthUserAccount, "id" | "name" | "email" | "role">>;
  createAuthUser: (payload: {
    name: string;
    email: string;
    password: string;
    role: "trainee" | "manager";
  }) => void;
  updateAuthUserRole: (userId: string, role: "trainee" | "manager") => void;
  deleteAuthUser: (userId: string) => void;

  // Navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Training config
  trainingConfig: TrainingConfig;
  setTrainingConfig: (config: Partial<TrainingConfig>) => void;

  // Subjects (as arenas, during migration)
  arenas: Arena[];
  contentStatus: "loading" | "ready" | "error";
  contentError: string | null;

  // Quiz
  currentSession: QuizSession | null;
  startQuiz: () => Promise<void>;
  isStartingQuiz: boolean;
  startQuizError: string | null;
  submitAnswer: (selectedIndex: number, timeSpent: number) => void;
  nextQuestion: () => void;
  currentQuestionIndex: number;
  currentQuestion: Question | null;
  lastAnswer: QuizAnswer | null;
  isShowingFeedback: boolean;

  // Sessions history
  sessions: QuizSession[];
  resetSessions: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const content = useContent();

  const [authUsers, setAuthUsers] = useState<AuthUserAccount[]>(() => {
    try {
      const raw = localStorage.getItem(AUTH_USERS_STORAGE_KEY);
      if (!raw) return getDefaultAuthUsers();
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultAuthUsers();
      const normalized = parsed
        .map((u: Partial<AuthUserAccount>): AuthUserAccount => {
          const role: "trainee" | "manager" = u.role === "manager" ? "manager" : "trainee";
          return {
            id: String(u.id || `u-${Date.now()}`),
            name: String(u.name || "").trim(),
            email: String(u.email || "")
              .trim()
              .toLowerCase(),
            password: String(u.password || ""),
            role,
          };
        })
        .filter(u => u.name && u.email && u.password);
      return normalized.length > 0 ? normalized : getDefaultAuthUsers();
    } catch {
      return getDefaultAuthUsers();
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>("hub");
  const [sessions, setSessions] = useState<QuizSession[]>([]);

  const [trainingConfig, setTrainingConfigState] = useState<TrainingConfig>({
    mode: "full",
    questionCount: 10,
    timePerQuestion: 60,
    arenaId: null,
    arenaName: "",
  });

  const [currentSession, setCurrentSession] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<QuizAnswer | null>(null);
  const [isShowingFeedback, setIsShowingFeedback] = useState(false);
  const [isStartingQuiz, setIsStartingQuiz] = useState(false);
  const [startQuizError, setStartQuizError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(authUsers));
    } catch {
      /* Storage may be unavailable (private mode); accounts stay in memory. */
    }
  }, [authUsers]);

  /** Subjects with no published questions are not offered — there is nothing to practise. */
  const arenas = useMemo<Arena[]>(
    () =>
      content.subjects
        .filter(s => s.publishedCount > 0)
        .map(s => ({
          id: s.id,
          name: s.title,
          icon: s.icon,
          questionCount: s.publishedCount,
          category: s.description,
          summary: s.description,
          difficultyLabel: describeDifficulty(s.byDifficulty),
        })),
    [content.subjects]
  );

  const login = useCallback(
    (email: string, password: string, name?: string) => {
      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();
      const account = authUsers.find(a => a.email === normalizedEmail && a.password === password);
      if (!account) return false;
      setUser({
        id: account.id,
        name: name || account.name,
        email: normalizedEmail,
        role: account.role,
        joinDate: new Date(),
        weeklyGoal: 5,
      });
      setCurrentScreen("hub");
      return true;
    },
    [authUsers]
  );

  /**
   * Creates the first manager account and signs it in. It signs in here
   * rather than letting the caller call `login()` afterwards, because
   * `login` closes over `authUsers` and would not yet see the new account.
   */
  const completeSetup = useCallback(
    (payload: { name: string; email: string; password: string }) => {
      const name = payload.name.trim();
      const email = payload.email.trim().toLowerCase();
      const password = payload.password;
      if (!name || !email) throw new Error("יש למלא שם ומייל");
      if (password.length < 8) throw new Error("הסיסמה חייבת להכיל לפחות 8 תווים");

      const account: AuthUserAccount = { id: "u-admin", name, email, password, role: "manager" };
      setAuthUsers([account]);
      setUser({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        joinDate: new Date(),
        weeklyGoal: 5,
      });
      setCurrentScreen("hub");
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    setSessions([]);
    setCurrentSession(null);
    setCurrentScreen("hub");
  }, []);

  const updateUserProfile = useCallback((patch: Partial<Pick<User, "name" | "weeklyGoal">>) => {
    setUser(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Validation happens before setState. Throwing from inside an updater
  // (as this used to) means the caller's try/catch may never see it.
  const createAuthUser = useCallback(
    (payload: { name: string; email: string; password: string; role: "trainee" | "manager" }) => {
      const name = String(payload.name || "").trim();
      const email = String(payload.email || "")
        .trim()
        .toLowerCase();
      const password = String(payload.password || "");
      if (!name || !email || !password) throw new Error("יש למלא שם, מייל וסיסמה");
      if (authUsers.some(u => u.email === email)) throw new Error("קיים כבר משתמש עם המייל הזה");
      setAuthUsers(prev => [
        ...prev,
        { id: `u-${Date.now()}`, name, email, password, role: payload.role },
      ]);
    },
    [authUsers]
  );

  const updateAuthUserRole = useCallback(
    (userId: string, role: "trainee" | "manager") => {
      const current = authUsers.find(u => u.id === userId);
      if (!current) return;
      if (current.role === "manager" && role !== "manager") {
        if (authUsers.filter(u => u.role === "manager").length <= 1) {
          throw new Error("חייב להישאר לפחות משתמש הנהלה אחד");
        }
      }
      setAuthUsers(prev => prev.map(u => (u.id === userId ? { ...u, role } : u)));
    },
    [authUsers]
  );

  const deleteAuthUser = useCallback(
    (userId: string) => {
      const target = authUsers.find(u => u.id === userId);
      if (!target) return;
      if (target.role === "manager" && authUsers.filter(u => u.role === "manager").length <= 1) {
        throw new Error("לא ניתן למחוק את משתמש ההנהלה האחרון");
      }
      if (user?.id === userId) throw new Error("לא ניתן למחוק את המשתמש שמחובר כרגע");
      setAuthUsers(prev => prev.filter(u => u.id !== userId));
    },
    [authUsers, user?.id]
  );

  const setTrainingConfig = useCallback((config: Partial<TrainingConfig>) => {
    setTrainingConfigState(prev => ({ ...prev, ...config }));
  }, []);

  const setScreen = useCallback((screen: Screen) => {
    setCurrentScreen(screen);
  }, []);

  const startQuiz = useCallback(async () => {
    const arena = arenas.find(a => a.id === trainingConfig.arenaId);
    if (!arena) {
      setStartQuizError("לא נבחר מקצוע לתרגול");
      return;
    }

    setIsStartingQuiz(true);
    setStartQuizError(null);

    try {
      const pool = await content.getQuestions({ subjectId: arena.id });

      let candidates = pool;
      if (trainingConfig.mode === "mistakes" && sessions.length > 0) {
        const wrongIds = new Set<string>();
        for (const s of sessions) {
          for (const a of s.answers) if (!a.isCorrect) wrongIds.add(a.questionId);
        }
        const mistakes = pool.filter(q => wrongIds.has(q.id));
        if (mistakes.length > 0) candidates = mistakes;
      }

      // Return fewer rather than repeating. The old pickQuestions cycled the
      // pool to hit the requested count, so a 6-question topic asked for 20
      // produced each question 3-4 times, with duplicate ids.
      const target = Math.max(1, Math.min(50, trainingConfig.questionCount));
      const questions = shuffle(candidates).slice(0, target);

      if (questions.length === 0) {
        setStartQuizError(`אין כרגע שאלות זמינות ב"${arena.name}"`);
        return;
      }

      setCurrentSession({
        id: `s${Date.now()}`,
        arenaName: arena.name,
        subjectId: arena.id,
        mode: trainingConfig.mode,
        questions,
        answers: [],
        startTime: new Date(),
        score: 0,
      });
      setCurrentQuestionIndex(0);
      setLastAnswer(null);
      setIsShowingFeedback(false);
      setCurrentScreen("quiz");
    } catch (err) {
      setStartQuizError(err instanceof Error ? err.message : "טעינת השאלות נכשלה");
    } finally {
      setIsStartingQuiz(false);
    }
  }, [arenas, trainingConfig, sessions, content]);

  const submitAnswer = useCallback(
    (selectedIndex: number, timeSpent: number) => {
      if (!currentSession) return;
      const question = currentSession.questions[currentQuestionIndex];
      if (!question) return;

      const answer: QuizAnswer = {
        questionId: question.id,
        selectedIndex,
        isCorrect: selectedIndex === question.correctIndex,
        timeSpent,
      };

      setLastAnswer(answer);
      setIsShowingFeedback(true);
      setCurrentSession(prev => {
        if (!prev) return prev;
        // Guard against a double submit for the same question index.
        if (prev.answers.some(a => a.questionId === question.id)) return prev;
        return { ...prev, answers: [...prev.answers, answer] };
      });
    },
    [currentSession, currentQuestionIndex]
  );

  const nextQuestion = useCallback(() => {
    if (!currentSession) return;
    const nextIdx = currentQuestionIndex + 1;

    if (nextIdx >= currentSession.questions.length) {
      const correct = currentSession.answers.filter(a => a.isCorrect).length;
      const score = Math.round((correct / currentSession.questions.length) * 100);
      const finished: QuizSession = { ...currentSession, endTime: new Date(), score };
      setCurrentSession(finished);
      setSessions(prev => [finished, ...prev]);
      setCurrentScreen("results");
      return;
    }

    setCurrentQuestionIndex(nextIdx);
    setLastAnswer(null);
    setIsShowingFeedback(false);
  }, [currentSession, currentQuestionIndex]);

  const resetSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
  }, []);

  const currentQuestion = currentSession?.questions[currentQuestionIndex] ?? null;

  const publicAuthUsers = useMemo(
    () => authUsers.map(({ id, name, email, role }) => ({ id, name, email, role })),
    [authUsers]
  );

  // Memoized: this object has ~25 members and was previously rebuilt on every
  // render, so any state change re-rendered every consumer.
  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      login,
      logout,
      updateUserProfile,
      needsSetup: authUsers.length === 0,
      completeSetup,
      authUsers: publicAuthUsers,
      createAuthUser,
      updateAuthUserRole,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      contentStatus: content.status,
      contentError: content.error,
      currentSession,
      startQuiz,
      isStartingQuiz,
      startQuizError,
      submitAnswer,
      nextQuestion,
      currentQuestionIndex,
      currentQuestion,
      lastAnswer,
      isShowingFeedback,
      sessions,
      resetSessions,
    }),
    [
      user,
      login,
      logout,
      updateUserProfile,
      authUsers.length,
      completeSetup,
      publicAuthUsers,
      createAuthUser,
      updateAuthUserRole,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      content.status,
      content.error,
      currentSession,
      startQuiz,
      isStartingQuiz,
      startQuizError,
      submitAnswer,
      nextQuestion,
      currentQuestionIndex,
      currentQuestion,
      lastAnswer,
      isShowingFeedback,
      sessions,
      resetSessions,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
