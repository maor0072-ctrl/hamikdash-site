# יומן התקדמות - תהילים ישראל פרוסה 2

## 08.10.2026
- נקרא התדריך, יומן ההכרעות והקוד (`worker/tehillim.js`, `tehillim-book-do.js`, `tehillim-counter-do.js`, `tehillim.html`).
- נפתח הענף `claude/tehillim-slice2` מ-`claude/intelligent-franklin-dxxt2e` (שהיה זהה ל-main).
- נכתבה תוכנית: `.claude-work/tehillim-slice2-plan.md`. לא נכתב קוד עדיין.
- ממצא: אין אינדקס ספרים בקוד, למרות ההערה בראש הקובץ. הקטלוג מחייב אותו; התוכנית שמה אותו ב-CounterDO.
- לא נבדק: כלום מהקוד (עוד לא נכתב).

## שאלות ליעקב
- א1. קטלוג: ברירת מחדל "לא רשום" (פרטיות)? 
- א2. קטלוג גם תחת hamikdash.co.il לגוגל?
- א3. זיהוי בטלפון בלי קוד אימות?
- א4. כתובות קבוצות הוואטסאפ.

## רכיב 1 - קטלוג ציבורי: נבנה ונבדק מקומית, ממתין לפריסה של יעקב
**נעשה:** `worker/tehillim-catalog.js` (חדש, פונקציות טהורות + HTML בצד השרת בלי JS) · BookDO: פעולה חדשה `counts` לקריאה בלבד · CounterDO: טבלת `catalog` ופעולות `catalog-set/get/list` (בלי DO חדש ובלי migration) · `tehillim.js`: נתיבים `/sfarim`, `GET /api/catalog`, `POST /api/manage/<tok>/listing`, שדה `listed` ב-`POST /api/book` · `tehillim.html`: תיבת הסכמה בטופס + דלת לקטלוג · `manage.html`: מתג הצגה/הסרה.
**נבדק בפועל:**
- `node worker/_test_catalog.mjs` - 16 בדיקות, כולן עברו (פרקים מתוך 150 וקי"ט חלקי, סינון סגור/מלא/ישן/לא-קיים, הקריאה הכללית ראשונה, קידוד HTML, אין script, אין מקף ארוך).
- `node worker/_test_quiet.mjs` - ALL PASS.
- הרצה מקומית של ה-Worker האמיתי על `workerd` דרך miniflare, עם DO ב-SQLite (`.claude-work/it-catalog.mjs`, 16 בדיקות, כולן עברו): ספר עם `listed:true` מופיע, בלי סימון ועם `false` לא; מספרים חיים אחרי take/read; מתג הניהול מכניס ומוציא; טוקן מזויף ומזהה ציבורי נדחים ב-403; ספר שהושלם יוצא; מצב ספר רגיל לא נפגע.
- צילום ברוחב 390: אין גלישה אופקית (`scrollWidth` = 390). `.claude-work/catalog-390.png`.
**באג שנתפס בבדיקה ותוקן:** הקריאה הכללית נוצרת בעצלתיים רק בלחיצה עליה, ולכן קטלוג שנפתח לפני כן הציג אותה חסרה. הקטלוג מפעיל עכשיו `reopen` (אידמפוטנטי) לפני הבנייה.
**לא נבדק:** פריסה אמיתית ו-Cloudflare (אין לי גישה) · טלפון אמיתי · אינדוקס בגוגל · הטפסים `tehillim.html` ו-`manage.html` נבדקו רק ב-API, לא בלחיצה בדפדפן.
**שים לב לפני פריסה:** הפריסה חייבת לכלול את הקובץ החדש `tehillim-catalog.js` כמודול. סקריפט הפריסה (`scripts/deploy_hamikdash_tehillim_worker.py` ב-my-aios) לא נקרא על ידי כי הריפו לקריאה בלבד ולא בדקתי אם הוא מעלה מודולים לפי רשימה קבועה. **צריך לבדוק.**
