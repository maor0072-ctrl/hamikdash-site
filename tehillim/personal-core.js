// תהילים אישי - ליבת החישוב. ES module, רץ בדפדפן וב-node, בלי תלויות ובלי רשת.
// הוראות הבנייה: C:\AIOS\aios\plans\2026-11-22-tehillim-personal-build.md
// הלוח העברי מחושב אלגוריתמית (Calendrical Calculations, Reingold-Dershowitz, הלוח הקבוע עם הדחיות),
// ונבדק מול Intl.DateTimeFormat עם calendar hebrew על כל יום בין 1900 ל-2100 (worker/_test_personal.mjs).
//
// תאריך עברי = { year, month, day }. מספור החודשים כמו ב-Hebcal:
// 1 ניסן, 2 אייר, 3 סיון, 4 תמוז, 5 מנחם אב, 6 אלול, 7 תשרי, 8 חשוון, 9 כסלו, 10 טבת, 11 שבט,
// 12 אדר (בשנה פשוטה) או אדר א' (בשנה מעוברת), 13 אדר ב' (רק בשנה מעוברת). השנה מתחלפת בא' תשרי.

export const MONTH = { NISAN: 1, IYYAR: 2, SIVAN: 3, TAMUZ: 4, AV: 5, ELUL: 6, TISHREI: 7, CHESHVAN: 8,
  KISLEV: 9, TEVET: 10, SHVAT: 11, ADAR: 12, ADAR_I: 12, ADAR_II: 13 };

const MONTH_NAMES = ["", "ניסן", "אייר", "סיון", "תמוז", "מנחם אב", "אלול", "תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר", "אדר ב'"];

// ---------- לוח עברי ----------
const EPOCH = -1373427; // R.D. של א' תשרי שנת א

export function isLeapYear(y) { return ((7 * y + 1) % 19) < 7; }
export function monthsInYear(y) { return isLeapYear(y) ? 13 : 12; }

