/* ============================================================
   AppContext — InfinityCloser Global State
   Manages: auth, current screen, training config, quiz state
   ============================================================ */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────

export type Screen =
  | "hub"
  | "wizard"
  | "quiz"
  | "results"
  | "profile"
  | "manager"
  | "settings";

export type TrainingMode = "full" | "quick" | "mistakes";

export interface TrainingConfig {
  mode: TrainingMode;
  questionCount: number;
  timePerQuestion: number; // seconds
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
  totalSessions: number;
  avgScore: number;
  weeklyGoal: number;
  weeklyProgress: number;
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

interface AuthUserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "trainee" | "manager";
}

const HEBREW_OPTION_ORDER = ["א", "ב", "ג", "ד", "ה", "ו"];

// ── Demo data ──────────────────────────────────────────────────

const DEMO_ARENAS: Arena[] = [
  { id: "real-estate", name: "נדל\"ן", icon: "🏠", questionCount: 45, category: "נכסים", summary: "שיחות מכירה לרוכשים ומשקיעים." },
  { id: "insurance", name: "ביטוח", icon: "🛡️", questionCount: 38, category: "פיננסים", summary: "ניהול התנגדויות סביב כיסוי ועלות." },
  { id: "telecom", name: "תקשורת", icon: "📱", questionCount: 52, category: "טכנולוגיה", summary: "מכירת חבילות ושימור לקוחות." },
  { id: "banking", name: "בנקאות", icon: "🏦", questionCount: 41, category: "פיננסים", summary: "אמון, סיכונים ותהליך אישור." },
  { id: "automotive", name: "רכב", icon: "🚗", questionCount: 36, category: "רכב", summary: "סגירת עסקאות רכב ומימון." },
  { id: "software", name: "תוכנה B2B", icon: "💻", questionCount: 60, category: "טכנולוגיה", summary: "ROI, הטמעה ומולטי-סטייקהולדר." },
  { id: "retail", name: "קמעונאות", icon: "🛍️", questionCount: 29, category: "מסחר", summary: "חוויית לקוח והגדלת סל." },
  { id: "pharma", name: "פרמצבטיקה", icon: "💊", questionCount: 33, category: "בריאות", summary: "רגולציה, בטיחות וערך קליני." },
  { id: "energy", name: "אנרגיה", icon: "⚡", questionCount: 27, category: "תשתיות", summary: "חיסכון, תפעול וסיכוני מעבר." },
  { id: "education", name: "חינוך", icon: "📚", questionCount: 31, category: "שירותים", summary: "מכירת מסלולי לימוד והתחייבות." },
  { id: "hospitality", name: "אירוח ותיירות", icon: "🏨", questionCount: 24, category: "שירותים", summary: "שדרוגים, חוויית אורח ומחיר." },
  { id: "fintech", name: "פינטק", icon: "💳", questionCount: 44, category: "פיננסים", summary: "חדשנות פיננסית וניהול סיכונים." },
];

const QUESTION_BANK_STORAGE_KEY = "ic_question_bank_v1";
const AUTH_USERS_STORAGE_KEY = "ic_auth_users_v1";
const ADMIN_EMAIL = "support@successcollege.co.il";
const ADMIN_PASSWORD = "123456";

function getDefaultAuthUsers(): AuthUserAccount[] {
  return [
    {
      id: "u-admin",
      name: "Support Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "manager",
    },
  ];
}

function normalizeDifficulty(v?: string): Question["difficulty"] {
  if (!v) return undefined;
  const key = String(v).toLowerCase();
  if (key.includes("easy") || key.includes("קל")) return "easy";
  if (key.includes("hard") || key.includes("קשה")) return "hard";
  if (key.includes("medium") || key.includes("בינ")) return "medium";
  return undefined;
}

function buildArenaSummary(meta?: QuestionBankCategory): string {
  if (!meta) return "אימון סימולציה מותאם זירה.";
  const pains = Array.isArray(meta.painPoints) ? meta.painPoints.filter(Boolean) : [];
  if (pains.length > 0) return `תרגול התנגדויות סביב ${pains.slice(0, 2).join(" ו")}.`;
  if (meta.product && meta.nextStep) return `מכירת ${meta.product} עם דגש על ${meta.nextStep}.`;
  return "אימון סימולציה מותאם זירה.";
}

