// בדיקות ליבת החישוב של התהילים האישי. מריצים: node worker/_test_personal.mjs
// השנים שבשימוש (מחושב מראש ומאומת בבדיקה 1 מול Intl):
//   תשפ"ג 5783 פשוטה, חשוון 30 כסלו 30 | תשפ"ד 5784 מעוברת, חשוון 29 כסלו 29
//   תשפ"ה 5785 פשוטה, חשוון 30 כסלו 30 | תשפ"ו 5786 פשוטה, חשוון 29 כסלו 30
//   תשפ"ז 5787 מעוברת, חשוון 30 כסלו 30 | תרל"ז 5637, תרל"ח 5638 (לבדיקת פרק 150)
import fs from "fs";
import * as C from "../tehillim/personal-core.js";

let fail = 0, pass = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else { pass++; console.log("ok  ", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? "" : "  got " + JSON.stringify(a) + " want " + JSON.stringify(b)));
const H = (year, month, day) => ({ year, month, day });
const { NISAN, CHESHVAN, KISLEV, TEVET, ADAR, ADAR_I, ADAR_II } = C.MONTH;
const ch = (birth, today, gender = "m") => {
  const r = C.chapterFor({ name: "פלוני", gender, birth }, today);
  return r.ok ? r.chapter : r.code;
};

// ---------- 1. הלוח: כל יום 1900-2100 מול Intl (calendar hebrew) ----------
{
  const names = { Tishri: 7, Heshvan: 8, Kislev: 9, Tevet: 10, Shevat: 11, "Adar I": 12, Adar: 12, "Adar II": 13,
    Nisan: 1, Iyar: 2, Sivan: 3, Tamuz: 4, Av: 5, Elul: 6 };
  const f = new Intl.DateTimeFormat("en-u-ca-hebrew", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  let bad = 0, n = 0, back = 0;
  for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2100, 11, 31); t += 864e5) {
    const d = new Date(t + 12 * 36e5);
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    const want = H(+p.year, names[p.month], +p.day);
    const got = C.gregorianToHebrew(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (got.year !== want.year || got.month !== want.month || got.day !== want.day) { if (bad++ < 3) console.log("  diff", d.toISOString().slice(0, 10), got, want); }
    const g = C.hebrewToGregorian(got);
    if (g.year !== d.getUTCFullYear() || g.month !== d.getUTCMonth() + 1 || g.day !== d.getUTCDate()) back++;
    n++;
  }
  ok(bad === 0, "המרה לועזי->עברי תואמת Intl בכל " + n + " הימים 1900-2100");
  ok(back === 0, "המרה עברי->לועזי מחזירה בדיוק את אותו יום בכל " + n + " הימים");
}
eq(C.hebrewToGregorian(H(5787, KISLEV, 12)), { year: 2026, month: 11, day: 22 }, "י\"ב כסלו תשפ\"ז = 22.11.2026");
eq([C.isLeapYear(5784), C.isLeapYear(5785), C.isLeapYear(5786), C.isLeapYear(5787)], [true, false, false, true], "תשפ\"ד ותשפ\"ז מעוברות, תשפ\"ה ותשפ\"ו פשוטות");
eq([5783, 5784, 5785, 5786, 5787].map((y) => [C.daysInMonth(CHESHVAN, y), C.daysInMonth(KISLEV, y)]),
  [[30, 30], [29, 29], [30, 30], [29, 30], [30, 30]], "אורכי חשוון/כסלו בתשפ\"ג-תשפ\"ז");
eq(C.formatHebrewDate(H(5787, KISLEV, 12)), 'י"ב כסלו תשפ"ז', "עיצוב תאריך עברי בפיסוק פשוט");
eq(C.monthsForYear(5787).map((m) => m.name).slice(5, 7), ["אדר א'", "אדר ב'"], "שנה מעוברת: אדר א' ואדר ב' ברשימת החודשים");
eq(C.monthsForYear(5786).map((m) => m.name), ["תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר", "ניסן", "אייר", "סיון", "תמוז", "מנחם אב", "אלול"], "שנה פשוטה: 12 חודשים, אדר אחד, בכתיב שנקבע");