function elapsedDays(y) {
  const months = Math.floor((235 * y - 234) / 19);
  const parts = 12084 + 13753 * months;
  const day = 29 * months + Math.floor(parts / 25920);
  return ((3 * (day + 1)) % 7) < 3 ? day + 1 : day;
}
function yearDelay(y) {
  const ny0 = elapsedDays(y - 1), ny1 = elapsedDays(y), ny2 = elapsedDays(y + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}
const nyCache = new Map();
function newYear(y) {
  let v = nyCache.get(y);
  if (v === undefined) { v = EPOCH + elapsedDays(y) + yearDelay(y); nyCache.set(y, v); }
  return v;
}
export function daysInYear(y) { return newYear(y + 1) - newYear(y); }
export function isLongCheshvan(y) { return daysInYear(y) % 10 === 5; }
export function isShortKislev(y) { return daysInYear(y) % 10 === 3; }

export function daysInMonth(month, year) {
  if (month === 2 || month === 4 || month === 6 || month === 10 || month === 13) return 29;
  if (month === 12 && !isLeapYear(year)) return 29;
  if (month === 8 && !isLongCheshvan(year)) return 29;
  if (month === 9 && isShortKislev(year)) return 29;
  return 30;
}

// מספר יום רציף (R.D.) - להשוואה ולחיסור בין תאריכים
export function hebrewToAbs(hd) {
  const { year, month, day } = hd;
  let rd = newYear(year) + day - 1;
  const last = monthsInYear(year);
  if (month < 7) {
    for (let m = 7; m <= last; m++) rd += daysInMonth(m, year);
    for (let m = 1; m < month; m++) rd += daysInMonth(m, year);
  } else {
    for (let m = 7; m < month; m++) rd += daysInMonth(m, year);
  }
  return rd;
}
export function absToHebrew(rd) {
  let year = Math.floor((rd - EPOCH) / (35975351 / 98496)) + 1;
  while (newYear(year) > rd) year--;
  while (newYear(year + 1) <= rd) year++;
  let month = rd < hebrewToAbs({ year, month: 1, day: 1 }) ? 7 : 1;
  while (rd > hebrewToAbs({ year, month, day: daysInMonth(month, year) })) month++;
  return { year, month, day: rd - hebrewToAbs({ year, month, day: 1 }) + 1 };
}

const RD_1970 = 719163;
function gregToAbs(gy, gm, gd) {
  const d = new Date(0);
  d.setUTCFullYear(gy, gm - 1, gd); // חריגה (יום 32 וכו') מתגלגלת כראוי, כולל מעבר שנה
  return Math.round(d.getTime() / 864e5) + RD_1970;
}
function absToGreg(rd) {
  const d = new Date((rd - RD_1970) * 864e5);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// לועזי -> עברי, לפי היום (לפני השקיעה). gm הוא 1-12.
export function gregorianToHebrew(gy, gm, gd) { return absToHebrew(gregToAbs(gy, gm, gd)); }
// עברי -> לועזי: התאריך הלועזי שבו חל היום העברי (מהבוקר עד השקיעה; הערב שלפניו שייך לו כבר)
export function hebrewToGregorian(hd) { return absToGreg(hebrewToAbs(hd)); }

export function compareHebrew(a, b) { return hebrewToAbs(a) - hebrewToAbs(b); }
export function addDays(hd, n) { return absToHebrew(hebrewToAbs(hd) + n); }

// ---------- שקיעה בירושלים והיום העברי עכשיו ----------
// זהה לפונקציה ב-tehillim.html ("תהילים להיום"), כדי ששני המסלולים יחליפו יום באותו רגע.
export function sunsetUtcMs(d) {
  var lat = 31.778, lng = 35.235, R = Math.PI / 180;
  var y = d.getUTCFullYear();
  var N = Math.round((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 0)) / 864e5);
  var lh = lng / 15, t = N + ((18 - lh) / 24);
  var M = 0.9856 * t - 3.289;
  var L = (M + 1.916 * Math.sin(M * R) + 0.020 * Math.sin(2 * M * R) + 282.634 + 720) % 360;
  var RA = (Math.atan(0.91764 * Math.tan(L * R)) / R + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  var sinDec = 0.39782 * Math.sin(L * R), cosDec = Math.cos(Math.asin(sinDec));
  var cosH = (Math.cos(90.833 * R) - sinDec * Math.sin(lat * R)) / (cosDec * Math.cos(lat * R));
  var H = Math.acos(cosH) / R / 15;
  var UT = ((H + RA - 0.06571 * t - 6.622 - lh) % 24 + 24) % 24;
  return Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) + UT * 36e5;
}
// התאריך העברי ברגע now: היום האזרחי בירושלים, ואחרי השקיעה בירושלים - היום הבא.
export function hebrewToday(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now).split("-");
  const noon = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 10));
  const after = now.getTime() >= sunsetUtcMs(noon);
  return gregorianToHebrew(+p[0], +p[1], +p[2] + (after ? 1 : 0));
}

// ---------- מספרים ושמות בעברית ----------
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
// gematria(14) -> "יד"; gematria(14, true) -> 'י"ד'; gematria(1, true) -> "א'". פיסוק פשוט בלבד.
export function gematria(n, marks = false) {
  let s = HUNDREDS[Math.floor(n / 100) % 10];
  const r = n % 100;
  if (r === 15) s += "טו";
  else if (r === 16) s += "טז";
  else s += TENS[Math.floor(r / 10)] + ONES[r % 10];
  if (!marks) return s;
  return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1);
}
export function monthName(month, year) {
  if (month === 12 && isLeapYear(year)) return "אדר א'";
  return MONTH_NAMES[month];
}
// רשימת החודשים לשנה, בסדר השנה (תשרי עד אלול) - לרשימת בחירה. אדר א' וב' רק בשנה מעוברת.
export function monthsForYear(year) {
  const order = [7, 8, 9, 10, 11, 12].concat(isLeapYear(year) ? [13] : [], [1, 2, 3, 4, 5, 6]);
  return order.map((m) => ({ month: m, name: monthName(m, year), days: daysInMonth(m, year) }));
}
export function formatYear(year) { return gematria(year % 1000, true); }
// { year: 5787, month: 9, day: 12 } -> 'י"ב כסלו תשפ"ז'
export function formatHebrewDate(hd) {
  return gematria(hd.day, true) + " " + monthName(hd.month, hd.year) + " " + formatYear(hd.year);
}

