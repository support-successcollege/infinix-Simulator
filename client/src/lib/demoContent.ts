/* ============================================================
   demoContent.ts — Built-in placeholder content

   This is NOT real course material. It exists so the app has
   something to render before a real question bank is imported.
   Anything sourced from here is flagged `isDemo` and the UI shows
   a "תוכן הדגמה" badge, so nobody mistakes it for the real thing.

   When the real bank ships, importing it takes over automatically —
   demo content is only ever a fallback, never merged in.
   ============================================================ */

import type { Arena, Question } from "@/types/app";

export const DEMO_ARENAS: Arena[] = [
  { id: "demo-real-estate", name: "נדל\"ן", icon: "🏠", questionCount: 10, category: "נכסים", summary: "שיחות מכירה לרוכשים ומשקיעים." },
  { id: "demo-insurance", name: "ביטוח", icon: "🛡️", questionCount: 10, category: "פיננסים", summary: "ניהול התנגדויות סביב כיסוי ועלות." },
  { id: "demo-telecom", name: "תקשורת", icon: "📱", questionCount: 10, category: "טכנולוגיה", summary: "מכירת חבילות ושימור לקוחות." },
  { id: "demo-banking", name: "בנקאות", icon: "🏦", questionCount: 10, category: "פיננסים", summary: "אמון, סיכונים ותהליך אישור." },
  { id: "demo-automotive", name: "רכב", icon: "🚗", questionCount: 10, category: "רכב", summary: "סגירת עסקאות רכב ומימון." },
  { id: "demo-software", name: "תוכנה B2B", icon: "💻", questionCount: 10, category: "טכנולוגיה", summary: "ROI, הטמעה ומולטי-סטייקהולדר." },
  { id: "demo-retail", name: "קמעונאות", icon: "🛍️", questionCount: 10, category: "מסחר", summary: "חוויית לקוח והגדלת סל." },
  { id: "demo-pharma", name: "פרמצבטיקה", icon: "💊", questionCount: 10, category: "בריאות", summary: "רגולציה, בטיחות וערך קליני." },
  { id: "demo-energy", name: "אנרגיה", icon: "⚡", questionCount: 10, category: "תשתיות", summary: "חיסכון, תפעול וסיכוני מעבר." },
  { id: "demo-education", name: "חינוך", icon: "📚", questionCount: 10, category: "שירותים", summary: "מכירת מסלולי לימוד והתחייבות." },
  { id: "demo-hospitality", name: "אירוח ותיירות", icon: "🏨", questionCount: 10, category: "שירותים", summary: "שדרוגים, חוויית אורח ומחיר." },
  { id: "demo-fintech", name: "פינטק", icon: "💳", questionCount: 10, category: "פיננסים", summary: "חדשנות פיננסית וניהול סיכונים." },
];

type DemoQuestion = Omit<Question, "arena">;