// ---------- 2. אדר: כל ארבעת הצירופים ----------
// נולד ב-י' אדר תשפ"ה (פשוטה). בתשפ"ו (פשוטה) יום ההולדת י' אדר. בתשפ"ז (מעוברת) - י' אדר ב' (רמ"א).
eq(C.birthdayInYear(H(5785, ADAR, 10), 5787), H(5787, ADAR_II, 10), "אדר בפשוטה -> שנה מעוברת: אדר ב'");
eq(C.birthdayInYear(H(5785, ADAR, 10), 5786), H(5786, ADAR, 10), "אדר בפשוטה -> שנה פשוטה: אדר");
ok(ch(H(5785, ADAR, 10), H(5787, ADAR_I, 10)) === 2, "י' אדר א' תשפ\"ז: עוד לא יום ההולדת - בן 1, פרק ב");
ok(ch(H(5785, ADAR, 10), H(5787, ADAR_II, 9)) === 2, "ט' אדר ב' תשפ\"ז: עדיין פרק ב");
ok(ch(H(5785, ADAR, 10), H(5787, ADAR_II, 10)) === 3, "י' אדר ב' תשפ\"ז: יום ההולדת, פרק ג");
// נולד ט"ו אדר א' תשפ"ד (מעוברת). תשפ"ו פשוטה - ט"ו אדר (שו"ע). תשפ"ז מעוברת - ט"ו אדר א' (מ"ב מג).
eq(C.birthdayInYear(H(5784, ADAR_I, 15), 5786), H(5786, ADAR, 15), "אדר א' -> שנה פשוטה: אדר, אותו יום");
eq(C.birthdayInYear(H(5784, ADAR_I, 15), 5787), H(5787, ADAR_I, 15), "אדר א' -> שנה מעוברת: אדר א'");
ok(ch(H(5784, ADAR_I, 15), H(5786, ADAR, 14)) === 2 && ch(H(5784, ADAR_I, 15), H(5786, ADAR, 15)) === 3, "אדר א' תשפ\"ד: בתשפ\"ו מתחלף מ-ב ל-ג בט\"ו אדר");
ok(ch(H(5784, ADAR_I, 15), H(5787, ADAR_I, 14)) === 3 && ch(H(5784, ADAR_I, 15), H(5787, ADAR_I, 15)) === 4, "אדר א' תשפ\"ד: בתשפ\"ז מתחלף ל-ד בט\"ו אדר א'");
// נולד כ' אדר ב' תשפ"ד. תשפ"ה פשוטה - כ' אדר. תשפ"ז מעוברת - כ' אדר ב' (ולא אדר א').
eq(C.birthdayInYear(H(5784, ADAR_II, 20), 5785), H(5785, ADAR, 20), "אדר ב' -> שנה פשוטה: אדר, אותו יום");
eq(C.birthdayInYear(H(5784, ADAR_II, 20), 5787), H(5787, ADAR_II, 20), "אדר ב' -> שנה מעוברת: אדר ב'");
ok(ch(H(5784, ADAR_II, 20), H(5787, ADAR_I, 20)) === 3, "אדר ב' תשפ\"ד: כ' אדר א' תשפ\"ז עוד לא יום הולדת (פרק ג)");
ok(ch(H(5784, ADAR_II, 20), H(5787, ADAR_II, 20)) === 4, "אדר ב' תשפ\"ד: כ' אדר ב' תשפ\"ז - פרק ד");
// ל' אדר א' תשפ"ד, ובשנה פשוטה - א' ניסן (הכרעת יעקב ז2). בתשפ"ז (מעוברת) - ל' אדר א'.
eq(C.birthdayInYear(H(5784, ADAR_I, 30), 5785), H(5785, NISAN, 1), "ל' אדר א' -> שנה פשוטה: א' ניסן");
eq(C.birthdayInYear(H(5784, ADAR_I, 30), 5787), H(5787, ADAR_I, 30), "ל' אדר א' -> שנה מעוברת: ל' אדר א'");
ok(ch(H(5784, ADAR_I, 30), H(5785, ADAR, 29)) === 1 && ch(H(5784, ADAR_I, 30), H(5785, NISAN, 1)) === 2, "ל' אדר א' תשפ\"ד: בתשפ\"ה פרק ב רק מא' ניסן");