// ---------- יום ההולדת העברי בשנה נתונה ----------
// הכללים מדיני בר מצווה (שו"ע או"ח נה י, משנה ברורה ס"ק מב-מה) והכרעות יעקב, 22.11.2026.
export function birthdayInYear(birth, year) {
  const by = birth.year, bLeap = isLeapYear(by), yLeap = isLeapYear(year);
  let month = birth.month, day = birth.day;

  if (month === 12 || month === 13) {
    if (!bLeap) {
      // נולד באדר של שנה פשוטה: בשנה מעוברת - אדר ב' (רמ"א, מ"ב ס"ק מה)
      month = yLeap ? 13 : 12;
    } else if (month === 12) {
      // נולד באדר א': בשנה מעוברת נשאר אדר א' (מ"ב ס"ק מג); בפשוטה - אדר, אותו יום (שו"ע)
      // ל' אדר א' בשנה פשוטה (אין ל' באדר) - א' ניסן (הכרעת יעקב, ז2)
      if (!yLeap && day === 30) return { year, month: 1, day: 1 };
      month = 12;
    } else {
      // נולד באדר ב': בשנה מעוברת - אדר ב'; בפשוטה - אדר, אותו יום
      month = yLeap ? 13 : 12;
    }
    return { year, month, day };
  }

  // ל' חשוון כשחשוון חסר - א' כסלו; ל' כסלו כשכסלו חסר - א' טבת (מ"ב ס"ק מה, ובהיקש)
  if (day === 30 && (month === 8 || month === 9) && daysInMonth(month, year) === 29) {
    return { year, month: month + 1, day: 1 };
  }
  // א' כסלו כשחשוון של שנת הלידה היה חסר, והשנה חשוון מלא - ל' חשוון (מ"ב ס"ק מה, הכרעת יעקב ז3)
  // ובהיקש: א' טבת כשכסלו של שנת הלידה היה חסר, והשנה כסלו מלא - ל' כסלו
  if (day === 1 && (month === 9 || month === 10)) {
    const prev = month - 1;
    if (daysInMonth(prev, by) === 29 && daysInMonth(prev, year) === 30) return { year, month: prev, day: 30 };
  }
  return { year, month, day };
}
// יום ההולדת בשנה העברית של today
export function birthdayThisYear(birth, todayHebrew) { return birthdayInYear(birth, todayHebrew.year); }

// כמה ימי הולדת עבריים כבר עברו (כולל היום, אם היום יום ההולדת)
export function ageOn(birth, todayHebrew) {
  const bd = birthdayThisYear(birth, todayHebrew);
  return todayHebrew.year - birth.year - (compareHebrew(todayHebrew, bd) >= 0 ? 0 : 1);
}

// ---------- אימות תאריך לידה ----------
// מחזיר { ok: true } או { ok: false, code, error } כשההודעה בעברית, מוכנה להצגה.
export function validateBirth(birth, todayHebrew = hebrewToday()) {
  const bad = (code, error) => ({ ok: false, code, error });
  if (!birth || !Number.isInteger(birth.year) || !Number.isInteger(birth.month) || !Number.isInteger(birth.day)) {
    return bad("missing", "חסר תאריך לידה מלא: יום, חודש ושנה.");
  }
  const { year, month, day } = birth;
  if (year < 3762 || year > 9999) return bad("year", "שנת הלידה אינה תקינה.");
  if (month < 1 || month > 13) return bad("month", "החודש אינו תקין.");
  if (month === 13 && !isLeapYear(year)) {
    return bad("no-adar2", "שנת " + formatYear(year) + " אינה מעוברת, ואין בה אדר ב'. יש לבחור אדר.");
  }
  const dim = daysInMonth(month, year);
  if (day < 1 || day > dim) {
    if (day === 30) {
      return bad("no-day30", "בשנת " + formatYear(year) + " בחודש " + monthName(month, year) +
        " יש רק 29 ימים, ולכן אין בו ל'. יש לבדוק את התאריך.");
    }
    return bad("day", "היום בחודש אינו תקין.");
  }
  if (compareHebrew(birth, todayHebrew) > 0) return bad("future", "תאריך הלידה עוד לא הגיע. יש לבדוק את התאריך.");
  if (ageOn(birth, todayHebrew) + 1 > 150) {
    return bad("over150", "לפי התאריך הזה הגיל עובר את מניין 150 פרקי התהילים. יש לבדוק את שנת הלידה.");
  }
  return { ok: true };
}

