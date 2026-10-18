// בדיקת „התהילים של היום": שקיעה, החלפת יום, חודש חסר, חלוקה שבועית. מריצים: node worker/_test_today.mjs
import fs from "fs";
const html = fs.readFileSync(new URL("../tehillim.html", import.meta.url), "utf8");
const a = html.indexOf("  var MONTH_DIV"), b = html.indexOf("  window.__thTodayPlan");
const code = html.slice(a, b);
const units = JSON.parse(fs.readFileSync(new URL("../tehillim/units.json", import.meta.url), "utf8"));
const f = new Function("TH_UNITS_IN", code + "; TH_UNITS = TH_UNITS_IN; return {sunsetUtcMs, todayPlan, unitsFor, effectiveDay, hebDay};" .replace("TH_UNITS = TH_UNITS_IN", "var TH_UNITS = TH_UNITS_IN"));
const T = f(units);
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const isr = (s) => new Date(s + "+03:00");
// שקיעה ב-18.10.2026 בירושלים - הלוח המובנה אומר 18:03
const ss = new Date(T.sunsetUtcMs(new Date(Date.UTC(2026, 9, 18, 10))));
const hm = ss.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
ok(Math.abs(ss.getTime() - isr("2026-10-18T18:03:00").getTime()) < 4 * 60e3, "שקיעה 18.10 בירושלים " + hm + " (צפוי 18:03, סטייה עד 4 דק׳)");
ok(T.todayPlan("month", isr("2026-10-18T17:30:00")).label.startsWith("ז׳"), "17:30 ביום ראשון 18.10 = ז׳ חשון");
ok(T.todayPlan("month", isr("2026-10-18T18:30:00")).label.startsWith("ח׳"), "18:30 אחרי השקיעה = ח׳ חשון");
const p7 = T.todayPlan("month", isr("2026-10-18T12:00:00"));
ok(JSON.stringify(p7.ranges) === "[[39,43]]", "יום ז׳ = פרקים ל״ט-מ״ג");
// חודש חסר: מחפשים יום כ״ט שאחריו א׳
let found = null;
for (let d = 0; d < 400 && !found; d++) {
  const t = new Date(Date.UTC(2026, 9, 1, 9) + d * 864e5);
  if (T.hebDay(t) === 29 && T.hebDay(new Date(t.getTime() + 864e5)) === 1) found = t;
}
const ps = T.todayPlan("month", new Date(found.getTime()));
ok(ps.ranges.length === 2 && ps.ranges[1][0] === 145, "חודש חסר " + found.toISOString().slice(0,10) + ": כ״ט קורא גם ק״מה-ק״נ");
// יום כ״ה וכ״ו - פרק קי״ט מפוצל
const u25 = T.unitsFor([["119a"]]), u26 = T.unitsFor([["119b"]]);
ok(u25.length === 12 && u26.length === 10, "קי״ט: 12 אותיות ביום כ״ה (פס׳ 1-96), 10 ביום כ״ו");
// שבועי: שבת = ק״כ-ק״נ; מוצאי שבת (אחרי השקיעה בשבת) = יום ראשון
ok(JSON.stringify(T.todayPlan("week", isr("2026-10-24T12:00:00")).ranges) === "[[120,150]]", "שבת = ק״כ-ק״נ");
ok(JSON.stringify(T.todayPlan("week", isr("2026-10-24T19:00:00")).ranges) === "[[1,29]]", "מוצאי שבת = חלק יום ראשון");
// כל 30 הימים מכסים את 150 הפרקים בדיוק פעם אחת
const seen = new Map();
const MD = code.match(/var MONTH_DIV = (\[[\s\S]*?\]\]);/)[1];
for (const r of eval(MD)) for (const u of T.unitsFor([r])) seen.set(u.i, (seen.get(u.i) || 0) + 1);
ok(seen.size === 171 && [...seen.values()].every(v => v === 1), "החלוקה החודשית מכסה 171 יחידות, כל אחת פעם אחת");
process.exit(fail ? 1 : 0);
