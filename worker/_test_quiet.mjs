import { expiryFor, inQuietWindow, QUIET_WINDOWS } from "./tehillim-quiet.js";

const IL = { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" };
const f = (t) => new Date(t).toLocaleString("he-IL", IL);
const HOUR = 3600000;
let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (extra ? "   " + extra : ""));
  if (!cond) fails++;
}

console.log("windows:", QUIET_WINDOWS.length);
// חלון שבת וסוכות: שישי 25.09.2026 17:50 -> שבת 26.09.2026 19:46
const w = QUIET_WINDOWS.find((x) => new Date(x[0]).getTime() > Date.parse("2026-09-25T00:00:00+03:00"));
console.log("window under test:", f(w[0]), "->", f(w[1]));

// 1. תפיסה רגילה באמצע השבוע: פוקעת בדיוק אחרי שעה
const mid = Date.parse("2026-09-24T10:00:00+03:00");
check("חול: שעה היא שעה", expiryFor(mid, HOUR) === mid + HOUR, f(expiryFor(mid, HOUR)));

// 2. תפיסה 20 דקות לפני כניסת השבת: 20 דקות נצרכות, 40 ממתינות לצאת השבת
const pre = w[0] - 20 * 60000;
const e2 = expiryFor(pre, HOUR);
check("ערב שבת: השעון עוצר ומשלים אחרי הצאת", e2 === w[1] + 40 * 60000, f(e2));

// 3. תפיסה בתוך השבת עצמה (מי שפתח דפדפן): השעון מתחיל רק בצאת השבת
const during = w[0] + 5 * HOUR;
const e3 = expiryFor(during, HOUR);
check("בתוך השבת: השעון מתחיל בצאת", e3 === w[1] + HOUR, f(e3));

// 4. תפיסה שעתיים אחרי צאת השבת: רגילה
const post = w[1] + 2 * HOUR;
check("מוצאי שבת: רגיל", expiryFor(post, HOUR) === post + HOUR, f(expiryFor(post, HOUR)));

// 5. תפיסה שנופלת בדיוק על הגבול
check("בדיוק בכניסה", expiryFor(w[0], HOUR) === w[1] + HOUR);

// 6. inQuietWindow
check("inQuietWindow בתוך", inQuietWindow(w[0] + HOUR) === true);
check("inQuietWindow מחוץ", inQuietWindow(w[1] + HOUR) === false);

// 7. חלון ארוך: שבת שצמודה ליום טוב (למעלה מ-48 שעות) - תקציב שעה לא נבלע
const longW = QUIET_WINDOWS.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
console.log("longest window:", f(longW[0]), "->", f(longW[1]),
  ((longW[1] - longW[0]) / HOUR).toFixed(1) + "h");
const e7 = expiryFor(longW[0] - 10 * 60000, HOUR);
check("רצף ארוך: מסתיים אחרי הצאת", e7 === longW[1] + 50 * 60000, f(e7));

console.log(fails ? "\n" + fails + " FAILED" : "\nALL PASS");
process.exit(fails ? 1 : 0);