// מי שיודע רק תאריך לועזי. afterSunset: true / false / null (לא ידוע).
// כשלא ידוע - מוחזר התאריך של היום (לפני השקיעה), וב-alternative התאריך אם נולד אחרי השקיעה.
export function birthFromGregorian(gy, gm, gd, afterSunset = false) {
  const day = gregorianToHebrew(gy, gm, gd);
  if (afterSunset === true) return { hebrew: addDays(day, 1), alternative: null, uncertain: false };
  if (afterSunset === false) return { hebrew: day, alternative: null, uncertain: false };
  return { hebrew: day, alternative: addDays(day, 1), uncertain: true };
}

// ---------- הפרק של אדם ----------
// person = { name, parent?, gender: "m"|"f", birth: { year, month, day } }
export function personLabel(person) {
  const name = String(person.name || "").trim();
  const parent = String(person.parent || "").trim();
  if (!parent) return name;
  return name + " " + (person.gender === "f" ? "בת" : "בן") + " " + parent;
}
function ageWords(age, f) {
  const b = f ? "בת" : "בן";
  if (age === 0) return b + " פחות משנה";
  if (age === 1) return b + " שנה";
  if (age === 2) return b + " שנתיים";
  return b + " " + age;
}
// "בן 13, בשנתו ה-14 - פרק יד"
export function explainChapter(age, gender) {
  const f = gender === "f";
  const year = age === 0 ? (f ? "בשנתה הראשונה" : "בשנתו הראשונה") : (f ? "בשנתה ה-" : "בשנתו ה-") + (age + 1);
  return ageWords(age, f) + ", " + year + " - פרק " + gematria(age + 1);
}

// מחזיר { ok, chapter, age, yearOfLife, isBirthday, birthday, label, explanation, line } או { ok:false, code, error }
// line = "יוסי בן שרה - בן 13, בשנתו ה-14 - פרק יד"
export function chapterFor(person, todayHebrew = hebrewToday()) {
  const v = validateBirth(person && person.birth, todayHebrew);
  if (!v.ok) return v;
  const birth = person.birth;
  const age = ageOn(birth, todayHebrew);
  const birthday = birthdayThisYear(birth, todayHebrew);
  const label = personLabel(person);
  const explanation = explainChapter(age, person.gender);
  return {
    ok: true,
    chapter: age + 1,
    age,
    yearOfLife: age + 1,
    // ביום ההולדת קוראים רק את הפרק החדש (הכרעת יעקב ז4) - הדגל לתצוגה בלבד
    isBirthday: compareHebrew(todayHebrew, birthday) === 0 && age > 0,
    birthday,
    label,
    explanation,
    line: label ? label + " - " + explanation : explanation,
  };
}

// ---------- הקריאה היומית ----------
// מבנה units.json: פרקים 1-118 ביחידה ch-1, קי"ט ב-22 חלקים (118-139), 120-150 ביחידה ch+20.
export function unitIndexesFor(chapter, units) {
  if (units) return units.filter((u) => u.ch === chapter).sort((a, b) => a.part - b.part).map((u) => u.i);
  if (chapter < 119) return [chapter - 1];
  if (chapter === 119) return Array.from({ length: 22 }, (_, k) => 118 + k);
  return [chapter + 20];
}
function unitsDetail(chapter, units) {
  return unitIndexesFor(chapter, units).map((i, k) => {
    const u = units && units.find((x) => x.i === i);
    return { i, part: chapter === 119 ? k + 1 : 0, name: u ? u.name : null };
  });
}
function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " ו" + names[names.length - 1];
}

