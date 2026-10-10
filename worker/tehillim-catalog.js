// הקטלוג הציבורי של ספרי תהילים פתוחים.
//
// עמוד HTML שנבנה בצד השרת, בלי JavaScript: הוא חייב להיות קריא למנועי
// חיפוש ולעבוד גם בטלפון ישן, וההחלטה הקיימת של המודול היא בלי JS בצד
// הלקוח ככל האפשר. כל הפונקציות כאן טהורות כדי שאפשר יהיה לבדוק אותן
// בלי Worker (ראה _test_catalog.mjs).

import { UNITS } from "./tehillim-units.js";

const SITE = "https://hamikdash.co.il";
const SHORT = "https://t.hamikdash.co.il";
const STALE_MS = 90 * 24 * 60 * 60 * 1000; // ספר בלי תנועה 90 יום יוצא מהרשימה

const INTENT_LEAD = {
  refua: "לרפואת",
  neshama: "לעילוי נשמת",
  hatzlacha: "להצלחת",
  zivug: "לזיווגו/ה של",
  other: "עבור",
};

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
  const lead = INTENT_LEAD[c.intent] || "עבור";
  const who = c.patientName + (c.gender === "f" ? " בת " : " בן ") + c.motherName;
  return lead + " " + who;
}

// מסנן ומסדר. הקריאה הכללית תמיד ראשונה, אחריה החדשים.
// ספר שנסגר, או שאין בו פרק פנוי, או שלא זז 90 יום, אינו מוצג.
export function selectItems(rows, now) {
  const out = [];
  for (const r of rows) {
    if (!r || !r.ok || !r.exists || r.status !== "open") continue;
    const st = chapterStats(r.states || "");
    if (st.free === 0) continue;
    const last = Math.max(r.lastMarkAt || 0, r.createdAt || 0);
    if (r.kind !== "klali" && now - last > STALE_MS) continue;
    out.push({
      id: r.id,
      klali: r.kind === "klali",
      label: labelFor(r),
      targetDate: r.targetDate || "",
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

function row(it) {
  const pct = Math.round((it.st.read / it.st.total) * 100);
  const date = fmtDate(it.targetDate);
  return (
    '<li class="bk">' +
    '<div class="bk-t">' + esc(it.label) + "</div>" +
    '<div class="bk-s">נקראו ' + it.st.read + " מתוך " + it.st.total + " פרקים, נשארו " + it.st.free + " פנויים" +
    (date ? " · תאריך יעד " + esc(date) : "") + "</div>" +
    '<div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
    '<a class="btn" href="' + SHORT + "/" + esc(it.id) + '">לבחירת פרקים</a>' +
    "</li>"
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
    '<meta property="og:locale" content="he_IL">' +
    '<link rel="canonical" href="' + SHORT + '/sfarim">' +
    '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="' + SITE + '/assets/style.css">' +
    "<style>" +
    ".books{list-style:none;margin:0 auto;padding:0;max-width:760px;display:grid;gap:14px}" +
    ".bk{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);" +
    "box-shadow:var(--shadow);padding:20px 22px}" +
    ".bk-t{font-size:20px;font-weight:800}" +
    ".bk-s{font-size:15px;color:var(--ink-soft);margin:6px 0 10px;line-height:1.6}" +
    ".bar{height:8px;border-radius:4px;background:var(--cream-warm);overflow:hidden;margin-bottom:14px}" +
    ".bar i{display:block;height:100%;background:var(--gold)}" +
    ".empty,.grp{text-align:center;max-width:760px;margin:20px auto}" +
    "</style></head><body>" +
    '<header class="site-header"><div class="header-inner"><div class="brand">' +
    '<a href="' + SITE + '/"><span class="brand-name">אורות האמונה - בני משה</span></a>' +
    '<span class="brand-sub">בראשות הרב יעקב מאור</span></div></div></header>' +
    '<div class="page-head"><div class="wrap"><h1>ספרי תהילים פתוחים</h1>' +
    "<p>ספרים שנפתחו ועדיין מחכים לקוראים. בוחרים ספר, לוקחים פרק או שניים וקוראים. " +
    "כל פרק שנקרא מקרב את הספר להשלמה.</p></div></div>" +
    '<section class="wrap" style="padding-top:30px;padding-bottom:30px">' +
    list + group +
    '<p style="text-align:center;margin-top:26px"><a href="' + SITE +
    '/tehillim.html">לפתוח ספר תהילים חדש</a></p></section>' +
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
