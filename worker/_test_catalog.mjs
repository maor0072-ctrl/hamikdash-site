// בדיקת הקטלוג הציבורי: פונקציות טהורות, בלי Worker. node worker/_test_catalog.mjs
import { chapterStats, selectItems, renderCatalog, labelFor, esc } from "./tehillim-catalog.js";
import { UNITS } from "./tehillim-units.js";

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (extra ? "   " + extra : ""));
  if (!cond) fails++;
}
const N = UNITS.length;
const NOW = Date.parse("2026-10-08T12:00:00+03:00");
const DAY = 86400000;
const row = (o) => Object.assign({ ok: true, exists: true, status: "open", kind: "private",
  patientName: "חנה", motherName: "פנינה", gender: "f", intent: "refua", targetDate: "",
  createdAt: NOW - DAY, lastMarkAt: 0, states: "f".repeat(N), id: "abc123" }, o);

// 1. פרקים ולא יחידות: 150 מתוך 171
check("150 פרקים", chapterStats("f".repeat(N)).total === 150, String(chapterStats("f".repeat(N)).total));

// 2. קי"ט: חלק אחד נקרא = הפרק לא פנוי ולא נקרא
const ch119 = UNITS.filter((u) => u.ch === 119).map((u) => u.i);
let st = "f".repeat(N).split("");
st[ch119[0]] = "r";
let s = chapterStats(st.join(""));
check("קי\"ט חלקי: לא פנוי ולא נקרא", s.free === 149 && s.read === 0 && s.taken === 1, JSON.stringify(s));
for (const i of ch119) st[i] = "r";
s = chapterStats(st.join(""));
check("קי\"ט שלם: נקרא", s.read === 1 && s.free === 149, JSON.stringify(s));

// 3. סינון
const items = selectItems([
  row({ id: "open1" }),
  row({ id: "closed", status: "closed" }),
  row({ id: "full", states: "r".repeat(N) }),
  row({ id: "allTaken", states: "t".repeat(N) }),
  row({ id: "stale", createdAt: NOW - 100 * DAY }),
  row({ id: "staleButRead", createdAt: NOW - 100 * DAY, lastMarkAt: NOW - 2 * DAY }),
  row({ id: "ghost", exists: false }),
  null,
  row({ id: "newer", createdAt: NOW - 1000 }),
  row({ id: "klali", kind: "klali", title: "הקריאה הכללית", createdAt: NOW - 400 * DAY }),
], NOW);
const ids = items.map((i) => i.id);
check("מסנן סגור/מלא/תפוס-כולו/ישן/לא-קיים", ids.join() === "klali,newer,open1,staleButRead", ids.join());
check("הקריאה הכללית ראשונה גם כשהיא הישנה ביותר ואינה נחשבת ישנה", ids[0] === "klali");

// 4. תווית
check("תווית נקבה", labelFor(row({})) === "לרפואת חנה בת פנינה", labelFor(row({})));
check("תווית זכר ועילוי נשמה", labelFor(row({ gender: "m", intent: "neshama", patientName: "דוד" })) === "לעילוי נשמת דוד בן פנינה");

// 5. HTML
const html = renderCatalog(selectItems([row({ id: "x1", patientName: "<b>x</b>", targetDate: "2026-10-20" })], NOW), {});
check("אין script", !/<script/i.test(html));
check("RTL ועברית", /<html lang="he" dir="rtl">/.test(html));
check("הקידוד מנטרל תגית", !html.includes("<b>x</b>") && html.includes("&lt;b&gt;"));
check("תאריך יעד מעוצב", html.includes("20.10.2026"));
check("קישור הספר קצר וציבורי", html.includes('href="https://t.hamikdash.co.il/x1"'));
check("אין מקף ארוך", !/[–—]/.test(html));
check("נכסים בכתובת מלאה", html.includes('href="https://hamikdash.co.il/assets/style.css"'));
const empty = renderCatalog([], {});
check("רשימה ריקה: הודעה ולא שבר", empty.includes("אין ספרים פתוחים") && !/<ul/.test(empty));
check("כפתור קבוצה מופיע רק כשנמסר", !html.includes("קבוצת הוואטסאפ") &&
  renderCatalog([], { groupUrl: "https://t.hamikdash.co.il/kvutza" }).includes("קבוצת הוואטסאפ"));
check("esc גרשיים", esc('a"b\'c') === "a&quot;b&#39;c");

console.log(fails ? "\nFAILED: " + fails : "\nכל הבדיקות עברו");
process.exit(fails ? 1 : 0);
