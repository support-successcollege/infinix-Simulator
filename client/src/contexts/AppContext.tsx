/* ============================================================
   AppContext — InfinityCloser Global State
   Manages: auth, current screen, training config, quiz state

   Persistence note: this app has no server. Accounts, history and
   preferences all live in the visitor's own localStorage, which
   means they are per-browser and per-device. See docs/SECURITY.md
   for what that does and does not guarantee.
   ============================================================ */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createCredential,
  isCryptoAvailable,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth";
import { DEMO_ARENAS, getDemoQuestions } from "@/lib/demoContent";
import {
  buildArenas,
  calculateScore,
  parseAnyQuestionBank,
  pickQuestions,
  toQuizQuestions,
} from "@/lib/questionBank";
import { STORAGE_KEYS, isStorageAvailable, readJson, removeKey, writeJson } from "@/lib/storage";
import type {
  Arena,
  AuthUserAccount,
  PublicAuthUser,
  Question,
  QuestionBankData,
  QuizAnswer,
  QuizSession,
  Screen,
  TrainingConfig,
  User,
  UserRole,
} from "@/types/app";

export type {
  Arena,
  Question,
  QuestionBankCategory,
  QuestionBankData,
  QuestionBankEntry,
  QuizAnswer,
  QuizSession,
  Screen,
  TrainingConfig,
  TrainingMode,
  User,
} from "@/types/app";

// ── Bootstrap admin ────────────────────────────────────────────
// Sourced from build-time env so the credential is not committed.
// On a static build these values still end up inside the JS bundle
// — the real protection is that `mustChangePassword` forces this
// password to be rotated the first time it is used.
const BOOTSTRAP_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "support@successcollege.co.il")
  .trim()
  .toLowerCase();
const BOOTSTRAP_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "infinix-setup-2024";

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  mode: "full",
  questionCount: 10,
  timePerQuestion: 60,
  arenaId: null,
  arenaName: "",
};

// ── Helpers ────────────────────────────────────────────────────

/** Midnight on the most recent Sunday — the Israeli week boundary. */
function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function sanitizeRole(role: unknown): UserRole {
  return role === "manager" ? "manager" : "trainee";
}

/**
 * Rehydrate stored sessions, dropping anything malformed.
 * Old builds wrote Date objects, which JSON turns into strings —
 * both round-trip fine because the type is now `string`.
 */
function reviveSessions(raw: unknown): QuizSession[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is QuizSession => !!s && typeof s === "object")
    .map(s => ({
      ...s,
      startTime: typeof s.startTime === "string" ? s.startTime : new Date().toISOString(),
      endTime: typeof s.endTime === "string" ? s.endTime : undefined,
      questions: Array.isArray(s.questions) ? s.questions : [],
      answers: Array.isArray(s.answers) ? s.answers : [],
      score: Number.isFinite(s.score) ? s.score : 0,
      isDemo: !!s.isDemo,
    }))
    .filter(s => s.id && s.arenaName);
}

// ── Context shape ──────────────────────────────────────────────

export interface LoginResult {
  ok: boolean;
  error?: string;
  /** True when this account is still on its bootstrap password. */
  mustChangePassword?: boolean;
}

interface AppContextValue {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  /** False until stored accounts have been loaded and migrated. */
  authReady: boolean;
  /** True while the signed-in user is still on the bootstrap password. */
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateUserProfile: (patch: Partial<Pick<User, "name" | "weeklyGoal">>) => void;
  authUsers: PublicAuthUser[];
  createAuthUser: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
  updateAuthUserRole: (userId: string, role: UserRole) => void;
  deleteAuthUser: (userId: string) => void;

  // Navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Training config
  trainingConfig: TrainingConfig;
  setTrainingConfig: (config: Partial<TrainingConfig>) => void;

  // Arenas / content
  arenas: Arena[];
  questionBankLoaded: boolean;
  /** True when the arenas and questions on screen are placeholders. */
  isDemoContent: boolean;
  questionBankData: QuestionBankData | null;
  importQuestionBank: (file: File) => Promise<void>;
  importQuestionBankCategories: (file: File) => Promise<void>;
  clearImportedQuestionBank: () => void;
  replaceQuestionBank: (data: QuestionBankData) => void;
  deleteQuestionBankCategory: (categoryName: string) => void;
  resetQuestionBankContent: () => Promise<void>;