// ---------- 3. ל' חשוון, ל' כסלו, והמשנה ברורה בא' כסלו ----------
// ל' חשוון תשפ"ג (חשוון מלא). תשפ"ד חשוון חסר - א' כסלו. תשפ"ה חשוון מלא - ל' חשוון.
eq(C.birthdayInYear(H(5783, CHESHVAN, 30), 5784), H(5784, KISLEV, 1), "ל' חשוון -> חשוון חסר: א' כסלו");
eq(C.birthdayInYear(H(5783, CHESHVAN, 30), 5785), H(5785, CHESHVAN, 30), "ל' חשוון -> חשוון מלא: ל' חשוון");
ok(ch(H(5783, CHESHVAN, 30), H(5784, CHESHVAN, 29)) === 1 && ch(H(5783, CHESHVAN, 30), H(5784, KISLEV, 1)) === 2, "ל' חשוון תשפ\"ג: בתשפ\"ד מתחלף בא' כסלו");
// ל' כסלו תשפ"ג. תשפ"ד כסלו חסר - א' טבת.
eq(C.birthdayInYear(H(5783, KISLEV, 30), 5784), H(5784, TEVET, 1), "ל' כסלו -> כסלו חסר: א' טבת");
ok(ch(H(5783, KISLEV, 30), H(5784, KISLEV, 29)) === 1 && ch(H(5783, KISLEV, 30), H(5784, TEVET, 1)) === 2, "ל' כסלו תשפ\"ג: בתשפ\"ד מתחלף בא' טבת");
// א' כסלו תשפ"ד (חשוון תשפ"ד חסר). תשפ"ה חשוון מלא - ל' חשוון (מ"ב נה ס"ק מה, ז3). תשפ"ו חשוון חסר - א' כסלו.
eq(C.birthdayInYear(H(5784, KISLEV, 1), 5785), H(5785, CHESHVAN, 30), "משנה ברורה: א' כסלו כשחשוון היה חסר -> חשוון מלא: ל' חשוון");
eq(C.birthdayInYear(H(5784, KISLEV, 1), 5786), H(5786, KISLEV, 1), "א' כסלו כשחשוון היה חסר -> חשוון חסר: א' כסלו");
ok(ch(H(5784, KISLEV, 1), H(5785, CHESHVAN, 29)) === 1, "א' כסלו תשפ\"ד: כ\"ט חשוון תשפ\"ה עוד פרק א");
ok(ch(H(5784, KISLEV, 1), H(5785, CHESHVAN, 30)) === 2, "א' כסלו תשפ\"ד: ל' חשוון תשפ\"ה כבר פרק ב");
ok(C.chapterFor({ name: "א", gender: "m", birth: H(5784, KISLEV, 1) }, H(5785, KISLEV, 1)).isBirthday === false, "ובא' כסלו תשפ\"ה אין יום הולדת שני");
// ביקורת: א' כסלו תשפ"ג (חשוון תשפ"ג מלא) - אין הקדמה, נשאר א' כסלו גם בשנה שחשוון מלא.
eq(C.birthdayInYear(H(5783, KISLEV, 1), 5785), H(5785, KISLEV, 1), "א' כסלו כשחשוון היה מלא: נשאר א' כסלו");
// היקש: א' טבת תשפ"ד (כסלו תשפ"ד חסר). תשפ"ה כסלו מלא - ל' כסלו.
eq(C.birthdayInYear(H(5784, TEVET, 1), 5785), H(5785, KISLEV, 30), "היקש: א' טבת כשכסלו היה חסר -> כסלו מלא: ל' כסלו");
eq(C.birthdayInYear(H(5784, TEVET, 1), 5786), H(5786, KISLEV, 30), "א' טבת תשפ\"ד -> תשפ\"ו (כסלו מלא): ל' כסלו");

