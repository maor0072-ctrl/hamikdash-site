// הקטלוג הציבורי של ספרי תהילים פתוחים.
//
// עמוד HTML שנבנה בצד השרת, בלי JavaScript: הוא חייב להיות קריא למנועי
// חיפוש ולעבוד גם בטלפון ישן, וההחלטה הקיימת של המודול היא בלי JS בצד
// הלקוח ככל האפשר. כל הפונקציות כאן טהורות כדי שאפשר יהיה לבדוק אותן
// בלי Worker (ראה _test_catalog.mjs).

import { UNITS } from "./tehillim-units.js";
import { lead as topicLead } from "./tehillim-topics.js";

const SITE = "https://hamikdash.co.il";
const SHORT = "https://t.hamikdash.co.il";
const ROUND_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_MS = 90 * 24 * 60 * 60 * 1000; // ספר בלי תנועה 90 יום יוצא מהרשימה

// הנושאים והקידומות שלהם במקור אחד: tehillim-topics.js

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// המספרים בפרקים מתוך 150 ולא ביחידות מתוך 171: פרק קי"ט מחולק ל-22
// חלקים לקריאה, אבל פנוי רק כשכל חלקיו פנויים ונקרא רק כשכולם נקראו.
// אותו כלל בדיוק כמו ב-chapterStats של book.html.
export function chapterStats(states) {
  const byCh = {};
  for (let i = 0; i < UNITS.length; i++) {
    const c = UNITS[i].ch;
    const ch = states.charAt(i) || "f";
    if (!byCh[c]) byCh[c] = { f: 0, t: 0, r: 0, n: 0 };
    byCh[c][ch === "r" || ch === "t" ? ch : "f"]++;
    byCh[c].n++;
  }
  let read = 0;
  let free = 0;
  let taken = 0;
  let total = 0;
  for (const c in byCh) {
    const o = byCh[c];
    total++;
    if (o.r === o.n) read++;
    else if (o.f === o.n) free++;
    else taken++;
  }
  return { total: total, read: read, free: free, taken: taken };
}

export function labelFor(c) {
  if (c.kind === "klali") return c.title || "הקריאה הכללית";
  const who = c.patientName + (c.gender === "f" ? " בת " : " בן ") + c.motherName;
  const extra = c.intent === "other" && c.intentOther ? " - " + c.intentOther : "";
  return topicLead(c.intent, c.gender) + " " + who + extra;
}

// ===== ספר שעמד שבועיים הופך לכללי (הכרעת יעקב ה5, 5.11.2026) =====
//
// ספר פרטי שנפתח לפני יותר מ-14 יום ולא סומן בו פרק 14 יום הופך ל"ספר כללי":
// מי שלוחץ "לקרוא עכשיו" בעמוד הפתיחה נשלח אליו (הוותיק ביותר קודם), והוא
// ממשיך מהמקום שנעצר, בלי איפוס. ההכרעה הזאת "דביקה": ספר שזוהה פעם כרדום
// נרשם במונה (מפתח gen:<id> בטבלת c של CounterDO) ונשאר כללי עד שהוא מושלם,
// גם אחרי שמישהו קרא בו. בלי זה הספר היה חוזר להיות "לא רדום" אחרי הפרק
// הראשון שנקרא בו, והקוראים היו מתפזרים בין ספרים בפרק אחד לכל ספר.
// הקריאה הכללית (klali) לעולם אינה "רדומה", וסבב נוסף (cycle > 1) של ספר
// שכבר הושלם אינו נחשב - הספר שעליו התפללו הושלם.
export const IDLE_MS = 14 * 24 * 60 * 60 * 1000;

// כשיר להיות כללי: ספר פרטי קיים, פתוח, בסבב הראשון שלו, שלא הושלם.
export function generalEligible(r) {
  if (!r || !r.ok || !r.exists || r.status !== "open") return false;
  if (r.kind === "klali") return false;
  if (Number(r.cycle || 0) > 1) return false;
  const st = chapterStats(r.states || "");
  return st.read < st.total;
}

