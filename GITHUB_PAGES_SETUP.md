# GitHub Pages Prep (INFINIX)

הפרויקט מוכן לפרסום כאתר סטטי ב־GitHub Pages.

## מה הוכן

- ניתוב SPA עבר ל־Hash Router כדי למנוע 404 ברענון עמודים ב־Pages.
- טעינת בנק השאלות עודכנה כך שתומכת ב־`BASE_URL` של Vite.
- נוסף סקריפט סנכרון:
  - מקור: `../question_bank_infinitycloser.json`
  - יעד: `client/public/question_bank_infinitycloser.json`
- נוספו פקודות:
  - `pnpm sync:question-bank`
  - `pnpm build:pages`
  - `pnpm preview:pages`
- `vite.config.ts` תומך ב־`VITE_BASE_PATH`.
- נוסף workflow לפריסה אוטומטית:
  - `.github/workflows/deploy-pages.yml`
  - רץ על כל push ל־`main`.
  - מריץ בדיקת טיפוסים ובדיקות **לפני** ה־build; כישלון עוצר את הפריסה.

## משתני סביבה

העתק את `.env.example` ל־`.env.local` (לא נכנס ל־Git):

```bash
VITE_ADMIN_EMAIL=support@successcollege.co.il
VITE_ADMIN_PASSWORD=בחר-סיסמה-חזקה
```

ב־GitHub Actions הגדר אותם כ־Repository Secrets והעבר ל־build step.
שים לב: ב־build סטטי הערכים נצרבים לתוך ה־JavaScript. ההגנה האמיתית
היא החלפת הסיסמה הכפויה בכניסה הראשונה — ראה `docs/SECURITY.md`.

## איך לבנות ל־GitHub Pages

### User/Org Pages (דומיין משתמש)

```bash
pnpm build:pages
```

### Project Pages (ריפו תחת `/repo-name/`)

```bash
# PowerShell
$env:VITE_BASE_PATH="/repo-name/"
pnpm build:pages
```

## תיקייה להעלאה

התוצרים נמצאים בנתיב:

- `dist/public`

## הערה

לפני build מומלץ לוודא ש־`question_bank_infinitycloser.json` קיים בשורש הפרויקט.
