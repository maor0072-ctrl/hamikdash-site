// בסיס המונה: קריאה שנעשתה מחוץ לאתר.
//
// הכרעת יעקב ה3, 05.11.2026: מ-24.9 עד 5.11.2026 (שישה שבועות) יעקב קרא שני ספרים
// בשבוע, ובני המשפחה והחברים לפחות ספר בשבוע, לרפואת אברהם בן שרה: 18 ספרים, 2,700 פרקים.
//
// הוראת הרב יעקב מאור, 22.11.2026: "בכל שבוע אתה יכול להוסיף פעמיים תהילים שאני קורא
// מספר. ההשלמה לשני ספרים זה בשבת." - ולכן על כל שבת שהסתיימה אחרי asOf נוספים עוד
// 2 ספרים ו-300 פרקים.
//
// מתי שבת "הסתיימה": בסוף חלון השקט שמכיל את שבת בצהריים (tehillim-quiet.js - הקו
// המחמיר בכל הארץ, יציאה לפי רבנו תם המאוחרת ביותר; אם שבת צמודה ליום טוב, בסוף
// החלון כולו). אם אין חלון (אחרי 2032, או תקלה בטבלה) - שבת 18:00 UTC, כלומר 20:00
// בחורף ו-21:00 בקיץ בישראל, מאוחר מכל צאת שבת. בשני המקרים הספירה שמרנית: שבת
// נכנסת רק אחרי שיצאה בוודאות בכל מקום בארץ.
//
// נכנס ל-total ול-booksDone של /api/stats בלבד. today ו-month נשארים אמיתיים.

import { quietWindowAt } from "./tehillim-quiet.js";

export const OFFLINE_BASE = { books: 18, chapters: 2700, asOf: "2026-11-05" };
export const WEEKLY_BOOKS = 2;
export const CHAPTERS_PER_BOOK = 150;

const DAY = 86400000;

// סוף השבת שתאריכה (יום שבת, חצות UTC) הוא satUtcMidnight.
export function shabbatEndMs(satUtcMidnight) {
  const noon = satUtcMidnight + 10 * 3600000; // 12:00 או 13:00 בישראל - תמיד בתוך שבת
  const w = quietWindowAt(noon);
  if (w) return w[1];
  return satUtcMidnight + 18 * 3600000;
}

// כמה שבתות אחרי asOf כבר יצאו ברגע now.
export function shabbatotEndedSince(asOf, now) {
  const start = Date.parse(asOf + "T00:00:00Z");
  if (!Number.isFinite(start)) return 0;
  const t = Number(now);
  let d = start + DAY; // שבת שחלה ביום asOf עצמו כבר כלולה בבסיס
  while (new Date(d).getUTCDay() !== 6) d += DAY;
  let n = 0;
  for (; d <= t; d += 7 * DAY) {
    if (t >= shabbatEndMs(d)) n++;
    else break;
  }
  return n;
}

export function offlineBase(now) {
  const weeks = shabbatotEndedSince(OFFLINE_BASE.asOf, now === undefined ? Date.now() : now);
  return {
    books: OFFLINE_BASE.books + WEEKLY_BOOKS * weeks,
    chapters: OFFLINE_BASE.chapters + WEEKLY_BOOKS * CHAPTERS_PER_BOOK * weeks,
    asOf: OFFLINE_BASE.asOf,
    weeklyShabbatot: weeks,
  };
}