// רדום עכשיו: נפתח לפני יותר מ-14 יום, ולא סומן בו פרק 14 יום.
export function isIdle(r, now) {
  if (!generalEligible(r)) return false;
  const created = Number(r.createdAt || 0);
  if (!created || now - created <= IDLE_MS) return false;
  const last = Number(r.lastMarkAt || 0) || created;
  return now - last > IDLE_MS;
}

// sticky - אובייקט {bookId: 1} של ספרים שכבר סומנו ככלליים.
export function isGeneral(r, now, sticky) {
  if (!generalEligible(r)) return false;
  return !!((sticky && sticky[r.id]) || isIdle(r, now));
}

// הספר שאליו נשלח מי שלוחץ "לקרוא עכשיו": הוותיק ביותר מבין הכלליים.
// אין כזה - null, והקורא נשלח לקריאה הכללית.
export function pickGeneral(rows, now, sticky) {
  let best = null;
  for (const r of rows || []) {
    if (!isGeneral(r, now, sticky)) continue;
    if (!best || Number(r.createdAt || 0) < Number(best.createdAt || 0)) best = r;
  }
  return best;
}

// היחידה המוצעת לקריאה (הכרעה ה1). units - המערך של snapshot ({i, s, mine}).
// קודם יחידה פנויה, הראשונה בסדר, כדי שהספר נסגר ברצף. אין פנויה - יחידה
// שמישהו בחר ועוד לא נקראה, ומבינן קודם זו שהקורא עצמו מחזיק. אין גם כזו -
// null, כלומר הספר נקרא כולו. ההצעה אינה תופסת ואינה נספרת.
export function pickSuggest(units) {
  const list = (units || []).slice().sort(function (a, b) { return a.i - b.i; });
  for (const u of list) if (u.s === "free") return { idx: u.i, state: "free" };
  for (const u of list) if (u.s === "taken" && u.mine) return { idx: u.i, state: "taken" };
  for (const u of list) if (u.s === "taken") return { idx: u.i, state: "taken" };
  return null;
}

