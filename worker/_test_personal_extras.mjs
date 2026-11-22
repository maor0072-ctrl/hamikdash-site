// בדיקות לרכיבי התוספת של התהילים האישי. מריצים: node worker/_test_personal_extras.mjs
import fs from "fs";
import * as C from "../tehillim/personal-core.js";
import { isNoTachanunDay, noTachanunReason } from "../tehillim/personal-extras.js";

let fail = 0, pass = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else { pass++; } };
const G = (y, m, d) => C.gregorianToHebrew(y, m, d);
const no = (y, m, d, why) => ok(isNoTachanunDay(G(y, m, d)), `${d}.${m}.${y} אין תחנון (${why}) - ${noTachanunReason(G(y, m, d))}`);
const yes = (y, m, d, why) => ok(!isNoTachanunDay(G(y, m, d)), `${d}.${m}.${y} יש תחנון (${why}) - ${noTachanunReason(G(y, m, d))}`);

// ---------- ימים בלי תחנון, תאריכים ממשיים (המרה נבדקה מול personal-core) ----------
no(2026, 11, 21, "שבת");
yes(2026, 11, 22, "יום ראשון רגיל, ב' כסלו תשפ\"ז");
yes(2026, 11, 23, "יום שני רגיל");
no(2026, 11, 11, "ראש חודש כסלו, א' כסלו");
no(2026, 11, 10, "ראש חודש כסלו, ל' חשוון");
yes(2026, 12, 4, "כ\"ד כסלו, ערב חנוכה");
no(2026, 12, 5, "חנוכה א', כ\"ה כסלו");
no(2026, 12, 11, "חנוכה ור\"ח, א' טבת");
no(2026, 12, 12, "חנוכה ח', ב' טבת");
yes(2026, 12, 13, "ג' טבת, אחרי חנוכה");
yes(2027, 1, 8, "כ\"ט טבת, ערב ראש חודש");
no(2027, 2, 21, "פורים קטן, י\"ד אדר א'");
no(2027, 3, 23, "פורים, י\"ד אדר ב'");
no(2027, 3, 24, "שושן פורים, ט\"ו אדר ב'");
no(2027, 4, 8, "א' ניסן");
no(2027, 5, 21, "פסח שני, י\"ד אייר");
no(2027, 5, 25, "ל\"ג בעומר, י\"ח אייר");
no(2027, 6, 10, "ה' סיון");
yes(2027, 6, 18, "י\"ג סיון");
no(2027, 8, 12, "תשעה באב");
yes(2027, 8, 13, "י' באב כשט' באב לא בשבת");
no(2025, 8, 3, "י' באב תשפ\"ה, תשעה באב נדחה");
yes(2027, 8, 22, "י\"ט באב, יום ראשון");
yes(2027, 9, 30, "כ\"ח אלול");
no(2027, 10, 1, "כ\"ט אלול, ערב ראש השנה");
no(2027, 10, 10, "ט' תשרי, ערב יום הכיפורים");
no(2027, 10, 28, "כ\"ז תשרי, עד סוף תשרי");
yes(2027, 11, 9, "חשוון אחרי ראש חודש");
// בדיקת שלמות: בכל שנה ממוצעת יש בין 90 ל-140 ימים בלי תחנון
for (const y of [5785, 5786, 5787]) {
  let n = 0, d = { year: y, month: 7, day: 1 };
  const end = C.hebrewToAbs({ year: y + 1, month: 7, day: 1 });
  while (C.hebrewToAbs(d) < end) { if (isNoTachanunDay(d)) n++; d = C.addDays(d, 1); }
  ok(n > 90 && n < 150, `שנה ${y}: ${n} ימים בלי תחנון`);
}

// ---------- personal-extras.json (הקובץ החי) ----------
const j = JSON.parse(fs.readFileSync(new URL("../tehillim/personal-extras.json", import.meta.url), "utf8"));
ok(!fs.existsSync(new URL("../tehillim/personal-extras-draft.json", import.meta.url)), "אין קובץ טיוטה");
ok(!j.namePesukim || Object.keys(j.namePesukim).length === 0, "בלי פסוקים לפי השם (בוטלו)");
ok(Array.isArray(j.requests) && j.requests.length > 0, "יש בקשות");
const ids = new Set();
for (const r of j.requests) {
  ok(/^[a-z0-9_-]{1,32}$/.test(r.id) && !ids.has(r.id), `בקשה ${r.id} מזהה תקין וייחודי`); ids.add(r.id);
  ok(typeof r.label === "string" && r.label.length > 1, `בקשה ${r.id} עם כותרת`);
  ok(typeof r.source === "string" && /https?:\/\//.test(r.source), `בקשה ${r.id} עם מקור וקישור`);
  ok(Array.isArray(r.chapters) && r.chapters.length > 0 && r.chapters.every(c => Number.isInteger(c) && c >= 1 && c <= 150), `בקשה ${r.id} פרקים 1-150`);
  ok(new Set(r.chapters).size === r.chapters.length, `בקשה ${r.id} בלי פרק כפול`);
}

console.log(`
${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