function parseQuestionBank(input: unknown): QuestionBankData | null {
  if (!input || typeof input !== "object") return null;
  const data = input as QuestionBankData;
  if (!data.categories || typeof data.categories !== "object") return null;
  return data;
}

function parseLegacyMergedExamSchema(input: unknown): QuestionBankData | null {
  if (!input || typeof input !== "object") return null;
  const data = input as {
    subject?: string;
    exams?: Array<{
      id?: string;
      examPeriod?: string;
      note?: string;
      questions?: Array<{
        number?: number;
        stem?: string;
        options?: Record<string, string> | string[];
        correctAnswer?: string;
      }>;
    }>;
  };
  if (!Array.isArray(data.exams) || data.exams.length === 0) return null;

  const mergedQuestions: QuestionBankEntry[] = [];
  data.exams.forEach((exam, examIdx) => {
    const questions = (exam.questions || [])
      .map((q, qIdx): QuestionBankEntry | null => {
        const stem = String(q.stem || "").trim();
        if (!stem) return null;

        const rawOptions = q.options;
        let options: string[] = [];
        let orderedKeys: string[] = [];

        if (Array.isArray(rawOptions)) {
          options = rawOptions.map(o => String(o || "").trim()).filter(Boolean);
          orderedKeys = options.map((_, i) => String(i));
        } else if (rawOptions && typeof rawOptions === "object") {
          const entries = Object.entries(rawOptions as Record<string, string>)
            .sort((a, b) => {
              const ai = HEBREW_OPTION_ORDER.indexOf(a[0]);
              const bi = HEBREW_OPTION_ORDER.indexOf(b[0]);
              if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "he");
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
          orderedKeys = entries.map(([k]) => k);
          options = entries.map(([, v]) => String(v || "").trim()).filter(Boolean);
        }

        if (options.length < 2) return null;

        let correctIndex = 0;
        const answerKey = String(q.correctAnswer || "").trim();
        if (answerKey) {
          const byKey = orderedKeys.indexOf(answerKey);
          correctIndex = byKey >= 0 ? byKey : 0;
        }
        correctIndex = Math.max(0, Math.min(options.length - 1, correctIndex));

        const baseId = String(exam.id || `exam-${examIdx + 1}`);
        const qNumber = Number(q.number) || qIdx + 1;
        return {
          id: `${baseId}-${String(qNumber).padStart(3, "0")}`,
          question: stem,
          options,
          correctIndex,
          difficulty: "medium",
          status: answerKey ? "active" : "draft",
          explanation: "",
          coachNote: "",
        };
      })
      .filter((q): q is QuestionBankEntry => q !== null);
    mergedQuestions.push(...questions);
  });

  const categories: Record<string, QuestionBankCategory> = {
    אתיקה: {
      icon: "📘",
      product: String(data.subject || "בנק מבחנים"),
      nextStep: "פתרון מבחן מלא",
      painPoints: ["דיוק משפטי", "ניהול זמן בבחינה", "בחירה בין תשובות דומות"],
      questions: mergedQuestions,
    },
  };

  return { categories };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickQuestions<T>(pool: T[], count: number): T[] {
  if (pool.length === 0 || count <= 0) return [];
  if (pool.length >= count) return shuffle(pool).slice(0, count);
  const shuffled = shuffle(pool);
  const out: T[] = [];
  while (out.length < count) {
    out.push(shuffled[out.length % shuffled.length]);
  }
  return out;
}

const generateQuestions = (arenaId: string, arenaName: string, count: number): Question[] => {
  const questionBank: Record<string, Question[]> = {
    default: [
      {
        id: "q1", text: "לקוח אומר: 'זה יקר מדי'. מה התגובה הנכונה ביותר?",
        options: [
          "להסכים ולהציע הנחה מיידית",
          "לשאול: 'יקר ביחס למה?' ולהבין את ההשוואה",
          "להסביר שוב את כל היתרונות",
          "לסיים את השיחה בנימוס"
        ],
        correctIndex: 1,
        explanation: "שאלת הבהרה מאפשרת לנו להבין את ההתנגדות האמיתית. 'יקר' הוא לעיתים קרובות ביטוי לחוסר הבנת הערך, לא בעיית תקציב אמיתית.",
        coach: "כשלקוח אומר 'יקר', הוא בעצם אומר 'לא הבנתי את הערך'. שאל שאלות לפני שאתה מגיב.",
        arena: arenaName, difficulty: "medium"
      },
      {
        id: "q2", text: "מהי הטכניקה הנכונה לסגירת עסקה כשהלקוח מהסס?",
        options: [
          "ליצור לחץ זמן מלאכותי",
          "לשאול שאלת סגירה ישירה: 'מה מונע מאיתנו להתקדם היום?'",
          "לתת ללקוח זמן ולחזור שבוע לאחר מכן",
          "להוסיף בונוסים ללא בקשה"
        ],
        correctIndex: 1,
        explanation: "שאלת סגירה ישירה חושפת את ההתנגדות האחרונה. ברגע שיודעים מה עוצר את הלקוח, אפשר לטפל בזה ספציפית.",
        coach: "הסגירה הטובה ביותר היא שאלה, לא הצהרה. שאל ישירות מה מונע את ההתקדמות.",
        arena: arenaName, difficulty: "hard"
      },
      {
        id: "q3", text: "לקוח חדש מגיע לפגישה. מה צריך לעשות בדקות הראשונות?",
        options: [
          "להתחיל מיד בהצגת המוצר",
          "לבנות rapport ולהבין את הצרכים לפני כל הצגה",
          "לשאול מיד על התקציב",
          "לספר על הצלחות קודמות עם לקוחות דומים"
        ],
        correctIndex: 1,
        explanation: "בניית rapport ואיסוף מידע על הצרכים היא הבסיס לכל מכירה מוצלחת. לקוח שמרגיש מובן יהיה פתוח הרבה יותר.",
        arena: arenaName, difficulty: "easy"
      },
      {
        id: "q4", text: "מה ההבדל בין 'feature' ל-'benefit' במכירות?",
        options: [
          "אין הבדל, הם מילים נרדפות",
          "Feature הוא מה שהמוצר עושה, Benefit הוא מה שהלקוח מרוויח",
          "Feature הוא היתרון, Benefit הוא המחיר",
          "Feature מתאים לעסקים, Benefit מתאים לפרטיים"
        ],
        correctIndex: 1,
        explanation: "לקוחות קונים תוצאות, לא תכונות. 'מצלמה 48MP' היא feature. 'תצלם רגעים מושלמים שתשמור לנצח' הוא benefit.",
        arena: arenaName, difficulty: "easy"
      },
      {
        id: "q5", text: "לקוח אומר 'אני צריך לחשוב על זה'. מה עושים?",
        options: [
          "אומרים 'בסדר, תתקשר כשתחליט'",
          "שואלים 'מה בדיוק צריך לחשוב? אולי אני יכול לעזור עכשיו?'",
          "מציעים הנחה מיידית כדי לסגור",
          "שולחים חומר שיווקי בדוא\"ל"
        ],
        correctIndex: 1,
        explanation: "'צריך לחשוב' כמעט תמיד אומר שיש התנגדות שלא הובעה. שאל מה בדיוק מצריך מחשבה — זה הצעד הנכון.",
        arena: arenaName, difficulty: "medium"
      },
      {
        id: "q6", text: "מה עדיף: לדבר על המחיר מוקדם בשיחה או מאוחר?",
        options: [
          "מוקדם ככל האפשר, כדי לחסוך זמן",
          "רק אחרי שהלקוח הבין את הערך המלא",
          "תמיד בסוף, כהפתעה",
          "אין חשיבות לתזמון"
        ],
        correctIndex: 1,
        explanation: "מחיר ללא ערך הוא תמיד יקר. כשהלקוח מבין את הערך המלא, המחיר הופך להשקעה ולא להוצאה.",
        arena: arenaName, difficulty: "medium"
      },
      {
        id: "q7", text: "מהי שיטת SPIN Selling?",
        options: [
          "Sell, Pitch, Influence, Negotiate",
          "Situation, Problem, Implication, Need-payoff",
          "Speed, Price, Innovation, Network",
          "Survey, Plan, Implement, Notify"
        ],
        correctIndex: 1,
        explanation: "SPIN היא שיטת שאלות: Situation (מצב), Problem (בעיה), Implication (השלכות), Need-payoff (ערך הפתרון). היא מובילה את הלקוח לגלות בעצמו את הצורך.",
        arena: arenaName, difficulty: "hard"
      },
      {
        id: "q8", text: "לקוח מתלונן על שירות קודם. מה עושים ראשון?",
        options: [
          "מסבירים למה זה לא אשמתנו",
          "מקשיבים, מכירים בבעיה, ומתנצלים כנה",
          "מציעים פיצוי מיידי",
          "מעבירים לנציג אחר"
        ],
        correctIndex: 1,
        explanation: "לקוח כועס צריך קודם כל להרגיש שמיעה. הכרה בבעיה והתנצלות כנה מורידים את הטמפרטורה לפני שמציעים פתרון.",
        arena: arenaName, difficulty: "easy"
      },
      {
        id: "q9", text: "מה זה 'social proof' ואיך משתמשים בו?",
        options: [
          "הוכחה שהמוצר עבד ברשתות חברתיות",
          "שימוש בעדויות, סיפורי הצלחה ומספרים כדי לבנות אמון",
          "מדיניות החזרות ברורה",
          "הצגת תעודות ורישיונות"
        ],
        correctIndex: 1,
        explanation: "Social proof מנצל את הנטייה האנושית ללמוד מאחרים. '500 עסקים כבר בחרו בנו' או 'לקוח X הגדיל מכירות ב-40%' הם דוגמאות חזקות.",
        arena: arenaName, difficulty: "medium"
      },
      {
        id: "q10", text: "מה ההבדל בין 'objection' ל-'condition' בתהליך מכירה?",
        options: [
          "אין הבדל, שניהם מונעים מכירה",
          "Objection ניתן לטיפול, Condition הוא מניעה אמיתית שאי אפשר לפתור",
          "Objection הוא טכני, Condition הוא רגשי",
          "Condition הוא זמני, Objection הוא קבוע"
        ],
        correctIndex: 1,
        explanation: "Objection היא התנגדות שניתן לטפל בה ('יקר מדי' → הצג ערך). Condition היא מניעה אמיתית ('אין לי תקציב לחצי שנה' → לא ניתן לסגור עכשיו).",
        arena: arenaName, difficulty: "hard"
      },
    ]
  };

  const base = questionBank.default;
  const result: Question[] = [];
  for (let i = 0; i < count; i++) {
    const q = { ...base[i % base.length], id: `${arenaId}-q${i + 1}`, arena: arenaName };
    result.push(q);
  }
  return result;
};

const DEMO_SESSIONS: QuizSession[] = [];

// ── Context ────────────────────────────────────────────────────

interface AppContextValue {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, name?: string) => boolean;
  logout: () => void;
  updateUserProfile: (patch: Partial<Pick<User, "name" | "weeklyGoal" | "weeklyProgress">>) => void;
  authUsers: Array<Pick<AuthUserAccount, "id" | "name" | "email" | "role">>;
  createAuthUser: (payload: { name: string; email: string; password: string; role: "trainee" | "manager" }) => void;
  updateAuthUserRole: (userId: string, role: "trainee" | "manager") => void;
  deleteAuthUser: (userId: string) => void;

  // Navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Training config
  trainingConfig: TrainingConfig;
  setTrainingConfig: (config: Partial<TrainingConfig>) => void;

  // Arenas
  arenas: Arena[];
  questionBankLoaded: boolean;
  questionBankData: QuestionBankData | null;
  importQuestionBank: (file: File) => Promise<void>;
  importQuestionBankCategories: (file: File) => Promise<void>;
  clearImportedQuestionBank: () => void;
  replaceQuestionBank: (data: QuestionBankData) => void;
  deleteQuestionBankCategory: (categoryName: string) => void;
  resetQuestionBankContent: () => Promise<void>;

  // Quiz
  currentSession: QuizSession | null;
  startQuiz: () => void;
  submitAnswer: (selectedIndex: number, timeSpent: number) => void;
  nextQuestion: () => void;
  currentQuestionIndex: number;
  currentQuestion: Question | null;
  lastAnswer: QuizAnswer | null;
  isShowingFeedback: boolean;

  // Sessions history
  sessions: QuizSession[];
  resetSessions: () => void;

  // Theme (managed by ThemeContext)
  theme: "dark" | "light";
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [authUsers, setAuthUsers] = useState<AuthUserAccount[]>(() => {
    try {
      const raw = localStorage.getItem(AUTH_USERS_STORAGE_KEY);
      if (!raw) return getDefaultAuthUsers();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultAuthUsers();
      const normalized = parsed
        .map((u: Partial<AuthUserAccount>) => ({
          id: String(u.id || `u-${Date.now()}`),
          name: String(u.name || "").trim(),
          email: String(u.email || "").trim().toLowerCase(),
          password: String(u.password || ""),
          role: u.role === "manager" ? "manager" : "trainee",
        }))
        .filter(u => u.name && u.email && u.password);
      return normalized.length > 0 ? normalized : getDefaultAuthUsers();
    } catch {
      return getDefaultAuthUsers();
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>("hub");
  const [theme] = useState<"dark" | "light">("dark"); // Managed by ThemeContext
  const [sessions, setSessions] = useState<QuizSession[]>(DEMO_SESSIONS);
  const [questionBank, setQuestionBank] = useState<QuestionBankData | null>(null);

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

  const getQuestionBankEndpoints = useCallback(() => {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return [
      "/api/question-bank",
      `${normalizedBase}question_bank_infinitycloser.json`,
      "question_bank_infinitycloser.json",
    ];
  }, []);

  useEffect(() => {
    localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(authUsers));
  }, [authUsers]);

  const arenas = useMemo<Arena[]>(() => {
    const cats = questionBank?.categories;
    if (!cats) return DEMO_ARENAS;
    const names = Object.keys(cats).sort((a, b) => a.localeCompare(b, "he"));
    return names.map((name, idx) => {
      const meta = cats[name];
      const questions = Array.isArray(meta?.questions) ? meta!.questions! : [];
      return {
        id: `arena-${idx + 1}`,
        name,
        icon: meta?.icon || "🎯",
        questionCount: questions.length,
        category: meta?.product || "זירת מכירה",
        summary: buildArenaSummary(meta),
      };
    });
  }, [questionBank]);

  useEffect(() => {
    let cancelled = false;
    const loadBank = async () => {
      try {
        const raw = localStorage.getItem(QUESTION_BANK_STORAGE_KEY);
        if (raw) {
          const json = JSON.parse(raw);
          const parsed = parseQuestionBank(json) || parseLegacyMergedExamSchema(json);
          if (parsed && !cancelled) {
            setQuestionBank(parsed);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load stored question bank", e);
      }

      for (const url of getQuestionBankEndpoints()) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const json = await res.json();
          const parsed = parseQuestionBank(json) || parseLegacyMergedExamSchema(json);
          if (parsed) {
            if (!cancelled) setQuestionBank(parsed);
            return;
          }
        } catch {
          // Try next source
        }
      }
    };

    loadBank();
    return () => {
      cancelled = true;
    };
  }, [getQuestionBankEndpoints]);

  const login = useCallback((email: string, password: string, name?: string) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const account = authUsers.find(a => a.email === normalizedEmail && a.password === password);
    if (!account) return false;
    setUser({
      id: account.id,
      name: name || account.name,
      email: normalizedEmail,
      role: account.role,
      joinDate: new Date(Date.now() - 86400000 * 90),
      totalSessions: 23,
      avgScore: 78,
      weeklyGoal: 5,
      weeklyProgress: 3,
    });
    setSessions([]);
    setCurrentScreen("hub");
    return true;
  }, [authUsers]);

  const logout = useCallback(() => {
    setUser(null);
    setCurrentScreen("hub");
  }, []);

  const updateUserProfile = useCallback((patch: Partial<Pick<User, "name" | "weeklyGoal" | "weeklyProgress">>) => {
    setUser(prev => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
  }, []);

  const createAuthUser = useCallback((payload: { name: string; email: string; password: string; role: "trainee" | "manager" }) => {
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    if (!name || !email || !password) throw new Error("יש למלא שם, מייל וסיסמה");
    setAuthUsers(prev => {
      if (prev.some(u => u.email === email)) throw new Error("קיים כבר משתמש עם המייל הזה");
      return [
        ...prev,
        {
          id: `u-${Date.now()}`,
          name,
          email,
          password,
          role: payload.role,
        },
      ];
    });
  }, []);

  const updateAuthUserRole = useCallback((userId: string, role: "trainee" | "manager") => {
    setAuthUsers(prev => {
      const current = prev.find(u => u.id === userId);
      if (!current) return prev;
      if (current.role === "manager" && role !== "manager") {
        const managerCount = prev.filter(u => u.role === "manager").length;
        if (managerCount <= 1) throw new Error("חייב להישאר לפחות משתמש הנהלה אחד");
      }
      return prev.map(u => (u.id === userId ? { ...u, role } : u));
    });
  }, []);

  const deleteAuthUser = useCallback((userId: string) => {
    setAuthUsers(prev => {
      const target = prev.find(u => u.id === userId);
      if (!target) return prev;
      if (target.role === "manager") {
        const managerCount = prev.filter(u => u.role === "manager").length;
        if (managerCount <= 1) throw new Error("לא ניתן למחוק את משתמש ההנהלה האחרון");
      }
      if (user?.id === userId) throw new Error("לא ניתן למחוק את המשתמש שמחובר כרגע");
      return prev.filter(u => u.id !== userId);
    });
  }, [user?.id]);

  const setTrainingConfig = useCallback((config: Partial<TrainingConfig>) => {
    setTrainingConfigState(prev => ({ ...prev, ...config }));
  }, []);

  const setScreen = useCallback((screen: Screen) => {
    setCurrentScreen(screen);
  }, []);

  const importQuestionBank = useCallback(async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text);
    const parsed = parseQuestionBank(json) || parseLegacyMergedExamSchema(json);
    if (!parsed) throw new Error("מבנה JSON לא תקין");
    setQuestionBank(parsed);
    localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(parsed));
  }, []);

  const importQuestionBankCategories = useCallback(async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text);
    const parsed = parseQuestionBank(json) || parseLegacyMergedExamSchema(json);
    if (!parsed?.categories || Object.keys(parsed.categories).length === 0) {
      throw new Error("לא נמצאו קטגוריות תקינות בקובץ");
    }
    setQuestionBank(prev => {
      const next: QuestionBankData = {
        categories: {
          ...(prev?.categories || {}),
          ...parsed.categories,
        },
      };
      localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const replaceQuestionBank = useCallback((data: QuestionBankData) => {
    const parsed = parseQuestionBank(data) || parseLegacyMergedExamSchema(data);
    if (!parsed) throw new Error("מבנה JSON לא תקין");
    setQuestionBank(parsed);
    localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(parsed));
  }, []);

  const clearImportedQuestionBank = useCallback(() => {
    localStorage.removeItem(QUESTION_BANK_STORAGE_KEY);
    setQuestionBank(null);
  }, []);

  const deleteQuestionBankCategory = useCallback((categoryName: string) => {
    if (!categoryName) return;
    setQuestionBank(prev => {
      const current = prev?.categories || {};
      if (!current[categoryName]) return prev;
      const nextCategories = { ...current };
      delete nextCategories[categoryName];
      const next: QuestionBankData = { categories: nextCategories };
      localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetQuestionBankContent = useCallback(async () => {
    localStorage.removeItem(QUESTION_BANK_STORAGE_KEY);
    for (const url of getQuestionBankEndpoints()) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        const parsed = parseQuestionBank(json) || parseLegacyMergedExamSchema(json);
        if (parsed) {
          setQuestionBank(parsed);
          return;
        }
      } catch {
        // Try next source
      }
    }
    setQuestionBank(null);
  }, [getQuestionBankEndpoints]);

  const startQuiz = useCallback(() => {
    const arena = arenas.find(a => a.id === trainingConfig.arenaId);
    const arenaName = arena?.name || trainingConfig.arenaName || "כללי";
    const targetCount = Math.max(5, Math.min(30, trainingConfig.questionCount));
    const selectedCat = questionBank?.categories?.[arenaName];

    let questions: Question[] = [];
    if (selectedCat?.questions?.length) {
      const all = selectedCat.questions
        .filter(q => q.status !== "archived")
        .filter(q => typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2)
        .map((q, idx) => {
          const options = (q.options || []).map(o => String(o));
          const correct = Number(q.correctIndex);
          return {
            id: q.id || `${arenaName}-${idx + 1}`,
            text: String(q.question || ""),
            options,
            correctIndex: Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : 0,
            explanation: String(q.explanation || ""),
            coach: q.coachNote ? String(q.coachNote) : undefined,
            arena: arenaName,
            difficulty: normalizeDifficulty(q.difficulty),
          } satisfies Question;
        });

      if (trainingConfig.mode === "mistakes" && sessions.length > 0) {
        const wrongIds = new Set<string>();
        sessions.forEach(s => {
          s.answers.forEach(a => {
            if (!a.isCorrect) wrongIds.add(a.questionId);
          });
        });
        const mistakesPool = all.filter(q => wrongIds.has(q.id));
        questions = pickQuestions(mistakesPool.length > 0 ? mistakesPool : all, targetCount);
      } else {
        questions = pickQuestions(all, targetCount);
      }
    }

    if (questions.length === 0) {
      questions = generateQuestions(
        trainingConfig.arenaId || "default",
        arenaName,
        targetCount
      );
    }

    const session: QuizSession = {
      id: `s${Date.now()}`,
      arenaName,
      mode: trainingConfig.mode,
      questions,
      answers: [],
      startTime: new Date(),
      score: 0,
    };

    setCurrentSession(session);
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
    setCurrentScreen("quiz");
  }, [trainingConfig, arenas, questionBank, sessions]);

  const submitAnswer = useCallback((selectedIndex: number, timeSpent: number) => {
    if (!currentSession) return;
    const question = currentSession.questions[currentQuestionIndex];
    if (!question) return;

    const isCorrect = selectedIndex === question.correctIndex;
    const answer: QuizAnswer = {
      questionId: question.id,
      selectedIndex,
      isCorrect,
      timeSpent,
    };

    setLastAnswer(answer);
    setIsShowingFeedback(true);

    setCurrentSession(prev => {
      if (!prev) return prev;
      return { ...prev, answers: [...prev.answers, answer] };
    });
  }, [currentSession, currentQuestionIndex]);

  const nextQuestion = useCallback(() => {
    if (!currentSession) return;
    const nextIdx = currentQuestionIndex + 1;

    if (nextIdx >= currentSession.questions.length) {
      // End quiz
      const allAnswers = [...currentSession.answers];
      const score = Math.round((allAnswers.filter(a => a.isCorrect).length / currentSession.questions.length) * 100);

      const finishedSession: QuizSession = {
        ...currentSession,
        endTime: new Date(),
        score,
      };

      setCurrentSession(finishedSession);
      setSessions(prev => [finishedSession, ...prev]);
      setCurrentScreen("results");
    } else {
      setCurrentQuestionIndex(nextIdx);
      setLastAnswer(null);
      setIsShowingFeedback(false);
    }
  }, [currentSession, currentQuestionIndex]);

  const resetSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    setCurrentQuestionIndex(0);
    setLastAnswer(null);
    setIsShowingFeedback(false);
  }, []);

  const toggleTheme = useCallback(() => {
    // Theme toggling is handled by ThemeContext
    console.warn('Use useTheme().toggleTheme() instead');
  }, []);

  const currentQuestion = currentSession?.questions[currentQuestionIndex] ?? null;

  return (
    <AppContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      logout,
      updateUserProfile,
      authUsers: authUsers.map(({ id, name, email, role }) => ({ id, name, email, role })),
      createAuthUser,
      updateAuthUserRole,
      deleteAuthUser,
      currentScreen,
      setScreen,
      trainingConfig,
      setTrainingConfig,
      arenas,
      questionBankLoaded: !!questionBank,
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
      theme,
      toggleTheme,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export { DEMO_ARENAS };