// ---------- 4. תינוק, הסבר, פרק 150 ----------
const T = H(5787, KISLEV, 12); // היום: י"ב כסלו תשפ"ז
{
  const r = C.chapterFor({ name: "נחמן", parent: "שרה", gender: "m", birth: H(5787, KISLEV, 5) }, T);
  eq([r.chapter, r.line], [1, "נחמן בן שרה - בן פחות משנה, בשנתו הראשונה - פרק א"], "תינוק לפני יום הולדת ראשון: פרק א");
  const z = C.chapterFor({ name: "נחמן", gender: "m", birth: T }, T);
  eq([z.chapter, z.isBirthday], [1, false], "נולד היום: פרק א, ואין זה יום הולדת");
  const y = C.chapterFor({ name: "יוסי", parent: "שרה", gender: "m", birth: H(5774, KISLEV, 12) }, T);
  eq([y.line, y.isBirthday], ["יוסי בן שרה - בן 13, בשנתו ה-14 - פרק יד", true], "בן 13 ביום הולדתו: פרק יד, והשורה בלשון זכר");
  const s = C.chapterFor({ name: "שרה", parent: "רחל", gender: "f", birth: H(5774, KISLEV, 13) }, T);
  eq(s.line, "שרה בת רחל - בת 12, בשנתה ה-13 - פרק יג", "בת - לשון נקבה, יום לפני יום ההולדת");
  const n = C.chapterFor({ name: "דוד", gender: "m", birth: H(5772, TEVET, 1) }, T);
  eq(n.line, "דוד - בן 14, בשנתו ה-15 - פרק טו", "בלי שם הורה, וט\"ו ולא י\"ה");
  eq(C.explainChapter(1, "f"), "בת שנה, בשנתה ה-2 - פרק ב", "בת שנה");
  eq(C.explainChapter(2, "m"), "בן שנתיים, בשנתו ה-3 - פרק ג", "בן שנתיים");
}
ok(ch(H(5638, KISLEV, 12), T) === 150, "נולד י\"ב כסלו תרל\"ח: היום בן 149 - פרק ק\"נ");
ok(ch(H(5638, KISLEV, 12), H(5787, KISLEV, 11)) === 149, "יום לפני: פרק קמ\"ט");
ok(ch(H(5637, KISLEV, 13), T) === 150, "נולד י\"ג כסלו תרל\"ז: עדיין בן 149 - פרק ק\"נ");
ok(ch(H(5637, KISLEV, 12), T) === "over150", "נולד י\"ב כסלו תרל\"ז: בן 150 - נדחה (הכרעת יעקב ז1)");

// ---------- 5. אימות ההזנה ----------
const V = (b) => C.validateBirth(b, T);
ok(V(H(5787, KISLEV, 13)).code === "future", "תאריך עתידי נדחה: " + V(H(5787, KISLEV, 13)).error);
ok(V(H(5784, CHESHVAN, 30)).code === "no-day30", "ל' חשוון תשפ\"ד (חשוון חסר) נדחה: " + V(H(5784, CHESHVAN, 30)).error);
ok(V(H(5786, KISLEV, 30)).ok === true, "ל' כסלו תשפ\"ו (כסלו מלא) מתקבל");
ok(V(H(5785, ADAR_II, 1)).code === "no-adar2", "אדר ב' בשנה פשוטה נדחה: " + V(H(5785, ADAR_II, 1)).error);
ok(V(H(5785, ADAR, 30)).code === "no-day30", "ל' אדר בשנה פשוטה נדחה");
ok(V(H(5784, ADAR_I, 30)).ok === true, "ל' אדר א' בשנה מעוברת מתקבל");
ok(V(H(5784, ADAR_II, 30)).code === "no-day30", "ל' אדר ב' נדחה");
ok(V({ year: 5780, month: 3 }).code === "missing", "תאריך חסר נדחה");
ok(V(H(5637, KISLEV, 12)).code === "over150", "גיל שמוביל לפרק מעל 150 נדחה: " + V(H(5637, KISLEV, 12)).error);

// ---------- 6. לידה לפי תאריך לועזי ----------
// 22.11.2026 = י"ב כסלו; אחרי השקיעה - י"ג כסלו.
eq(C.birthFromGregorian(2026, 11, 22, false).hebrew, H(5787, KISLEV, 12), "לועזי לפני השקיעה: י\"ב כסלו");
eq(C.birthFromGregorian(2026, 11, 22, true).hebrew, H(5787, KISLEV, 13), "לועזי אחרי השקיעה: י\"ג כסלו");
{
  const u = C.birthFromGregorian(2026, 11, 22, null);
  eq([u.hebrew, u.alternative, u.uncertain], [H(5787, KISLEV, 12), H(5787, KISLEV, 13), true], "לא ידוע: מוחזרות שתי האפשרויות");
}
eq(C.birthFromGregorian(2026, 12, 31, true).hebrew, C.gregorianToHebrew(2027, 1, 1), "אחרי השקיעה בסוף שנה לועזית עובר ליום הבא כראוי");