  // Quiz
  currentSession: QuizSession | null;
  startQuiz: () => { ok: boolean; error?: string };
  submitAnswer: (selectedIndex: number, timeSpent: number) => void;
  nextQuestion: () => void;
  currentQuestionIndex: number;
  currentQuestion: Question | null;
  lastAnswer: QuizAnswer | null;
  isShowingFeedback: boolean;

  // Sessions history
  sessions: QuizSession[];
  resetSessions: () => void;
  /** Completed sessions since the start of the current week. */
  weeklyProgress: number;

  // Environment
  storageAvailable: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authUsers, setAuthUsers] = useState<AuthUserAccount[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(() =>
    readJson<User | null>(STORAGE_KEYS.session, null)
  );
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<Screen>("hub");
  const [sessions, setSessions] = useState<QuizSession[]>(() =>
    reviveSessions(readJson<unknown>(STORAGE_KEYS.history, []))
  );
  const [questionBank, setQuestionBank] = useState<QuestionBankData | null>(null);

  const [trainingConfig, setTrainingConfigState] = useState<TrainingConfig>(() => ({
    ...DEFAULT_TRAINING_CONFIG,
    ...readJson<Partial<TrainingConfig>>(STORAGE_KEYS.trainingConfig, {}),
  }));

  const [currentSession, setCurrentSession] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<QuizAnswer | null>(null);
  const [isShowingFeedback, setIsShowingFeedback] = useState(false);

  const storageAvailable = useMemo(() => isStorageAvailable(), []);

  // ── Persistence ──────────────────────────────────────────────

  useEffect(() => {
    if (!authReady) return; // Don't clobber stored accounts with the empty initial state.
    writeJson(STORAGE_KEYS.authUsers, authUsers);
  }, [authUsers, authReady]);

  useEffect(() => {
    if (user) writeJson(STORAGE_KEYS.session, user);
    else removeKey(STORAGE_KEYS.session);
  }, [user]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.history, sessions);
  }, [sessions]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.trainingConfig, trainingConfig);
  }, [trainingConfig]);

  // ── Account bootstrap + migration ────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const stored = readJson<unknown[]>(STORAGE_KEYS.authUsers, []);

      if (Array.isArray(stored) && stored.length > 0) {
        const normalized = stored
          .map(raw => {
            const u = raw as Partial<AuthUserAccount>;
            return {
              id: String(u.id || ""),
              name: String(u.name || "").trim(),
              email: String(u.email || "").trim().toLowerCase(),
              salt: String(u.salt || ""),
              passwordHash: String(u.passwordHash || ""),
              role: sanitizeRole(u.role),
              createdAt: String(u.createdAt || new Date().toISOString()),
              mustChangePassword: !!u.mustChangePassword,
            } satisfies AuthUserAccount;
          })
          .filter(u => u.id && u.name && u.email && u.salt && u.passwordHash);

        if (normalized.length > 0) {
          if (!cancelled) {
            setAuthUsers(normalized);
            setAuthReady(true);
          }
          return;
        }
      }

      // Migrate v1 accounts, which stored passwords as plaintext.
      const legacy = readJson<Array<Record<string, unknown>>>(STORAGE_KEYS.legacyAuthUsers, []);
      if (Array.isArray(legacy) && legacy.length > 0 && isCryptoAvailable()) {
        try {
          const migrated = await Promise.all(
            legacy
              .filter(u => u.email && u.password)
              .map(async u => {
                const { salt, passwordHash } = await createCredential(String(u.password));
                return {
                  id: String(u.id || `u-${crypto.randomUUID()}`),
                  name: String(u.name || "").trim() || String(u.email),
                  email: String(u.email).trim().toLowerCase(),
                  salt,
                  passwordHash,
                  role: sanitizeRole(u.role),
                  createdAt: new Date().toISOString(),
                  mustChangePassword: false,
                } satisfies AuthUserAccount;
              })
          );
          if (migrated.length > 0) {
            // Drop the plaintext copy now that hashes exist.
            removeKey(STORAGE_KEYS.legacyAuthUsers);
            if (!cancelled) {
              setAuthUsers(migrated);
              setAuthReady(true);
            }
            return;
          }
        } catch (err) {
          console.warn("[auth] legacy migration failed", err);
        }
      }

      // Fresh install: seed the single bootstrap admin.
      if (!isCryptoAvailable()) {
        console.error("[auth] Web Crypto unavailable — sign-in requires HTTPS or localhost");
        if (!cancelled) setAuthReady(true);
        return;
      }

      const { salt, passwordHash } = await createCredential(BOOTSTRAP_PASSWORD);
      if (cancelled) return;
      setAuthUsers([
        {
          id: "u-admin",
          name: "Support Admin",
          email: BOOTSTRAP_EMAIL,
          salt,
          passwordHash,
          role: "manager",
          createdAt: new Date().toISOString(),
          mustChangePassword: true,
        },
      ]);
      setAuthReady(true);
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // A stored session is meaningless if its account is gone.
  useEffect(() => {
    if (!authReady || !user) return;
    const account = authUsers.find(a => a.id === user.id);
    if (!account) {
      setUser(null);
      return;
    }
    setMustChangePassword(!!account.mustChangePassword);
    if (account.role !== user.role) {
      setUser(prev => (prev ? { ...prev, role: account.role } : prev));
    }
  }, [authReady, authUsers, user]);

  // ── Question bank loading ────────────────────────────────────

  const getQuestionBankEndpoints = useCallback(() => {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return [
      "/api/question-bank",
      `${normalizedBase}question_bank_infinitycloser.json`,
      "question_bank_infinitycloser.json",
    ];
  }, []);

  const fetchQuestionBank = useCallback(async (): Promise<QuestionBankData | null> => {
    for (const url of getQuestionBankEndpoints()) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const parsed = parseAnyQuestionBank(await res.json());
        if (parsed) return parsed;
      } catch {
        // Try the next source.
      }
    }
    return null;
  }, [getQuestionBankEndpoints]);

  useEffect(() => {
    let cancelled = false;

    const loadBank = async () => {
      const storedRaw = readJson<unknown>(STORAGE_KEYS.questionBank, null);
      if (storedRaw) {
        const parsed = parseAnyQuestionBank(storedRaw);
        if (parsed && !cancelled) {
          setQuestionBank(parsed);
          return;
        }
      }
      const fetched = await fetchQuestionBank();
      if (fetched && !cancelled) setQuestionBank(fetched);
    };

    loadBank();
    return () => {
      cancelled = true;
    };
  }, [fetchQuestionBank]);

  // ── Derived content ──────────────────────────────────────────

  const realArenas = useMemo(() => buildArenas(questionBank), [questionBank]);

  // A bank with zero usable questions is no better than no bank at
  // all, so fall through to demo content rather than showing an
  // arena list that can't start a quiz.
  const isDemoContent = useMemo(
    () => realArenas.every(a => a.questionCount === 0),
    [realArenas]
  );

  const arenas = useMemo(
    () => (isDemoContent ? DEMO_ARENAS : realArenas),
    [isDemoContent, realArenas]
  );

  const weeklyProgress = useMemo(() => {
    const weekStart = startOfWeek().getTime();
    return sessions.filter(s => s.endTime && new Date(s.startTime).getTime() >= weekStart).length;
  }, [sessions]);

  // ── Auth actions ─────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      if (!isCryptoAvailable()) {
        return { ok: false, error: "נדרש חיבור מאובטח (HTTPS) כדי להתחבר" };
      }

      const normalizedEmail = String(email || "").trim().toLowerCase();
      const account = authUsers.find(a => a.email === normalizedEmail);

      // Hash even when the account is missing, so a wrong email and a
      // wrong password take the same amount of time to reject.
      const probe = account ?? {
        salt: "00000000000000000000000000000000",
        passwordHash: "",
      };
      const matched = await verifyPassword(password, probe.salt, probe.passwordHash);

      if (!account || !matched) {
        return { ok: false, error: "מייל או סיסמה שגויים" };
      }

      setUser({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        joinDate: account.createdAt,
        weeklyGoal: 5,
      });
      setMustChangePassword(!!account.mustChangePassword);
      setCurrentScreen("hub");
      return { ok: true, mustChangePassword: !!account.mustChangePassword };
    },
    [authUsers]
  );

  const logout = useCallback(() => {
    setUser(null);
    setMustChangePassword(false);
    setCurrentSession(null);
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
    setCurrentScreen("hub");
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error("אין משתמש מחובר");

      const account = authUsers.find(a => a.id === user.id);
      if (!account) throw new Error("חשבון המשתמש לא נמצא");

      const ok = await verifyPassword(currentPassword, account.salt, account.passwordHash);
      if (!ok) throw new Error("הסיסמה הנוכחית שגויה");

      const weakness = validatePasswordStrength(newPassword);
      if (weakness) throw new Error(weakness);
      if (currentPassword === newPassword) throw new Error("הסיסמה החדשה זהה לנוכחית");

      const { salt, passwordHash } = await createCredential(newPassword);
      setAuthUsers(prev =>
        prev.map(a =>
          a.id === user.id ? { ...a, salt, passwordHash, mustChangePassword: false } : a
        )
      );
      setMustChangePassword(false);
    },
    [authUsers, user]
  );

  const updateUserProfile = useCallback(
    (patch: Partial<Pick<User, "name" | "weeklyGoal">>) => {
      setUser(prev => (prev ? { ...prev, ...patch } : prev));
      if (patch.name) {
        setAuthUsers(prev =>
          prev.map(a => (a.id === user?.id ? { ...a, name: patch.name! } : a))
        );
      }
    },
    [user?.id]
  );

  // Validation happens BEFORE setState. React may invoke a state
  // updater more than once (StrictMode, concurrent re-render), so
  // throwing from inside one is neither reliable nor catchable at
  // the call site.
  const createAuthUser = useCallback(
    async (payload: { name: string; email: string; password: string; role: UserRole }) => {
      const name = String(payload.name || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "");

      if (!name || !email || !password) throw new Error("יש למלא שם, מייל וסיסמה");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("כתובת המייל אינה תקינה");
      if (authUsers.some(u => u.email === email)) throw new Error("קיים כבר משתמש עם המייל הזה");

      const weakness = validatePasswordStrength(password);
      if (weakness) throw new Error(weakness);
      if (!isCryptoAvailable()) throw new Error("נדרש חיבור מאובטח (HTTPS) ליצירת משתמש");

      const { salt, passwordHash } = await createCredential(password);
      setAuthUsers(prev => {
        // Re-check inside the updater in case two adds raced.
        if (prev.some(u => u.email === email)) return prev;
        return [
          ...prev,
          {
            id: `u-${crypto.randomUUID()}`,
            name,
            email,
            salt,
            passwordHash,
            role: sanitizeRole(payload.role),
            createdAt: new Date().toISOString(),
          },
        ];
      });
    },
    [authUsers]
  );

  const updateAuthUserRole = useCallback(
    (userId: string, role: UserRole) => {
      const current = authUsers.find(u => u.id === userId);
      if (!current) throw new Error("המשתמש לא נמצא");
      if (current.role === "manager" && role !== "manager") {
        const managerCount = authUsers.filter(u => u.role === "manager").length;
        if (managerCount <= 1) throw new Error("חייב להישאר לפחות משתמש הנהלה אחד");
      }
      setAuthUsers(prev => prev.map(u => (u.id === userId ? { ...u, role } : u)));
    },
    [authUsers]
  );

  const deleteAuthUser = useCallback(
    (userId: string) => {
      const target = authUsers.find(u => u.id === userId);
      if (!target) throw new Error("המשתמש לא נמצא");
      if (user?.id === userId) throw new Error("לא ניתן למחוק את המשתמש שמחובר כרגע");
      if (target.role === "manager") {
        const managerCount = authUsers.filter(u => u.role === "manager").length;
        if (managerCount <= 1) throw new Error("לא ניתן למחוק את משתמש ההנהלה האחרון");
      }
      setAuthUsers(prev => prev.filter(u => u.id !== userId));
    },
    [authUsers, user?.id]
  );

  // ── Navigation / config ──────────────────────────────────────

  const setTrainingConfig = useCallback((config: Partial<TrainingConfig>) => {
    setTrainingConfigState(prev => ({ ...prev, ...config }));
  }, []);

  const setScreen = useCallback((screen: Screen) => setCurrentScreen(screen), []);

  // ── Question bank management ─────────────────────────────────

  const persistBank = useCallback((next: QuestionBankData) => {
    const saved = writeJson(STORAGE_KEYS.questionBank, next);
    if (!saved) {
      console.warn("[bank] could not persist question bank; changes are session-only");
    }
    return saved;
  }, []);

  const importQuestionBank = useCallback(
    async (file: File) => {
      const parsed = parseAnyQuestionBank(JSON.parse(await file.text()));
      if (!parsed) throw new Error("מבנה JSON לא תקין");
      setQuestionBank(parsed);
      persistBank(parsed);
    },
    [persistBank]
  );

  const importQuestionBankCategories = useCallback(
    async (file: File) => {
      const parsed = parseAnyQuestionBank(JSON.parse(await file.text()));
      if (!parsed?.categories || Object.keys(parsed.categories).length === 0) {
        throw new Error("לא נמצאו קטגוריות תקינות בקובץ");
      }
      setQuestionBank(prev => {
        const next: QuestionBankData = {
          categories: { ...(prev?.categories || {}), ...parsed.categories },
        };
        persistBank(next);
        return next;
      });
    },
    [persistBank]
  );

  const replaceQuestionBank = useCallback(
    (data: QuestionBankData) => {
      const parsed = parseAnyQuestionBank(data);
      if (!parsed) throw new Error("מבנה JSON לא תקין");
      setQuestionBank(parsed);
      persistBank(parsed);
    },
    [persistBank]
  );

  const clearImportedQuestionBank = useCallback(() => {
    removeKey(STORAGE_KEYS.questionBank);
    setQuestionBank(null);
  }, []);

  const deleteQuestionBankCategory = useCallback(
    (categoryName: string) => {
      if (!categoryName) return;
      setQuestionBank(prev => {
        const current = prev?.categories || {};
        if (!current[categoryName]) return prev;
        const nextCategories = { ...current };
        delete nextCategories[categoryName];
        const next: QuestionBankData = { categories: nextCategories };
        persistBank(next);
        return next;
      });
    },
    [persistBank]
  );

  const resetQuestionBankContent = useCallback(async () => {
    removeKey(STORAGE_KEYS.questionBank);
    setQuestionBank(await fetchQuestionBank());
  }, [fetchQuestionBank]);

  // ── Quiz flow ────────────────────────────────────────────────

  const startQuiz = useCallback((): { ok: boolean; error?: string } => {
    const arena = arenas.find(a => a.id === trainingConfig.arenaId);
    const arenaName = arena?.name || trainingConfig.arenaName || "כללי";
    const targetCount = Math.max(1, Math.min(30, trainingConfig.questionCount));

    const bankQuestions = isDemoContent
      ? []
      : toQuizQuestions(questionBank?.categories?.[arenaName]?.questions, arenaName);

    const usingDemo = bankQuestions.length === 0;
    let pool: Question[] = usingDemo ? getDemoQuestions(arenaName) : bankQuestions;

    if (trainingConfig.mode === "mistakes") {
      const wrongIds = new Set<string>();
      sessions.forEach(s => s.answers.forEach(a => !a.isCorrect && wrongIds.add(a.questionId)));
      const mistakesPool = pool.filter(q => wrongIds.has(q.id));
      if (mistakesPool.length === 0) {
        return { ok: false, error: "אין עדיין שאלות שטעית בהן בזירה הזו" };
      }
      pool = mistakesPool;
    }

    const questions = pickQuestions(pool, targetCount);
    if (questions.length === 0) {
      return { ok: false, error: "לא נמצאו שאלות זמינות בזירה הזו" };
    }

    setCurrentSession({
      id: `s-${crypto.randomUUID()}`,
      arenaName,
      mode: trainingConfig.mode,
      questions,
      answers: [],
      startTime: new Date().toISOString(),
      score: 0,
      isDemo: usingDemo,
    });
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
    setCurrentScreen("quiz");
    return { ok: true };
  }, [arenas, isDemoContent, questionBank, sessions, trainingConfig]);

  // Guards double submission when the timer fires at the same moment
  // the trainee clicks an answer.
  const answeredIndexRef = useRef<number | null>(null);

  useEffect(() => {
    answeredIndexRef.current = null;
  }, [currentQuestionIndex, currentSession?.id]);

  const submitAnswer = useCallback(
    (selectedIndex: number, timeSpent: number) => {
      if (answeredIndexRef.current === currentQuestionIndex) return;

      const question = currentSession?.questions[currentQuestionIndex];
      if (!question) return;

      answeredIndexRef.current = currentQuestionIndex;
      const answer: QuizAnswer = {
        questionId: question.id,
        selectedIndex,
        isCorrect: selectedIndex === question.correctIndex,
        timeSpent,
      };

      setLastAnswer(answer);
      setIsShowingFeedback(true);
      setCurrentSession(prev => (prev ? { ...prev, answers: [...prev.answers, answer] } : prev));
    },
    [currentSession, currentQuestionIndex]
  );

  const nextQuestion = useCallback(() => {
    if (!currentSession) return;
    const nextIdx = currentQuestionIndex + 1;

    if (nextIdx < currentSession.questions.length) {
      setCurrentQuestionIndex(nextIdx);
      setLastAnswer(null);
      setIsShowingFeedback(false);
      return;
    }

    const correctCount = currentSession.answers.filter(a => a.isCorrect).length;
    const finished: QuizSession = {
      ...currentSession,
      endTime: new Date().toISOString(),
      score: calculateScore(correctCount, currentSession.questions.length),
    };

    setCurrentSession(finished);
    setSessions(prev => [finished, ...prev]);
    setCurrentScreen("results");
  }, [currentSession, currentQuestionIndex]);

  const resetSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
  }, []);

  const currentQuestion = currentSession?.questions[currentQuestionIndex] ?? null;

  const publicAuthUsers = useMemo<PublicAuthUser[]>(
    () => authUsers.map(({ id, name, email, role }) => ({ id, name, email, role })),
    [authUsers]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      authReady,
      mustChangePassword,
      login,
      logout,
      changePassword,
      updateUserProfile,
      authUsers: publicAuthUsers,
      createAuthUser,
      updateAuthUserRole,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      questionBankLoaded: !!questionBank && !isDemoContent,
      isDemoContent,
      questionBankData: questionBank,
      importQuestionBank,
      importQuestionBankCategories,
      clearImportedQuestionBank,
      replaceQuestionBank,
      deleteQuestionBankCategory,
      resetQuestionBankContent,
      currentSession,
      startQuiz,
      submitAnswer,
      nextQuestion,
      currentQuestionIndex,
      currentQuestion,
      lastAnswer,
      isShowingFeedback,
      sessions,
      resetSessions,
      weeklyProgress,
      storageAvailable,
    }),
    [
      user,
      authReady,
      mustChangePassword,
      login,
      logout,
      changePassword,
      updateUserProfile,
      publicAuthUsers,
      createAuthUser,
      updateAuthUserRole,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      questionBank,
      isDemoContent,
      importQuestionBank,
      importQuestionBankCategories,
      clearImportedQuestionBank,
      replaceQuestionBank,
      deleteQuestionBankCategory,
      resetQuestionBankContent,
      currentSession,
      startQuiz,
      submitAnswer,
      nextQuestion,
      currentQuestionIndex,
      currentQuestion,
      lastAnswer,
      isShowingFeedback,
      sessions,
      resetSessions,
      weeklyProgress,
      storageAvailable,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export { DEMO_ARENAS };