// התאריך של היום בשעון ישראל, YYYY-MM-DD.
export function ilToday(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

// מסנן ומסדר. הקריאה הכללית תמיד ראשונה, אחריה החדשים.
// ספר שנסגר, או שאין בו פרק פנוי, או שלא זז 90 יום, אינו מוצג -
// חוץ מספר שהפך לכללי, שנשאר מוצג עד שהוא מושלם.
export function selectItems(rows, now, sticky) {
  const out = [];
  const today = ilToday(now);
  for (const r of rows) {
    if (!r || !r.ok || !r.exists || r.status !== "open") continue;
    const st = chapterStats(r.states || "");
    if (st.free === 0) continue;
    const general = isGeneral(r, now, sticky);
    const last = Math.max(r.lastMarkAt || 0, r.createdAt || 0);
    if (r.kind !== "klali" && !general && now - last > STALE_MS) continue;
    // סבב נוסף שאיש לא קרא בו שבוע יורד מהקטלוג (הכרעה 13)
    if (r.kind !== "klali" && r.cycle > 1 && now - Math.max(r.lastMarkAt || 0, r.cycleStartedAt || 0) > ROUND_IDLE_MS) continue;
    const td = r.targetDate || "";
    out.push({
      id: r.id,
      klali: r.kind === "klali",
      label: labelFor(r),
      targetDate: td,
      targetPast: !!(td && /^\d{4}-\d{2}-\d{2}$/.test(td) && td < today),
      general: general,
      createdAt: r.createdAt || 0,
      st: st,
    });
  }
  out.sort(function (a, b) {
    if (a.klali !== b.klali) return a.klali ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  return out;
}

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? m[3] + "." + m[2] + "." + m[1] : "";
}

// מלל הקטלוג לפי נספח מסמך ההצעות (הכרעה ה7, 5.11.2026).
function row(it) {
  const pct = Math.round((it.st.read / it.st.total) * 100);
  const date = fmtDate(it.targetDate);
  let left;
  let note = "";
  if (it.klali) {
    left = "פתוח תמיד";
  } else {
    left = "עוד " + (it.st.total - it.st.read);
    if (it.general) note = "ספר כללי - פתוח לכל מי שרוצה לקרוא";
    else if (it.targetPast && date) note = "היעד המקורי היה " + esc(date) + ". הספר טרם הושלם.";
    else if (date) note = "תאריך יעד " + esc(date);
  }
  // עיצוב 23.11.2026: הכרטיס כולו לחיץ, כמו בדף הראשי - שם, כמה נקרא, פס התקדמות
  return (
    '<li><a class="bk" href="' + SHORT + "/" + esc(it.id) + '">' +
    '<span class="bk-t">' + (it.klali ? "הספר הכללי - " : "") + esc(it.label) + "</span>" +
    '<span class="bk-m"><span>נקראו ' + it.st.read + " מתוך " + it.st.total + "</span><span>" + left + "</span></span>" +
    '<span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
    (note ? '<span class="bk-n">' + note + "</span>" : "") +
    '<span class="bk-go">' + (it.klali ? "לקריאה בספר הכללי" : "לקריאה בספר הזה") + "</span>" +
    "</a></li>"
  );
}

// opts.groupUrl - כתובת /kvutza כשיש קבוצת וואטסאפ פתוחה, אחרת מושמט.
export function renderCatalog(items, opts) {
  opts = opts || {};
  const list = items.length
    ? '<ul class="books">' + items.map(row).join("") + "</ul>"
    : '<p class="empty">כרגע אין ספרים פתוחים שפורסמו בקטלוג. אפשר <a href="' + SITE +
      '/tehillim.html">לפתוח ספר</a>, או להצטרף לקריאה הכללית.</p>';
  const group = opts.groupUrl
    ? '<p class="grp"><a class="btn btn-ghost" href="' + esc(opts.groupUrl) +
      '">להצטרפות לקבוצת הוואטסאפ של תהילים ישראל</a></p>'
    : "";
  return (
    '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>ספרי תהילים פתוחים | תהילים ישראל</title>" +
    '<meta name="description" content="ספרי תהילים שנפתחו לרפואה, לעילוי נשמה ולהצלחה, ועדיין מחכים לקוראים. בוחרים פרק, קוראים ומסמנים.">' +
    '<meta property="og:title" content="ספרי תהילים פתוחים | תהילים ישראל">' +
    '<meta property="og:description" content="ספרי תהילים שנפתחו לרפואה, להצלחה ולמשאלות הלב, ועדיין מחכים לקוראים. בוחרים פרק, קוראים ומסמנים.">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:url" content="' + SITE + '/tehillim/sfarim">' +
    '<meta property="og:locale" content="he_IL">' +
    '<link rel="canonical" href="' + SITE + '/tehillim/sfarim">' +
    '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Frank+Ruhl+Libre:wght@600;700;800&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="' + SITE + '/assets/style.css">' +
    // עיצוב 23.11.2026 (אפיון העיצוב החדש, הכרעה ט7): אותה שפה כמו הדף הראשי - כותרת בשורה אחת
    // בגובה שורה משלה (לא 1.75 של הטקסט), פחות רווח, כרטיס לחיץ עם שם, כמה נקרא ופס התקדמות.
    "<style>" +
    ".th-page h1,.th-page h2{line-height:1.2;text-wrap:balance}" +
    ".th-page .page-head{padding:18px 0 18px}" +
    ".th-page .page-head .eyebrow{display:block;font-size:14px;font-weight:600;color:var(--gold-deep)}" +
    ".th-page .page-head h1{font-family:'Frank Ruhl Libre','Heebo',serif;font-weight:800;font-size:38px;margin:2px 0 6px}" +
    ".th-page .page-head p{font-size:17px;line-height:1.55;margin:0}" +
    ".th-cat{max-width:760px;margin:0 auto}" +
    ".books{list-style:none;margin:0;padding:0;display:grid;gap:10px}" +
    ".bk{display:block;background:var(--white);border:1px solid var(--line);border-radius:14px;" +
    "box-shadow:var(--shadow);padding:13px 16px;color:var(--ink);line-height:1.35}" +
    ".bk:hover{text-decoration:none;border-color:var(--gold)}" +
    ".bk-t{display:block;font-family:'Frank Ruhl Libre','Heebo',serif;font-size:20px;font-weight:700;line-height:1.3;text-wrap:balance}" +
    ".bk-m{display:flex;justify-content:space-between;gap:10px;font-size:14.5px;color:var(--ink-soft);margin-top:4px}" +
    ".bar{display:block;height:6px;border-radius:3px;background:#efe6d5;overflow:hidden;margin-top:8px}" +
    ".bar i{display:block;height:100%;background:var(--gold)}" +
    ".bk-n{display:block;font-size:14px;color:var(--gold-deep);margin-top:7px}" +
    ".bk-go{display:block;margin-top:10px;text-align:center;font-size:16px;font-weight:700;color:#fff;" +
    "background:var(--gold);border-radius:10px;padding:9px 12px}" +
    ".bk:hover .bk-go{background:var(--gold-deep)}" +
    ".empty,.grp{text-align:center;margin:18px auto}" +
    ".grp .btn{line-height:1.35;padding:12px 18px}" +
    ".th-open{text-align:center;margin-top:20px;font-size:16px;line-height:1.6}" +
    "@media(max-width:640px){.th-page .page-head{padding:12px 0 14px}.th-page .page-head h1{font-size:30px}" +
    ".th-page .page-head p{font-size:16px}}" +
    "</style></head><body class=\"th-page\">" +
    '<header class="site-header"><div class="header-inner"><div class="brand">' +
    '<a href="' + SITE + '/"><span class="brand-name">אורות האמונה - בני משה</span></a>' +
    '<span class="brand-sub">בראשות הרב יעקב מאור</span></div></div></header>' +
    '<div class="page-head"><div class="wrap"><a class="eyebrow" href="' + SITE + '/tehillim.html">תהילים ישראל</a>' +
    "<h1>ספרים פתוחים</h1>" +
    "<p>בוחרים ספר ומצטרפים לתפילה. אפשר לקרוא גם פרק אחד, בלי למסור פרטים.</p></div></div>" +
    '<section class="wrap" style="padding-top:16px;padding-bottom:30px"><div class="th-cat">' +
    list + group +
    '<p class="th-open">רוצים לפתוח ספר עבור אדם יקר?<br><a href="' + SITE +
    '/tehillim.html?open=1">לפתיחת ספר חדש</a> · <a href="' + SITE + '/tehillim.html">לדף הראשי של תהילים ישראל</a></p></div></section>' +
    '<footer class="site-footer"><div class="wrap"><p>עמותת אורות האמונה - בני משה | בראשות הרב יעקב מאור</p></div></footer>' +
    "</body></html>"
  );
}

// ===== קישורי קבוצות וואטסאפ =====
//
// אנחנו לא מצרפים אף אחד לקבוצה (הכרעה 23.9): מציגים קישור הצטרפות והאדם
// לוחץ בעצמו. הקובץ tehillim/groups.json נערך ביד ומכיל את הקבוצות
// הממוספרות, וכשאחת מתמלאת מסמנים אותה full והקישור היציב /kvutza עובר
// לבאה אחריה בלי שמישהו יצטרך לשנות את מה שכבר נשלח לקבוצות.

// רק כתובת הצטרפות אמיתית של וואטסאפ. כל דבר אחר - http, javascript:,
// דומיין אחר, קישור מקוצר - נדחה, כי הערך הזה הופך ל-Location של הפניה.
export const GROUP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}(\?[A-Za-z0-9=&_.\-]{0,80})?$/;

export function cleanGroupUrl(v) {
  const s = String(v == null ? "" : v).trim();
  return GROUP_RE.test(s) ? s : "";
}

// הקבוצה הראשונה, לפי המספר, שאינה מלאה ושיש לה כתובת תקינה.
export function pickGroup(data) {
  const list = data && Array.isArray(data.groups) ? data.groups.slice() : [];
  list.sort(function (a, b) { return Number(a && a.n) - Number(b && b.n); });
  for (const g of list) {
    if (!g || g.full) continue;
    const url = cleanGroupUrl(g.url);
    if (url) return { n: Number(g.n) || 0, url: url };
  }
  return null;
}