// ---------- 7. מעבר השקיעה ----------
// 22.11.2026: שקיעה בירושלים בערך 16:37 (שעון חורף, UTC+2).
const isr = (s) => new Date(s + "+02:00");
eq(C.hebrewToday(isr("2026-11-22T16:20:00")), H(5787, KISLEV, 12), "22.11.2026 16:20 - י\"ב כסלו");
eq(C.hebrewToday(isr("2026-11-22T16:55:00")), H(5787, KISLEV, 13), "22.11.2026 16:55 אחרי השקיעה - י\"ג כסלו");
eq(C.hebrewToday(isr("2026-11-22T23:59:00")), H(5787, KISLEV, 13), "23:59 - עדיין י\"ג כסלו");
// באג שנמצא בבנייה: אחרי השקיעה ב-31.12 היום הבא נפל ל-1.1 של אותה שנה לועזית (י"ב טבת תשפ"ו במקום כ"ב טבת תשפ"ז)
eq(C.hebrewToday(isr("2026-12-31T18:00:00")), H(5787, TEVET, 22), "31.12.2026 אחרי השקיעה - כ\"ב טבת תשפ\"ז (מעבר שנה לועזית)");
eq(C.hebrewToday(isr("2026-11-23T00:01:00")), H(5787, KISLEV, 13), "00:01 ב-23.11 - י\"ג כסלו (לא מתחלף בחצות)");
{
  const p = { name: "חנה", gender: "f", birth: H(5786, KISLEV, 13) };
  ok(C.chapterFor(p, C.hebrewToday(isr("2026-11-22T16:20:00"))).chapter === 1 &&
     C.chapterFor(p, C.hebrewToday(isr("2026-11-22T16:55:00"))).chapter === 2, "נולדה י\"ג כסלו תשפ\"ו: הפרק מתחלף בשקיעה של 22.11, לא בחצות");
}
// אותה החלפת יום כמו "תהילים להיום" ב-tehillim.html - משווים לפונקציות שבדף, כל חצי שעה במשך שנה.
{
  const html = fs.readFileSync(new URL("../tehillim.html", import.meta.url), "utf8");
  const code = html.slice(html.indexOf("  function sunsetUtcMs"), html.indexOf("  function unitsFor"));
  const P = new Function(code + "; return {sunsetUtcMs, effectiveDay};")();
  let diff = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 30 * 60e3) {
    const now = new Date(t), e = P.effectiveDay(now);
    const want = C.gregorianToHebrew(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate());
    const got = C.hebrewToday(now);
    if (C.compareHebrew(got, want) !== 0) diff++;
    if (P.sunsetUtcMs(now) !== C.sunsetUtcMs(now)) diff++;
  }
  ok(diff === 0, "hebrewToday מחליף יום באותו רגע כמו tehillim.html, בכל חצי שעה של 2026");
}