const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: "demo-q1",
    text: "לקוח אומר: 'זה יקר מדי'. מה התגובה הנכונה ביותר?",
    options: [
      "להסכים ולהציע הנחה מיידית",
      "לשאול: 'יקר ביחס למה?' ולהבין את ההשוואה",
      "להסביר שוב את כל היתרונות",
      "לסיים את השיחה בנימוס",
    ],
    correctIndex: 1,
    explanation:
      "שאלת הבהרה מאפשרת לנו להבין את ההתנגדות האמיתית. 'יקר' הוא לעיתים קרובות ביטוי לחוסר הבנת הערך, לא בעיית תקציב אמיתית.",
    coach: "כשלקוח אומר 'יקר', הוא בעצם אומר 'לא הבנתי את הערך'. שאל שאלות לפני שאתה מגיב.",
    difficulty: "medium",
  },
  {
    id: "demo-q2",
    text: "מהי הטכניקה הנכונה לסגירת עסקה כשהלקוח מהסס?",
    options: [
      "ליצור לחץ זמן מלאכותי",
      "לשאול שאלת סגירה ישירה: 'מה מונע מאיתנו להתקדם היום?'",
      "לתת ללקוח זמן ולחזור שבוע לאחר מכן",
      "להוסיף בונוסים ללא בקשה",
    ],
    correctIndex: 1,
    explanation:
      "שאלת סגירה ישירה חושפת את ההתנגדות האחרונה. ברגע שיודעים מה עוצר את הלקוח, אפשר לטפל בזה ספציפית.",
    coach: "הסגירה הטובה ביותר היא שאלה, לא הצהרה. שאל ישירות מה מונע את ההתקדמות.",
    difficulty: "hard",
  },
  {
    id: "demo-q3",
    text: "לקוח חדש מגיע לפגישה. מה צריך לעשות בדקות הראשונות?",
    options: [
      "להתחיל מיד בהצגת המוצר",
      "לבנות rapport ולהבין את הצרכים לפני כל הצגה",
      "לשאול מיד על התקציב",
      "לספר על הצלחות קודמות עם לקוחות דומים",
    ],
    correctIndex: 1,
    explanation:
      "בניית rapport ואיסוף מידע על הצרכים היא הבסיס לכל מכירה מוצלחת. לקוח שמרגיש מובן יהיה פתוח הרבה יותר.",
    difficulty: "easy",
  },
  {
    id: "demo-q4",
    text: "מה ההבדל בין 'feature' ל-'benefit' במכירות?",
    options: [
      "אין הבדל, הם מילים נרדפות",
      "Feature הוא מה שהמוצר עושה, Benefit הוא מה שהלקוח מרוויח",
      "Feature הוא היתרון, Benefit הוא המחיר",
      "Feature מתאים לעסקים, Benefit מתאים לפרטיים",
    ],
    correctIndex: 1,
    explanation:
      "לקוחות קונים תוצאות, לא תכונות. 'מצלמה 48MP' היא feature. 'תצלם רגעים מושלמים שתשמור לנצח' הוא benefit.",
    difficulty: "easy",
  },
  {
    id: "demo-q5",
    text: "לקוח אומר 'אני צריך לחשוב על זה'. מה עושים?",
    options: [
      "אומרים 'בסדר, תתקשר כשתחליט'",
      "שואלים 'מה בדיוק צריך לחשוב? אולי אני יכול לעזור עכשיו?'",
      "מציעים הנחה מיידית כדי לסגור",
      "שולחים חומר שיווקי בדוא\"ל",
    ],
    correctIndex: 1,
    explanation:
      "'צריך לחשוב' כמעט תמיד אומר שיש התנגדות שלא הובעה. שאל מה בדיוק מצריך מחשבה — זה הצעד הנכון.",
    difficulty: "medium",
  },
  {
    id: "demo-q6",
    text: "מה עדיף: לדבר על המחיר מוקדם בשיחה או מאוחר?",
    options: [
      "מוקדם ככל האפשר, כדי לחסוך זמן",
      "רק אחרי שהלקוח הבין את הערך המלא",
      "תמיד בסוף, כהפתעה",
      "אין חשיבות לתזמון",
    ],
    correctIndex: 1,
    explanation:
      "מחיר ללא ערך הוא תמיד יקר. כשהלקוח מבין את הערך המלא, המחיר הופך להשקעה ולא להוצאה.",
    difficulty: "medium",
  },
  {
    id: "demo-q7",
    text: "מהי שיטת SPIN Selling?",
    options: [
      "Sell, Pitch, Influence, Negotiate",
      "Situation, Problem, Implication, Need-payoff",
      "Speed, Price, Innovation, Network",
      "Survey, Plan, Implement, Notify",
    ],
    correctIndex: 1,
    explanation:
      "SPIN היא שיטת שאלות: Situation (מצב), Problem (בעיה), Implication (השלכות), Need-payoff (ערך הפתרון). היא מובילה את הלקוח לגלות בעצמו את הצורך.",
    difficulty: "hard",
  },
  {
    id: "demo-q8",
    text: "לקוח מתלונן על שירות קודם. מה עושים ראשון?",
    options: [
      "מסבירים למה זה לא אשמתנו",
      "מקשיבים, מכירים בבעיה, ומתנצלים כנה",
      "מציעים פיצוי מיידי",
      "מעבירים לנציג אחר",
    ],
    correctIndex: 1,
    explanation:
      "לקוח כועס צריך קודם כל להרגיש שמיעה. הכרה בבעיה והתנצלות כנה מורידים את הטמפרטורה לפני שמציעים פתרון.",
    difficulty: "easy",
  },
  {
    id: "demo-q9",
    text: "מה זה 'social proof' ואיך משתמשים בו?",
    options: [
      "הוכחה שהמוצר עבד ברשתות חברתיות",
      "שימוש בעדויות, סיפורי הצלחה ומספרים כדי לבנות אמון",
      "מדיניות החזרות ברורה",
      "הצגת תעודות ורישיונות",
    ],
    correctIndex: 1,
    explanation:
      "Social proof מנצל את הנטייה האנושית ללמוד מאחרים. '500 עסקים כבר בחרו בנו' או 'לקוח X הגדיל מכירות ב-40%' הם דוגמאות חזקות.",
    difficulty: "medium",
  },
  {
    id: "demo-q10",
    text: "מה ההבדל בין 'objection' ל-'condition' בתהליך מכירה?",
    options: [
      "אין הבדל, שניהם מונעים מכירה",
      "Objection ניתן לטיפול, Condition הוא מניעה אמיתית שאי אפשר לפתור",
      "Objection הוא טכני, Condition הוא רגשי",
      "Condition הוא זמני, Objection הוא קבוע",
    ],
    correctIndex: 1,
    explanation:
      "Objection היא התנגדות שניתן לטפל בה ('יקר מדי' → הצג ערך). Condition היא מניעה אמיתית ('אין לי תקציב לחצי שנה' → לא ניתן לסגור עכשיו).",
    difficulty: "hard",
  },
];

/** Total distinct demo questions available for any one arena. */
export const DEMO_QUESTION_POOL_SIZE = DEMO_QUESTIONS.length;

/**
 * Demo questions tagged with the requested arena name.
 *
 * Returns the whole pool; the caller runs it through `pickQuestions`
 * so a request for more than we have yields a shorter quiz rather
 * than repeated questions.
 */
export function getDemoQuestions(arenaName: string): Question[] {
  return DEMO_QUESTIONS.map(q => ({ ...q, arena: arenaName }));
}
