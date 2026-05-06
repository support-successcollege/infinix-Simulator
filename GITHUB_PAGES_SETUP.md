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