// ---------- 8. הקריאה היומית ----------
const units = JSON.parse(fs.readFileSync(new URL("../tehillim/units.json", import.meta.url), "utf8"));
{
  let same = true;
  for (let c = 1; c <= 150; c++) if (JSON.stringify(C.unitIndexesFor(c)) !== JSON.stringify(C.unitIndexesFor(c, units))) same = false;
  ok(same, "מיפוי פרק->יחידות בלי units.json זהה לקובץ, בכל 150 הפרקים");
}
{
  // היום י"ב כסלו תשפ"ז.
  // יוסי (13, פרק יד) ושרה (12, פרק יג) ודוד (13, פרק יד) - יוסי ודוד באותו פרק.
  // אליהו בן 22 - פרק כג, שהוא גם פרק קבוע. ותיק בן 118 - פרק קיט. סבא בן 149 - פרק קנ.
  // פרקים קבועים: כג, וטווח א-ג, וגם 150 ברשימה הקבועה.
  const people = [
    { name: "יוסי", parent: "שרה", gender: "m", birth: H(5774, KISLEV, 5) },
    { name: "שרה", parent: "רחל", gender: "f", birth: H(5774, KISLEV, 13) },
    { name: "דוד", parent: "מרים", gender: "m", birth: H(5773, TEVET, 1) },
    { name: "אליהו", gender: "m", birth: H(5765, CHESHVAN, 1) },
    { name: "ותיק", gender: "m", birth: H(5668, TEVET, 5) },
    { name: "סבא", gender: "m", birth: H(5638, KISLEV, 1) },
    { name: "שגוי", gender: "m", birth: H(5790, NISAN, 1) },
  ];
  const r = C.buildDailyReading(people, [23, [3, 1], { from: 150, to: 150 }], { units }, T);
  const chs = r.items.filter((i) => i.type === "chapter");
  eq(r.chapters, [1, 2, 3, 13, 14, 23, 119, 150], "פרקים ייחודיים בסדר עולה, ק\"נ בסוף פעם אחת");
  eq(r.chapterCount, 8, "מונה הפרקים: 8");
  eq([r.items[0].type, r.items[r.items.length - 1].type], ["opening", "closing"], "פתיחה בראש, סיום בסוף");
  eq(r.items[0].parts.map((p) => p.ref), ["תהילים צה, א-ג"], "פתיחה: צה א-ג בלבד (יהי רצון ממתין לצילום, ז5)");
  eq(r.items[r.items.length - 1].parts.map((p) => p.ref), ["תהילים יד, ז", "תהילים לז, לט-מ"], "סיום: יד ז ולז לט-מ");
  const c14 = chs.find((c) => c.chapter === 14);
  eq(c14.subtitle, "לרפואה ולהצלחה של יוסי בן שרה ודוד בן מרים", "שני אנשים באותו פרק: נקרא פעם אחת עם שני השמות");
  const c23 = chs.find((c) => c.chapter === 23);
  eq([c23.fixed, c23.names, c23.title], [true, ["אליהו"], 'תהילים כ"ג'], "פרק קבוע שהוא גם פרק של אדם: פעם אחת, מסומן קבוע ועם השם");
  eq(chs.find((c) => c.chapter === 2).subtitle, "פרק קבוע מהרשימה שלך", "טווח הפוך [3,1] נקרא כ-א עד ג, ופרק קבוע מסומן");
  const c119 = chs.find((c) => c.chapter === 119);
  eq([c119.units.length, c119.units[0].i, c119.units[21].i, c119.units[0].part, c119.units[21].part], [22, 118, 139, 1, 22], "קי\"ט: 22 יחידות ברצף, 118-139");
  ok(c119.units[0].name === units[118].name, "קי\"ט: שם החלק מ-units.json (" + c119.units[0].name + ")");
  const c150 = chs[chs.length - 1];
  eq([c150.chapter, c150.final, c150.names, c150.fixed, chs.filter((c) => c.chapter === 150).length], [150, true, ["סבא"], true, 1], "ק\"נ של אדם: פעם אחת בסוף, עם השם");
  eq(chs.map((c) => c.position), [1, 2, 3, 4, 5, 6, 7, 8], "מיקום רץ לכל פרק (לשורה 'פרק 4 מתוך 8')");
  eq(r.skipped.map((s) => s.code), ["future"], "אדם עם תאריך שגוי מדולג ומדווח");
  eq(r.key, "5787-9-12", "מפתח יום הקריאה");
}
{
  // בלי אנשים ובלי פרקים קבועים - רק פתיחה, ק"נ וסיום
  const r = C.buildDailyReading([], [], {}, T);
  eq(r.chapters, [150], "רשימה ריקה: ק\"נ בלבד");
  eq(r.items.find((i) => i.chapter === 150).units.map((u) => u.i), [170], "ק\"נ = יחידה 170 גם בלי units.json");
}
{
  // ביום ההולדת - רק הפרק החדש: נולד י"ב כסלו תשע"ד, היום י"ב כסלו תשפ"ז - פרק יד בלבד, בלי יג.
  const r = C.buildDailyReading([{ name: "יוסי", gender: "m", birth: H(5774, KISLEV, 12) }], [], {}, T);
  eq(r.chapters, [14, 150], "ביום ההולדת רק הפרק החדש (ז4)");
  ok(r.people[0].isBirthday === true, "ומסומן שהיום יום ההולדת");
}
{
  // פרקים נוספים מהממשק (פרק לבקשה) ונוסח שהוזן מבחוץ
  const r = C.buildDailyReading([], [], { extraChapters: [{ chapter: 20, label: "פרק לבקשה" }], textBefore: "X", textAfter: "Y" }, T);
  eq([r.chapters, r.items[1].subtitle, r.items[0].parts[0].text, r.items[r.items.length - 1].parts[2].text], [[20, 150], "פרק לבקשה", "X", "Y"], "פרק נוסף ונוסח פתיחה/סיום כשהם מסופקים");
}
eq(C.normalizeFixed([0, [149, 160], "x", { from: 5 }]), [5, 149, 150], "פרקים קבועים: מחוץ לטווח נחתך, קלט לא תקין מתעלמים");

console.log("\n" + pass + " עברו, " + fail + " נכשלו");
process.exit(fail ? 1 : 0);