// fixedRanges: [ 23, [1, 10], {from: 120, to: 134}, ... ]
export function normalizeFixed(fixedRanges) {
  const set = new Set();
  for (const r of fixedRanges || []) {
    let a, b;
    if (typeof r === "number") a = b = r;
    else if (Array.isArray(r)) { a = r[0]; b = r.length > 1 ? r[1] : r[0]; }
    else if (r && typeof r === "object") { a = r.from; b = r.to == null ? r.from : r.to; }
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a > b) [a, b] = [b, a];
    for (let c = Math.max(1, a); c <= Math.min(150, b); c++) set.add(c);
  }
  return [...set].sort((x, y) => x - y);
}

// people: [person], fixedRanges: ראו normalizeFixed.
// options: {
//   units: מערך units.json (לא חובה; בלעדיו מחושב לפי המבנה הידוע, בלי שמות החלקים),
//   extraChapters: [{ chapter, label }] - פרקים נוספים שהממשק מוסיף (פרק לבקשה, פרק כ' בימים בלי תחנון),
//   textBefore, textAfter: נוסח "יהי רצון" לפני ואחרי - רק ממקור מאומת (ז5); בלעדיו - פסוקים בלבד,
// }
export function buildDailyReading(people, fixedRanges, options = {}, todayHebrew = hebrewToday()) {
  const units = options.units || null;
  const persons = [], skipped = [];
  for (const p of people || []) {
    const r = chapterFor(p, todayHebrew);
    if (r.ok) persons.push(Object.assign({ person: p }, r));
    else skipped.push({ person: p, code: r.code, error: r.error });
  }
  const fixed = normalizeFixed(fixedRanges);
  const map = new Map();
  const slot = (c) => {
    if (!map.has(c)) map.set(c, { names: [], fixed: false, extras: [] });
    return map.get(c);
  };
  for (const r of persons) slot(r.chapter).names.push(r.label);
  for (const c of fixed) slot(c).fixed = true;
  for (const e of options.extraChapters || []) {
    if (Number.isInteger(e.chapter) && e.chapter >= 1 && e.chapter <= 150) slot(e.chapter).extras.push(e.label || "");
  }
  slot(150); // פרק ק"נ תמיד בסוף, פעם אחת

  const chapters = [...map.keys()].filter((c) => c !== 150).sort((a, b) => a - b).concat([150]);
  const items = [];
  const opening = { type: "opening", parts: [] };
  if (options.textBefore) opening.parts.push({ kind: "text", text: options.textBefore });
  opening.parts.push({ kind: "verses", chapter: 95, from: 1, to: 3, ref: "תהילים צה, א-ג" });
  items.push(opening);

  chapters.forEach((c, k) => {
    const s = map.get(c);
    let subtitle = "";
    if (s.names.length) subtitle = "לרפואה ולהצלחה של " + joinNames(s.names);
    else if (s.fixed) subtitle = "פרק קבוע מהרשימה שלך";
    else if (s.extras.length) subtitle = s.extras.filter(Boolean).join(" · ");
    items.push({
      type: "chapter",
      chapter: c,
      position: k + 1,
      title: "תהילים " + gematria(c, true),
      names: s.names.slice(),
      fixed: s.fixed,
      extras: s.extras.slice(),
      final: c === 150,
      subtitle,
      units: unitsDetail(c, units),
    });
  });

  // סיום: תהילים א א-ג אחרי ק"נ ולפני "מי יתן מציון" (הוראת הרב, 22.11.2026).
  const closing = { type: "closing", parts: [
    { kind: "verses", chapter: 1, from: 1, to: 3, ref: "תהילים א, א-ג" },
    { kind: "verses", chapter: 14, from: 7, to: 7, ref: "תהילים יד, ז" },
    { kind: "verses", chapter: 37, from: 39, to: 40, ref: "תהילים לז, לט-מ" },
  ] };
  if (options.textAfter) closing.parts.push({ kind: "text", text: options.textAfter });
  items.push(closing);

  return {
    date: todayHebrew,
    dateLabel: formatHebrewDate(todayHebrew),
    key: todayHebrew.year + "-" + todayHebrew.month + "-" + todayHebrew.day,
    chapterCount: chapters.length,
    chapters,
    items,
    people: persons.map((r) => ({ label: r.label, chapter: r.chapter, age: r.age, isBirthday: r.isBirthday,
      explanation: r.explanation, line: r.line, person: r.person })),
    skipped,
  };
}
