/* ============================================================
   AppContext — InfinityCloser Global State
   Manages: auth, current screen, training config, quiz state

   Accounts live on the server (api/auth.ts): one user list for the
   whole site, so a user created once signs in from any device. The
   browser keeps only a signed session token. Training history and
   preferences still live in the visitor's own localStorage.
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

import { validatePasswordStrength } from "@/lib/auth";
import { fromBase64, gunzipJson, gzipJson, toBase64 } from "@/lib/bankCodec";
import {
  EMPTY_FILTERS,
  buildArenas,
  calculateScore,
  filterQuestions,
  parseAnyQuestionBank,
  pickQuestions,
  toQuizQuestions,
} from "@/lib/questionBank";
import { STORAGE_KEYS, isStorageAvailable, readJson, removeKey, writeJson } from "@/lib/storage";
import { buildExam, examFormat, openMistakes, type YearScope } from "@/lib/exam";
import { clearDraft, readDraft, saveDraft } from "@/lib/examDraft";
import type {
  Arena,
  PublicAuthUser,
  Question,
  QuestionBankData,
  QuestionFilters,
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
  QuestionFilters,
  QuizAnswer,
  QuizSession,
  Screen,
  TrainingConfig,
  TrainingMode,
  User,
} from "@/types/app";

// ── Accounts API ───────────────────────────────────────────────
/**
 * Sign-in and user management run on the server (api/auth.ts; in dev
 * the same service is mounted by vite.config.ts). Seed credentials are
 * read there from the server's environment and never reach the bundle.
 */
const AUTH_ENDPOINT = "/api/auth";

class AuthHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function authFetch<T>(
  action: string,
  options: { method?: string; body?: unknown; token?: string; id?: string } = {}
): Promise<T> {
  const params = new URLSearchParams({ action });
  if (options.id) params.set("id", options.id);
  let res: Response;
  try {
    res = await fetch(`${AUTH_ENDPOINT}?${params}`, {
      method: options.method || "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new AuthHttpError("אין חיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new AuthHttpError(data.error || "הפעולה נכשלה", res.status);
  return data as T;
}

interface ServerUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  mustChangePassword: boolean;
  arenas?: string[];
  source?: "lms";
}

// ── Practice history on the server ─────────────────────────────
/**
 * A finished session is kept on the server per user (api/history.ts),
 * so it follows the student to any device. Stored compact: question
 * ids rather than questions, which the bank already holds.
 */
const HISTORY_ENDPOINT = "/api/history";

interface StoredSession {
  id: string;
  arenaName: string;
  mode: string;
  questionIds: string[];
  answers: QuizAnswer[];
  startTime: string;
  endTime?: string;
  score: number;
}

function toStored(s: QuizSession): StoredSession {
  return {
    id: s.id,
    arenaName: s.arenaName,
    mode: s.mode,
    questionIds: s.questions.map(q => q.id),
    answers: s.answers,
    startTime: s.startTime,
    endTime: s.endTime,
    score: s.score,
  };
}

function fromStored(s: StoredSession): QuizSession {
  return {
    id: s.id,
    arenaName: s.arenaName,
    mode: (s.mode as QuizSession["mode"]) || "full",
    // Only ids are kept; screens that list past sessions need the count.
    questions: s.questionIds.map(id => ({ id, text: "", options: [], correctIndex: 0, explanation: "", arena: s.arenaName })),
    answers: s.answers,
    startTime: s.startTime,
    endTime: s.endTime,
    score: s.score,
    isDemo: false,
  };
}

/** A topic name as the learning system and the bank may each spell it. */
export function arenaKey(name: string): string {
  return String(name || "")
    .replace(/[\u05F3\u05F4'"`׳״]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Shared question bank ───────────────────────────────────────
/**
 * One bank for everyone, served by `api/question-bank.ts`. In dev the
 * same path is handled by a middleware in vite.config.ts, so the
 * publish flow can be exercised without deploying.
 */
const SHARED_BANK_ENDPOINT = "/api/question-bank";


/** Which of the layered sources produced the bank currently in use. */
export type BankSource = "shared" | "local" | "bundled" | "none";

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  mode: "full",
  questionCount: 10,
  timePerQuestion: 60,
  arenaId: null,
  arenaName: "",
  filters: EMPTY_FILTERS,
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
 * Rehydrate the stored training config. Configs written before the
 * practice filters shipped have no `filters` key at all — and a
 * half-written one could hold anything — so every axis is rebuilt
 * from scratch rather than trusted.
 */
function reviveTrainingConfig(raw: unknown): TrainingConfig {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Partial<TrainingConfig>;
  const storedFilters = (
    stored.filters && typeof stored.filters === "object" ? stored.filters : {}
  ) as Partial<QuestionFilters>;

  return {
    ...DEFAULT_TRAINING_CONFIG,
    ...stored,
    filters: {
      years: Array.isArray(storedFilters.years)
        ? storedFilters.years.map(Number).filter(Number.isFinite)
        : [],
      topics: Array.isArray(storedFilters.topics) ? storedFilters.topics.map(String) : [],
      qtypes: Array.isArray(storedFilters.qtypes) ? storedFilters.qtypes.map(String) : [],
      repeatedOnly: !!storedFilters.repeatedOnly,
    },
  };
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
  /** False until the stored session has been checked with the server. */
  authReady: boolean;
  /** True while the signed-in user is still on the bootstrap password. */
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Sign in with a launch link from the learning system. */
  loginWithLaunch: (launchToken: string) => Promise<LoginResult>;
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
  updateAuthUserRole: (userId: string, role: UserRole) => Promise<void>;
  updateAuthUserArenas: (userId: string, arenas: string[] | null) => Promise<void>;
  resetAuthUserPassword: (userId: string, password: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;

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
  /** The bank the manager edits and publishes (shared, local or bundled). */
  questionBankData: QuestionBankData | null;
  /** What trainees practise from: the same bank. */
  practiceBankData: QuestionBankData | null;
  importQuestionBank: (file: File) => Promise<void>;
  importQuestionBankCategories: (file: File) => Promise<void>;
  clearImportedQuestionBank: () => void;
  replaceQuestionBank: (data: QuestionBankData) => void;
  deleteQuestionBankCategory: (categoryName: string) => void;
  resetQuestionBankContent: () => Promise<void>;

  // Shared bank (published for every student)
  /** Which source produced the bank currently on screen. */
  bankSource: BankSource;
  /** True when a bank is published, regardless of what is on screen. */
  sharedBankExists: boolean;
  /** The manager's publish token, held for convenience only. */
  adminToken: string;
  setAdminToken: (token: string) => void;
  publishQuestionBank: (file: File) => Promise<void>;
  /** Publish the bank on screen, including unpublished edits. */
  publishCurrentBank: () => Promise<void>;
  /** True when this browser can publish: a manager session or the admin token. */
  canPublish: boolean;
  unpublishQuestionBank: () => Promise<void>;
  refreshQuestionBank: () => Promise<void>;

  // Quiz
  currentSession: QuizSession | null;
  /** Start practice; `override` is applied to the saved settings first. */
  startQuiz: (override?: Partial<TrainingConfig>) => { ok: boolean; error?: string };
  /** A full exam in the real format for the chosen arena. */
  startExam: (scope: YearScope) => { ok: boolean; error?: string };
  /** Back into the full exam left unfinished in this browser. */
  resumeExam: () => boolean;
  /** Hand in a full exam: the chosen option and seconds spent per question. */
  submitExam: (selections: number[], spent: number[]) => void;
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
  const [authUsers, setAuthUsers] = useState<PublicAuthUser[]>([]);
  const [authToken, setAuthToken] = useState<string>(() =>
    readJson<string>(STORAGE_KEYS.authToken, "")
  );
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
  const [bankSource, setBankSource] = useState<BankSource>("none");
  const [sharedBankExists, setSharedBankExists] = useState(false);
  const [adminToken, setAdminTokenState] = useState<string>(() =>
    readJson<string>(STORAGE_KEYS.adminToken, "")
  );

  const [trainingConfig, setTrainingConfigState] = useState<TrainingConfig>(() =>
    reviveTrainingConfig(readJson<unknown>(STORAGE_KEYS.trainingConfig, {}))
  );

  const [currentSession, setCurrentSession] = useState<QuizSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<QuizAnswer | null>(null);
  const [isShowingFeedback, setIsShowingFeedback] = useState(false);

  const storageAvailable = useMemo(() => isStorageAvailable(), []);

  // ── Persistence ──────────────────────────────────────────────

  useEffect(() => {
    if (authToken) writeJson(STORAGE_KEYS.authToken, authToken);
    else removeKey(STORAGE_KEYS.authToken);
  }, [authToken]);

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

  // ── Practice history ─────────────────────────────────────────
  // The server holds each user's history; it replaces whatever this
  // browser had, which may belong to someone else who used it before.
  const historyUserId = user?.id;
  useEffect(() => {
    if (!authToken || !historyUserId) return;
    let cancelled = false;
    fetch(HISTORY_ENDPOINT, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { sessions?: StoredSession[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.sessions)) return;
        setSessions(data.sessions.map(fromStored));
      })
      .catch(() => console.warn("[history] could not load history from the server"));
    return () => {
      cancelled = true;
    };
  }, [authToken, historyUserId]);

  // ── Session check ────────────────────────────────────────────
  // The stored user renders at once; the server then confirms the
  // token is still good (not expired, password not changed elsewhere,
  // account not deleted) and refreshes the role and name.

  const toUser = useCallback(
    (u: ServerUser, previous: User | null): User => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      joinDate: u.createdAt || previous?.joinDate || new Date().toISOString(),
      weeklyGoal: previous?.id === u.id ? previous.weeklyGoal : 5,
      ...(Array.isArray(u.arenas) ? { arenas: u.arenas } : {}),
      ...(u.source ? { source: u.source } : {}),
    }),
    []
  );

  // The token in use right now. The load-time check below must not act
  // on an answer about a token that was replaced meanwhile, as when a
  // sign-in from the learning system lands while the check is running.
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  useEffect(() => {
    let cancelled = false;
    const checked = authToken;
    const stale = () => cancelled || authTokenRef.current !== checked;
    // Accounts from the per-browser era are not carried over.
    removeKey(STORAGE_KEYS.authUsers);
    removeKey(STORAGE_KEYS.legacyAuthUsers);

    if (!authToken) {
      setUser(null);
      setAuthReady(true);
      return;
    }

    authFetch<{ user: ServerUser }>("me", { token: authToken })
      .then(({ user: fresh }) => {
        if (stale()) return;
        setUser(prev => toUser(fresh, prev));
        setMustChangePassword(!!fresh.mustChangePassword);
      })
      .catch(err => {
        if (stale()) return;
        // Offline or server trouble: keep the stored session. Rejected: sign out.
        if (err instanceof AuthHttpError && err.status !== 0 && err.status < 500) {
          setAuthToken("");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
    // Only on load: later token changes come from sign-in or a password change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Question bank loading ────────────────────────────────────

  /**
   * Where the active bank came from. Worth surfacing: a manager who
   * has a local override in this browser sees different questions
   * from the students reading the published one, and without a
   * readout that difference is invisible until someone complains.
   */
  const bundledBankUrls = useCallback(() => {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return [
      `${normalizedBase}question_bank_infinitycloser.json`,
      "question_bank_infinitycloser.json",
    ];
  }, []);

  /** The bank published for everyone, or null when none is set. */
  const fetchSharedBank = useCallback(async (): Promise<QuestionBankData | null> => {
    try {
      const res = await fetch(SHARED_BANK_ENDPOINT, { cache: "no-store" });
      if (!res.ok) return null;
      return parseAnyQuestionBank(await res.json());
    } catch {
      return null;
    }
  }, []);

  /** The copy compiled into the deployment. */
  const fetchBundledBank = useCallback(async (): Promise<QuestionBankData | null> => {
    for (const url of bundledBankUrls()) {
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
  }, [bundledBankUrls]);

  const loadQuestionBank = useCallback(async (): Promise<{
    bank: QuestionBankData | null;
    source: BankSource;
    sharedExists: boolean;
  }> => {
    const shared = await fetchSharedBank();

    // A local import wins for whoever set it — it was a deliberate
    // act in this browser — but the UI says so, and offers a way out.
    let storedRaw = readJson<unknown>(STORAGE_KEYS.questionBank, null);
    const storedGz = readJson<string>(STORAGE_KEYS.questionBankGz, "");
    if (storedGz) {
      try {
        storedRaw = await gunzipJson(fromBase64(storedGz));
      } catch {
        removeKey(STORAGE_KEYS.questionBankGz);
      }
    }
    if (storedRaw) {
      const parsed = parseAnyQuestionBank(storedRaw);
      if (parsed) return { bank: parsed, source: "local", sharedExists: Boolean(shared) };
    }

    if (shared) return { bank: shared, source: "shared", sharedExists: true };

    const bundled = await fetchBundledBank();
    return {
      bank: bundled,
      source: bundled ? "bundled" : "none",
      sharedExists: false,
    };
  }, [fetchSharedBank, fetchBundledBank]);

  // Trainees practise on the bank the manager edits and publishes.
  const practiceBank = questionBank;

  const refreshQuestionBank = useCallback(async () => {
    const { bank, source, sharedExists } = await loadQuestionBank();
    setQuestionBank(bank);
    setBankSource(source);
    setSharedBankExists(sharedExists);
  }, [loadQuestionBank]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { bank, source, sharedExists } = await loadQuestionBank();
      if (cancelled) return;
      setQuestionBank(bank);
      setBankSource(source);
      setSharedBankExists(sharedExists);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadQuestionBank]);

  // ── Derived content ──────────────────────────────────────────

  const realArenas = useMemo(() => buildArenas(practiceBank), [practiceBank]);

  // No usable questions at all: there is no placeholder content to
  // fall back on, so the UI shows a "load a question bank" notice and
  // an empty topic list instead. (The flag keeps its historical name.)
  const isDemoContent = useMemo(
    () => realArenas.every(a => a.questionCount === 0),
    [realArenas]
  );

  // A student sees the topics of the courses they hold. Managers, and
  // accounts with no topic list, see every topic.
  const arenas = useMemo(() => {
    if (isDemoContent) return [];
    if (user?.role === "manager" || !Array.isArray(user?.arenas)) return realArenas;
    const allowed = new Set(user!.arenas.map(arenaKey));
    return realArenas.filter(a => allowed.has(arenaKey(a.name)));
  }, [isDemoContent, realArenas, user]);

  // A topic chosen earlier that this user may not practise is cleared,
  // so the wizard does not show it as the current choice.
  useEffect(() => {
    if (!trainingConfig.arenaName || isDemoContent || !realArenas.length) return;
    if (arenas.some(a => a.name === trainingConfig.arenaName)) return;
    setTrainingConfigState(prev => ({ ...prev, arenaId: null, arenaName: "" }));
  }, [arenas, isDemoContent, realArenas.length, trainingConfig.arenaName]);

  const weeklyProgress = useMemo(() => {
    const weekStart = startOfWeek().getTime();
    return sessions.filter(s => s.endTime && new Date(s.startTime).getTime() >= weekStart).length;
  }, [sessions]);

  // ── Auth actions ─────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const { token, user: signedIn } = await authFetch<{ token: string; user: ServerUser }>("login", {
          method: "POST",
          body: { email, password },
        });
        setAuthToken(token);
        setUser(prev => toUser(signedIn, prev));
        setMustChangePassword(!!signedIn.mustChangePassword);
        setCurrentScreen("hub");
        return { ok: true, mustChangePassword: !!signedIn.mustChangePassword };
      } catch (err) {
        return { ok: false, error: (err as Error).message || "ההתחברות נכשלה" };
      }
    },
    [toUser]
  );

  /** Sign in with a launch link from the learning system. */
  const loginWithLaunch = useCallback(
    async (launchToken: string): Promise<LoginResult> => {
      try {
        const { token, user: signedIn } = await authFetch<{ token: string; user: ServerUser }>("sso", {
          method: "POST",
          body: { token: launchToken },
        });
        setAuthToken(token);
        setUser(prev => toUser(signedIn, prev?.id === signedIn.id ? prev : null));
        setMustChangePassword(false);
        setCurrentScreen("hub");
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message || "הכניסה נכשלה" };
      }
    },
    [toUser]
  );

  const logout = useCallback(() => {
    setAuthToken("");
    setAuthUsers([]);
    setSessions([]);
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
      if (!user || !authToken) throw new Error("אין משתמש מחובר");
      const weakness = validatePasswordStrength(newPassword);
      if (weakness) throw new Error(weakness);
      if (currentPassword === newPassword) throw new Error("הסיסמה החדשה זהה לנוכחית");

      const { token } = await authFetch<{ token: string }>("password", {
        method: "POST",
        token: authToken,
        body: { currentPassword, newPassword },
      });
      setAuthToken(token);
      setMustChangePassword(false);
    },
    [authToken, user]
  );

  // The display name is a local preference; the account name is what
  // a manager sets on the team screen.
  const updateUserProfile = useCallback(
    (patch: Partial<Pick<User, "name" | "weeklyGoal">>) => {
      setUser(prev => (prev ? { ...prev, ...patch } : prev));
    },
    []
  );

  const refreshAuthUsers = useCallback(async () => {
    if (!authToken || user?.role !== "manager") {
      setAuthUsers([]);
      return;
    }
    const { users } = await authFetch<{ users: ServerUser[] }>("users", { token: authToken });
    setAuthUsers(
      users.map(({ id, name, email, role, arenas, source }) => ({
        id,
        name,
        email,
        role,
        ...(Array.isArray(arenas) ? { arenas } : {}),
        ...(source ? { source } : {}),
      }))
    );
  }, [authToken, user?.role]);

  useEffect(() => {
    refreshAuthUsers().catch(err => console.warn("[auth] could not load users", err));
  }, [refreshAuthUsers]);

  const createAuthUser = useCallback(
    async (payload: { name: string; email: string; password: string; role: UserRole }) => {
      const name = String(payload.name || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "");
      if (!name || !email || !password) throw new Error("יש למלא שם, מייל וסיסמה");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("כתובת המייל אינה תקינה");
      const weakness = validatePasswordStrength(password);
      if (weakness) throw new Error(weakness);

      await authFetch("users", { method: "POST", token: authToken, body: { name, email, password, role: payload.role } });
      await refreshAuthUsers();
    },
    [authToken, refreshAuthUsers]
  );

  const updateAuthUserRole = useCallback(
    async (userId: string, role: UserRole) => {
      await authFetch("users", { method: "PATCH", token: authToken, id: userId, body: { role } });
      await refreshAuthUsers();
    },
    [authToken, refreshAuthUsers]
  );

  /** Topics a user may practise; null opens every topic. */
  const updateAuthUserArenas = useCallback(
    async (userId: string, arenas: string[] | null) => {
      await authFetch("users", { method: "PATCH", token: authToken, id: userId, body: { arenas } });
      await refreshAuthUsers();
    },
    [authToken, refreshAuthUsers]
  );

  const resetAuthUserPassword = useCallback(
    async (userId: string, password: string) => {
      const weakness = validatePasswordStrength(password);
      if (weakness) throw new Error(weakness);
      await authFetch("users", { method: "PATCH", token: authToken, id: userId, body: { password } });
    },
    [authToken]
  );

  const deleteAuthUser = useCallback(
    async (userId: string) => {
      if (user?.id === userId) throw new Error("לא ניתן למחוק את המשתמש שמחובר כרגע");
      await authFetch("users", { method: "DELETE", token: authToken, id: userId });
      await refreshAuthUsers();
    },
    [authToken, refreshAuthUsers, user?.id]
  );

  // ── Navigation / config ──────────────────────────────────────

  const setTrainingConfig = useCallback((config: Partial<TrainingConfig>) => {
    setTrainingConfigState(prev => ({ ...prev, ...config }));
  }, []);

  const setScreen = useCallback((screen: Screen) => setCurrentScreen(screen), []);

  // ── Question bank management ─────────────────────────────────

  /** Drops this browser's unpublished copy of the bank. */
  const clearLocalBank = useCallback(() => {
    removeKey(STORAGE_KEYS.questionBank);
    removeKey(STORAGE_KEYS.questionBankGz);
  }, []);

  // Kept gzipped: the full bank is about 10MB of JSON, more than
  // localStorage holds, and about 1.6MB compressed.
  const persistBank = useCallback((next: QuestionBankData) => {
    removeKey(STORAGE_KEYS.questionBank);
    void gzipJson(next)
      .then(bytes => {
        if (!writeJson(STORAGE_KEYS.questionBankGz, toBase64(bytes))) {
          console.warn("[bank] could not persist question bank; changes are session-only");
        }
      })
      .catch(err => console.warn("[bank] could not compress question bank", err));
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
    clearLocalBank();
    // Dropping the override falls back through the same ladder the
    // app boots with, rather than leaving the screen empty.
    void refreshQuestionBank();
  }, [clearLocalBank, refreshQuestionBank]);

  // ── Publishing ───────────────────────────────────────────────

  const setAdminToken = useCallback((token: string) => {
    const trimmed = token.trim();
    setAdminTokenState(trimmed);
    if (trimmed) writeJson(STORAGE_KEYS.adminToken, trimmed);
    else removeKey(STORAGE_KEYS.adminToken);
  }, []);

  /** Reads the server's Hebrew error text when it sent one. */
  const errorFrom = async (res: Response, fallback: string) => {
    try {
      const body = await res.json();
      return typeof body?.error === "string" ? body.error : fallback;
    } catch {
      return fallback;
    }
  };

  /** A manager's session, or the separate admin token, may publish. */
  const publishCredential = adminToken || (user?.role === "manager" ? authToken : "");

  /**
   * Publish a bank for every student. It is validated here first, so
   * an unusable bank is rejected before it can replace a working one,
   * and sent gzipped, which keeps the full bank under the 4.5MB a
   * Vercel Function accepts.
   */
  const sendBank = useCallback(
    async (raw: unknown) => {
      if (!publishCredential) throw new Error("יש להתחבר כמנהל או להזין טוקן ניהול כדי לפרסם");
      if (!parseAnyQuestionBank(raw)) throw new Error("מבנה JSON לא תקין");

      const body = await gzipJson(raw);
      const res = await fetch(SHARED_BANK_ENDPOINT, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Bank-Encoding": "gzip",
          Authorization: `Bearer ${publishCredential}`,
        },
        body: body as BodyInit,
      });
      if (!res.ok) throw new Error(await errorFrom(res, "פרסום המאגר נכשל"));

      // A local override would keep shadowing what was just published,
      // which is the one moment it must not: the manager needs to see
      // exactly what the students now see.
      clearLocalBank();
      await refreshQuestionBank();
    },
    [clearLocalBank, publishCredential, refreshQuestionBank]
  );

  const publishQuestionBank = useCallback(
    async (file: File) => sendBank(JSON.parse(await file.text())),
    [sendBank]
  );

  /** Publish what is on screen now, including unpublished edits. */
  const publishCurrentBank = useCallback(async () => {
    if (!questionBank) throw new Error("אין מאגר לפרסום");
    await sendBank(questionBank);
  }, [questionBank, sendBank]);

  const unpublishQuestionBank = useCallback(async () => {
    if (!publishCredential) throw new Error("יש להתחבר כמנהל או להזין טוקן ניהול");

    const res = await fetch(SHARED_BANK_ENDPOINT, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${publishCredential}` },
    });
    if (!res.ok) throw new Error(await errorFrom(res, "ביטול הפרסום נכשל"));

    await refreshQuestionBank();
  }, [publishCredential, refreshQuestionBank]);

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
    clearLocalBank();
    await refreshQuestionBank();
  }, [clearLocalBank, refreshQuestionBank]);

  // ── Quiz flow ────────────────────────────────────────────────

  const startQuiz = useCallback((override?: Partial<TrainingConfig>): { ok: boolean; error?: string } => {
    const config: TrainingConfig = { ...trainingConfig, ...override };
    if (override) setTrainingConfigState(config);
    // Only a topic this user may practise: a choice saved earlier, by
    // someone else on this browser or before access changed, is refused.
    const arena =
      arenas.find(a => a.id === config.arenaId) ?? arenas.find(a => a.name === config.arenaName);
    if (!arena && !isDemoContent) return { ok: false, error: "בחרו נושא מהרשימה" };
    const arenaName = arena?.name || config.arenaName || "כללי";
    const targetCount = Math.max(1, Math.min(30, config.questionCount));

    const bankQuestions = isDemoContent
      ? []
      : toQuizQuestions(practiceBank?.categories?.[arenaName]?.questions, arenaName);

    if (bankQuestions.length === 0) {
      return { ok: false, error: "לא נמצאו שאלות זמינות בנושא הזה" };
    }

    let pool: Question[] = filterQuestions(bankQuestions, config.filters);
    if (pool.length === 0) {
      return { ok: false, error: "אין שאלות שמתאימות לסינון שבחרת" };
    }

    if (config.mode === "mistakes") {
      // Wrong at some point and not yet right twice in a row since.
      const wrongIds = openMistakes(sessions, arenaName);
      const mistakesPool = pool.filter(q => wrongIds.has(q.id));
      if (mistakesPool.length === 0) {
        return { ok: false, error: "אין כרגע שאלות פתוחות לתיקון בנושא הזה" };
      }
      pool = mistakesPool;
    }

    const questions = pickQuestions(pool, targetCount);
    if (questions.length === 0) {
      return { ok: false, error: "לא נמצאו שאלות זמינות בנושא הזה" };
    }

    setCurrentSession({
      id: `s-${crypto.randomUUID()}`,
      arenaName,
      mode: config.mode,
      questions,
      answers: [],
      startTime: new Date().toISOString(),
      score: 0,
      isDemo: false,
    });
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
    setCurrentScreen("quiz");
    return { ok: true };
  }, [arenas, isDemoContent, practiceBank, sessions, trainingConfig]);

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

  /** Record a finished session here and on the server, and show its results. */
  const completeSession = useCallback(
    (finished: QuizSession) => {
      setCurrentSession(finished);
      setSessions(prev => [finished, ...prev.filter(p => p.id !== finished.id)]);
      setCurrentScreen("results");
      if (authToken && !finished.isDemo) {
        fetch(HISTORY_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ session: toStored(finished) }),
        }).catch(() => console.warn("[history] could not save the session to the server"));
      }
    },
    [authToken]
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
    completeSession({
      ...currentSession,
      endTime: new Date().toISOString(),
      score: calculateScore(correctCount, currentSession.questions.length),
    });
  }, [completeSession, currentSession, currentQuestionIndex]);

  // ── Full exam ────────────────────────────────────────────────

  const startExam = useCallback(
    (scope: YearScope): { ok: boolean; error?: string } => {
      const arena =
        arenas.find(a => a.name === trainingConfig.arenaName) ?? arenas.find(a => a.id === trainingConfig.arenaId);
      if (!arena) return { ok: false, error: "בחרו נושא מהרשימה" };
      const format = examFormat(arena.name);
      const pool = toQuizQuestions(practiceBank?.categories?.[arena.name]?.questions, arena.name);
      const questions = buildExam(pool, format, scope);
      if (questions.length === 0) return { ok: false, error: "לא נמצאו שאלות למבחן בנושא הזה" };

      const session: QuizSession = {
        id: `s-${crypto.randomUUID()}`,
        arenaName: arena.name,
        mode: "exam",
        questions,
        answers: [],
        startTime: new Date().toISOString(),
        score: 0,
        isDemo: false,
      };
      if (user) {
        saveDraft({
          userId: user.id,
          session,
          selections: questions.map(() => -1),
          flags: questions.map(() => false),
          spent: questions.map(() => 0),
          current: 0,
          deadline: Date.now() + format.minutes * 60_000,
          scope,
        });
      }
      setCurrentSession(session);
      setCurrentScreen("exam");
      return { ok: true };
    },
    [arenas, practiceBank, trainingConfig.arenaId, trainingConfig.arenaName, user]
  );

  const resumeExam = useCallback((): boolean => {
    const draft = readDraft(user?.id);
    if (!draft) return false;
    setCurrentSession(draft.session);
    setCurrentScreen("exam");
    return true;
  }, [user?.id]);

  const submitExam = useCallback(
    (selections: number[], spent: number[]) => {
      if (!currentSession || currentSession.mode !== "exam") return;
      const answers: QuizAnswer[] = currentSession.questions.map((q, i) => {
        const selectedIndex = Number.isInteger(selections[i]) ? selections[i] : -1;
        return {
          questionId: q.id,
          selectedIndex,
          isCorrect: selectedIndex === q.correctIndex,
          timeSpent: Math.max(0, Math.round(spent[i] || 0)),
        };
      });
      clearDraft();
      completeSession({
        ...currentSession,
        answers,
        endTime: new Date().toISOString(),
        score: calculateScore(answers.filter(a => a.isCorrect).length, answers.length),
      });
    },
    [completeSession, currentSession]
  );

  const resetSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
  }, []);

  const currentQuestion = currentSession?.questions[currentQuestionIndex] ?? null;

  const publicAuthUsers = authUsers;

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      authReady,
      mustChangePassword,
      login,
      loginWithLaunch,
      logout,
      changePassword,
      updateUserProfile,
      authUsers: publicAuthUsers,
      createAuthUser,
      updateAuthUserRole,
      updateAuthUserArenas,
      resetAuthUserPassword,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      questionBankLoaded: !!practiceBank && !isDemoContent,
      isDemoContent,
      questionBankData: questionBank,
      practiceBankData: practiceBank,
      importQuestionBank,
      importQuestionBankCategories,
      clearImportedQuestionBank,
      replaceQuestionBank,
      deleteQuestionBankCategory,
      resetQuestionBankContent,
      bankSource,
      sharedBankExists,
      adminToken,
      setAdminToken,
      publishQuestionBank,
      publishCurrentBank,
      canPublish: !!publishCredential,
      unpublishQuestionBank,
      refreshQuestionBank,
      currentSession,
      startQuiz,
      startExam,
      resumeExam,
      submitExam,
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
      loginWithLaunch,
      logout,
      changePassword,
      updateUserProfile,
      publicAuthUsers,
      createAuthUser,
      updateAuthUserRole,
      updateAuthUserArenas,
      resetAuthUserPassword,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      questionBank,
      practiceBank,
      isDemoContent,
      importQuestionBank,
      importQuestionBankCategories,
      clearImportedQuestionBank,
      replaceQuestionBank,
      deleteQuestionBankCategory,
      resetQuestionBankContent,
      bankSource,
      sharedBankExists,
      adminToken,
      setAdminToken,
      publishQuestionBank,
      publishCurrentBank,
      publishCredential,
      unpublishQuestionBank,
      refreshQuestionBank,
      currentSession,
      startQuiz,
      startExam,
      resumeExam,
      submitExam,
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

