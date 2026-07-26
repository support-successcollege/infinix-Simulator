# GitHub Pages Prep (INFINIX)

הפרויקט מוכן לפרסום כאתר סטטי ב־GitHub Pages.

## מה הוכן

- ניתוב SPA עבר ל־Hash Router כדי למנוע 404 ברענון עמודים ב־Pages.
- התוכן נארז לתוך ה־bundle (ראה "ניהול תוכן" למטה) ולא נטען ב־fetch, כך שאין תלות ב־`BASE_URL`.
- נוספו פקודות:
  - `pnpm build:content`
  - `pnpm import:legacy`
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

## ניהול תוכן

מקור האמת לתוכן הוא `client/src/content/subjects/*.json`, מגורס ב־git.

```bash
pnpm build:content     # מאמת את התוכן ומייצר manifest + content-report.md
```

האימות **מפיל את ה־build** על תוכן לא תקין: `correctIndex` מחוץ לטווח, מזהה כפול,
נושא לא מוכר, נוסח כפול, או שאלה בסטטוס `published` ללא הסבר או הפניה לחוק.
`pnpm build:pages` מריץ אותו אוטומטית.

ייבוא בנק שאלות קיים בפורמט ETHIC_MERGED:

```bash
pnpm import:legacy <path/to/bank.json> --subject ethics
```

הייבוא מסמן כל שאלה כ־`review` ומשייך אותה ל־`<subject>.unassigned`. יש לשייך
נושא, לכתוב הסבר ולהוסיף מקור לפני שמשנים ל־`published`.

## הגדרה ראשונית

אין חשבון מובנה. בכניסה הראשונה במכשיר, המסך מבקש ליצור את חשבון ההנהלה.
החשבון נשמר ב־localStorage של אותו דפדפן בלבד — אין שרת, ולכן חשבונות ותוצאות
אינם משותפים בין מכשירים.
