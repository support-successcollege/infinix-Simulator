# INFINIX Simulator

סימולטור אימון מכירות בעברית (RTL). אפליקציית React סטטית שמתפרסמת
ב-GitHub Pages.

## התקנה והרצה מקומית

```bash
pnpm install
cp .env.example .env.local   # ערוך את סיסמת ההתקנה
pnpm dev                     # http://localhost:3000
```

## פקודות

| פקודה | מה היא עושה |
|---|---|
| `pnpm dev` | שרת פיתוח עם HMR |
| `pnpm check` | בדיקת טיפוסים (TypeScript) |
| `pnpm test` | הרצת בדיקות (Vitest) |
| `pnpm verify` | `check` + `test` — הרץ לפני push |
| `pnpm build:pages` | build סטטי ל-`dist/public` |
| `pnpm preview:pages` | תצוגה מקומית של ה-build |
| `pnpm format` | Prettier |

## מבנה

```
client/src/
  contexts/AppContext.tsx   מצב גלובלי: אימות, ניווט, חידון, היסטוריה
  lib/auth.ts               גיבוב סיסמאות (PBKDF2) — ראה docs/SECURITY.md
  lib/questionBank.ts       פענוח מאגר שאלות ובחירת שאלות (לוגיקה טהורה + בדיקות)
  lib/demoContent.ts        תוכן הדגמה בלבד — לא חומר לימוד אמיתי
  lib/storage.ts            עטיפת localStorage שלא זורקת
  types/app.ts              טיפוסי הדומיין
  components/screens/       מסכי האפליקציה
docs/SECURITY.md            מודל האבטחה והמגבלות שלו
```

## אבטחה — לקרוא לפני העלייה לאוויר

ההתחברות במערכת היא **שער תצוגה, לא אבטחה**. אין שרת, ולכן כל בדיקה
רצה בדפדפן של המשתמש וניתנת לעקיפה. אל תאחסן מאחוריה מידע רגיש.

הפרטים המלאים — כולל מה כן מיושם ומתי חייבים לעבור לשרת —
ב-[`docs/SECURITY.md`](docs/SECURITY.md).

**סיסמת ההתקנה** מוגדרת ב-`VITE_ADMIN_PASSWORD` ומוחלפת בכפייה בכניסה
הראשונה בכל דפדפן.

## מאגר השאלות

האפליקציה מחפשת מאגר בסדר הזה:

1. `localStorage` (מאגר שיובא דרך מסך הניהול)
2. `/api/question-bank` (בפיתוח בלבד — קורא מ-`../question_bank_infinitycloser.json`)
3. `client/public/question_bank_infinitycloser.json`

אם לא נמצא מאגר עם שאלות שמישות, האפליקציה נופלת ל**תוכן הדגמה**
ומציגה תג "תוכן הדגמה" בבירור בכל מסך רלוונטי. תוכן הדגמה לעולם לא
מתערבב עם מאגר אמיתי — הוא רק fallback.

### מבנים נתמכים

```jsonc
// מבנה INFINIX
{ "categories": { "שם הזירה": { "icon": "🎯", "questions": [
    { "id": "q1", "question": "...", "options": ["א","ב"],
      "correctIndex": 0, "explanation": "...", "difficulty": "medium",
      "status": "active" } ] } } }

// מבנה ETHIC_MERGED (מבחנים)
{ "subject": "...", "exams": [ { "id": "...", "questions": [
    { "number": 1, "stem": "...",
      "options": { "א": "...", "ב": "..." }, "correctAnswer": "ב" } ] } ] }
```

שאלות עם `status` של `archived` או `draft` לא מוגשות למתאמנים.
שאלות במבחן אחד לעולם לא חוזרות על עצמן — אם בזירה יש פחות שאלות
מהמבוקש, המבחן פשוט יהיה קצר יותר והאשף מודיע על כך מראש.

## פריסה

`.github/workflows/deploy-pages.yml` רץ על כל push ל-`main`:
בדיקת טיפוסים → בדיקות → build → פריסה ל-GitHub Pages.
Build שנכשל לא מתפרסם.

לפרטי הגדרה נוספים ראה [`GITHUB_PAGES_SETUP.md`](GITHUB_PAGES_SETUP.md).

## מגבלות ידועות

- **אין סנכרון בין מכשירים.** משתמשים והיסטוריית אימונים נשמרים
  ב-`localStorage` של דפדפן אחד. דוחות המנהל מכסים רק את המכשיר הנוכחי.
- **גופנים נטענים מ-Google Fonts.** ברשת חסומה הטקסט נופל לגופן מערכת.
