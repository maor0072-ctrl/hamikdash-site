// תהילים ישראל - ה-Worker של מודול חלוקת ספר התהילים באתר המקדש.
//
// הדפוס מועתק במכוון מ-worker/shema.js ו-worker/neshama.js: ES module אחד
// כנקודת כניסה, ניתוב לפי url.pathname, CORS מול רשימת מקורות סגורה, טוקנים
// חתומים HMAC-SHA256 דרך crypto.subtle, ו-502 בשגיאה במקום אישור שקרי.
//
// מה שונה כאן: המצב אינו ב-KV אלא בשני Durable Objects.
//   BookDO    - אחד לכל ספר, מחזיק את 171 היחידות (ראה tehillim-book-do.js)
//   CounterDO - אחד לכל המערכת, מחזיק את המונה הגלובלי
// ה-KV נשאר לאינדקס הספרים בלבד, שאינו נתון תחרות.

export { BookDO } from "./tehillim-book-do.js";
export { CounterDO } from "./tehillim-counter-do.js";

import { UNITS } from "./tehillim-units.js";
import { inQuietWindow } from "./tehillim-quiet.js";

const ALLOWED = [
  "https://hamikdash.co.il",
  "https://www.hamikdash.co.il",
  "https://t.hamikdash.co.il",
  "http://127.0.0.1:8903",
];

const SITE = "https://hamikdash.co.il";
const SHORT = "https://t.hamikdash.co.il";
const FROM_ADDR = "info@hamikdash.co.il";
const FROM_NAME = "אורות האמונה - אתר המקדש";

const DEFAULT_BUDGET_MS = 60 * 60 * 1000; // שעה. קבוע בפרוסה 1 (הכרעה א4).
const UNIT_COUNT = UNITS.length;

// הקריאה הכללית - הייעוד הרוחני כפי שנקבע בהכרעות.
const KLALI_ID = "klali";
const KLALI_META = {
  kind: "klali",
  patientName: "",
  motherName: "",
  gender: "",
  intent: "klali",
  openerName: "אורות האמונה - בני משה",
  budgetMs: DEFAULT_BUDGET_MS,
  title: "להצלחת תורמי העמותה, חברי פרויקט שמע ישראל, והפועלים למען עם ישראל בכל מקום",
};

// ===== עזרי תשובה =====

function cors(origin) {
  const ok = origin && ALLOWED.indexOf(origin) !== -1;
  return {
    "Access-Control-Allow-Origin": ok ? origin : SITE,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status, origin, extra) {
  const h = Object.assign(
    { "content-type": "application/json; charset=utf-8" },
    cors(origin),
    extra || {}
  );
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}

// בשגיאה מחזירים 502 ולא אישור שקרי. אדם שראה "נשמר" חייב שזה יהיה נכון.
function fail(msg, origin, status) {
  return json({ ok: false, error: msg }, status || 502, origin);
}

// ===== טוקנים חתומים =====

function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// הקישור חייב להיות קצר: זה מה שנשלח לקבוצת וואטסאפ, וטוקן בן מאה תווים
// נראה כמו ספאם ונשבר בשורה. לכן:
//
//   ציבורי  t.hamikdash.co.il/<bookId>          - המזהה עצמו הוא ההרשאה.
//           bookId הוא תשעה בתים אקראיים (72 ביט) ואינו ניתן לניחוש, ולכן
//           חתימה עליו אינה מוסיפה שום הגנה - רק אורך.
//   ניהול   t.hamikdash.co.il/m/<bookId>.<sig>  - חתום, כי הרשאת הניהול
//           חייבת לא להיות נגזרת מהקישור הציבורי שמופץ לכולם.

const SIG_LEN = 22; // 132 ביט מתוך ה-HMAC. מספיק בהרבה, וקצר.
const ID_RE = /^[A-Za-z0-9_-]{4,24}$/;

async function manageSig(bookId, secret) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bookId + ":m"));
  return b64url(new Uint8Array(sig)).slice(0, SIG_LEN);
}

async function publicToken(bookId) {
  return bookId;
}

async function manageToken(bookId, secret) {
  return bookId + "." + (await manageSig(bookId, secret));
}

// השוואה בזמן קבוע. השוואת מחרוזות רגילה מדליפה כמה תווים התאימו.
function sameSig(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ===== קלט =====

const NAME_RE = /^[֐-׿\s'"`\-]{2,40}$/;

// תבנית "X בן/בת Y" - אותו אימות כפול שכבר עובד בטפסים הקיימים של האתר.
function cleanName(v) {
  const s = String(v == null ? "" : v).trim().replace(/\s+/g, " ");
  return NAME_RE.test(s) ? s : null;
}

function cleanFree(v, max) {
  return String(v == null ? "" : v)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max || 120);
}

function cleanIdxs(v) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const x of v) {
    const n = Number(x);
    if (!Number.isInteger(n) || n < 0 || n >= UNIT_COUNT) return null;
    if (out.indexOf(n) === -1) out.push(n);
  }
  if (!out.length || out.length > 30) return null;
  return out;
}

function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return b64url(b);
}

// ===== גישה ל-Durable Objects =====

function book(env, bookId) {
  return env.BOOK.get(env.BOOK.idFromName(bookId));
}

function counter(env) {
  return env.COUNTER.get(env.COUNTER.idFromName("global"));
}

async function doCall(stub, op, body) {
  const r = await stub.fetch("https://do/" + op, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

// ===== דואר =====

async function sendMail(env, to, subject, html) {
  if (!env.BREVO_API_KEY || !to) return false;
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: FROM_ADDR, name: FROM_NAME },
        to: [{ email: to }],
        subject: subject,
        htmlContent: html,
      }),
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// ===== נקודות הקצה =====

async function createBook(request, env, origin) {
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return json({ ok: false, error: "bad_json" }, 400, origin);
  }

  if (cleanFree(b.website, 20)) return json({ ok: true, id: "ok" }, 200, origin); // מלכודת ספאם

  const patientName = cleanName(b.patientName);
  const motherName = cleanName(b.motherName);
  const gender = b.gender === "f" ? "f" : b.gender === "m" ? "m" : null;
  if (!patientName || !motherName || !gender) {
    return json({ ok: false, error: "bad_name" }, 400, origin);
  }

  const openerName = cleanFree(b.openerName, 40);
  const openerPhone = cleanFree(b.openerPhone, 20);
  const openerEmail = cleanFree(b.openerEmail, 80).toLowerCase();
  if (!openerName || !/^0\d{1,2}-?\d{7}$/.test(openerPhone.replace(/[\s()]/g, ""))) {
    return json({ ok: false, error: "bad_opener" }, 400, origin);
  }
  // המייל חובה: זה ערוץ השחזור היחיד לקישור הניהול, כל עוד אין לנו SMS.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(openerEmail)) {
    return json({ ok: false, error: "bad_email" }, 400, origin);
  }

  const secret = env.TEHILLIM_TOKEN_SECRET;
  if (!secret) return fail("no_secret", origin);

  const id = newId();
  const meta = {
    patientName: patientName,
    motherName: motherName,
    gender: gender,
    intent: cleanFree(b.intent, 30) || "refua",
    intentOther: cleanFree(b.intentOther, 60),
    targetDate: cleanFree(b.targetDate, 20),
    openerName: openerName,
    openerPhone: openerPhone,
    openerEmail: openerEmail,
    openerRelation: cleanFree(b.openerRelation, 40),
    budgetMs: DEFAULT_BUDGET_MS,
  };

  const res = await doCall(book(env, id), "create", { meta: meta, unitCount: UNIT_COUNT });
  if (!res || !res.ok) return fail("create_failed", origin);

  const pub = await publicToken(id);
  const man = await manageToken(id, secret);

  try {
    await doCall(counter(env), "book", {});
  } catch (e) {
    /* המונה אינו קריטי לפתיחת ספר */
  }

  const publicUrl = SHORT + "/" + pub;
  const manageUrl = SHORT + "/m/" + man;
  const forWhom = patientName + (gender === "f" ? " בת " : " בן ") + motherName;

  // הקישורים נשלחים כטקסט ולא כ-<a>, בכוונה.
  // ברבו עוטפת כל <a href> במעקב קליקים ומחליפה את הכתובת במפלצת באורך
  // מאתיים תווים על הדומיין sendibt2.com. מי שמעתיק קישור כזה מהמייל
  // ושולח אותו לקבוצת וואטסאפ - שולח משהו שנראה כמו הונאה, בלי שום קשר
  // נראה לאתר המקדש. טקסט רגיל אינו נעטף.
  const box =
    "display:block;direction:ltr;text-align:left;font-family:monospace;font-size:15px;" +
    "background:#faf7f1;border:1px solid #e3d9c8;border-radius:8px;padding:12px 14px;" +
    "margin:6px 0 4px;word-break:break-all";

  await sendMail(
    env,
    openerEmail,
    "ספר התהילים ל" + forWhom + " נפתח",
    "<div dir='rtl' style='font-family:Arial,sans-serif;font-size:16px;line-height:1.8'>" +
      "<p>שלום " + openerName + ",</p>" +
      "<p>ספר התהילים ל<strong>" + forWhom + "</strong> נפתח.</p>" +

      "<p><strong>הקישור להפצה</strong> - זה מה ששולחים לקבוצות. " +
      "<u>סמנו את השורה והעתיקו אותה</u>:</p>" +
      "<span style='" + box + "'>" + publicUrl + "</span>" +

      "<p style='margin-top:22px'><strong>הקישור לניהול</strong> - שמרו אותו לעצמכם. " +
      "דרכו רואים מי לקח מה, מאריכים את תאריך היעד, ומחלקים את הפרקים שנשארו:</p>" +
      "<span style='" + box + "'>" + manageUrl + "</span>" +

      "<p style='margin-top:22px;font-size:14px;color:#4a453e'>שתי הכתובות כתובות כאן כטקסט " +
      "ולא ככפתור, כדי שמה שתעתיקו יהיה בדיוק הכתובת של אתר המקדש ולא כתובת מעקב ארוכה.</p>" +

      "<p>שיהיה בשעה טובה,<br>אתר המקדש</p></div>"
  );

  return json({ ok: true, id: id, publicUrl: publicUrl, manageUrl: manageUrl }, 200, origin);
}

async function resolve(token, env, role) {
  const secret = env.TEHILLIM_TOKEN_SECRET;
  if (!secret || !token) return null;

  if (role === "m") {
    const dot = token.indexOf(".");
    if (dot < 1) return null;
    const id = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!ID_RE.test(id)) return null;
    if (!sameSig(sig, await manageSig(id, secret))) return null;
    return { b: id, r: "m" };
  }

  // בנתיב הציבורי לא מתקבל טוקן ניהול, גם לא בטעות
  if (token.indexOf(".") !== -1) return null;
  if (!ID_RE.test(token)) return null;
  return { b: token, r: "p" };
}

async function handleApi(request, url, env, origin) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

  if (parts[1] === "stats") {
    const s = await doCall(counter(env), "stats", {});
    return json(s, 200, origin, { "Cache-Control": "public, max-age=30" });
  }

  if (parts[1] === "book" && parts.length === 2 && request.method === "POST") {
    return createBook(request, env, origin);
  }

  // הקריאה הכללית - הבריכה התמידית. ספר קבוע אחד שנפתח מחדש כשהוא נסגר.
  if (parts[1] === "klali") {
    const secret = env.TEHILLIM_TOKEN_SECRET;
    if (!secret) return fail("no_secret", origin);
    const r = await doCall(book(env, KLALI_ID), "reopen", { meta: KLALI_META });
    if (!r || !r.ok) return fail("klali_failed", origin);
    const tok = await publicToken(KLALI_ID);
    return json({ ok: true, url: SHORT + "/" + tok, token: tok, cycle: r.cycle }, 200, origin);
  }

  if (parts[1] === "book" && parts.length >= 3) {
    const p = await resolve(parts[2], env, "p");
    if (!p) return json({ ok: false, error: "bad_token" }, 403, origin);
    const stub = book(env, p.b);
    const op = parts[3] || "state";

    let b = {};
    if (request.method === "POST") {
      try {
        b = await request.json();
      } catch (e) {
        b = {};
      }
    }
    const readerKey = cleanFree(b.readerKey || url.searchParams.get("rk"), 40);

    if (op === "state") {
      const s = await doCall(stub, "state", { readerKey: readerKey });
      s.quiet = inQuietWindow(Date.now());
      return json(s, 200, origin);
    }

    if (op === "take" && request.method === "POST") {
      const idxs = cleanIdxs(b.idxs);
      if (!idxs || !readerKey) return json({ ok: false, error: "bad_request" }, 400, origin);
      const r = await doCall(stub, "take", {
        readerKey: readerKey,
        readerName: cleanFree(b.readerName, 40),
        idxs: idxs,
        budgetMs: DEFAULT_BUDGET_MS,
      });
      return json(r, r.ok ? 200 : 409, origin);
    }

    if (op === "read" && request.method === "POST") {
      const idxs = cleanIdxs(b.idxs);
      if (!idxs || !readerKey) return json({ ok: false, error: "bad_request" }, 400, origin);
      const r = await doCall(stub, "read", { readerKey: readerKey, idxs: idxs });
      if (r.ok && r.read && r.read.length) {
        try {
          await doCall(counter(env), "bump", { n: r.read.length });
        } catch (e) {
          /* המונה אינו קריטי לסימון */
        }
      }
      // הקריאה הכללית נפתחת מחדש ברגע שהיא נסגרת - זו בריכה תמידית,
      // לא ספר שמסתיים.
      if (r.ok && r.closed && p.b === KLALI_ID) {
        try {
          await doCall(stub, "reopen", { meta: KLALI_META });
        } catch (e) {
          /* ייפתח בקריאה הבאה ל-/api/klali */
        }
      }
      return json(r, r.ok ? 200 : 429, origin);
    }

    if (op === "release" && request.method === "POST") {
      const idxs = cleanIdxs(b.idxs);
      if (!idxs || !readerKey) return json({ ok: false, error: "bad_request" }, 400, origin);
      const r = await doCall(stub, "release", { readerKey: readerKey, idxs: idxs });
      return json(r, 200, origin);
    }
  }

  // ---- מסך הניהול של פותח הספר, מאחורי טוקן נפרד ----
  if (parts[1] === "manage" && parts.length >= 3) {
    const p = await resolve(parts[2], env, "m");
    if (!p) return json({ ok: false, error: "bad_token" }, 403, origin);
    const stub = book(env, p.b);
    const op = parts[3] || "state";

    let b = {};
    if (request.method === "POST") {
      try {
        b = await request.json();
      } catch (e) {
        b = {};
      }
    }

    if (op === "state") {
      const s = await doCall(stub, "state", {});
      const r = await doCall(stub, "roster", {});
      s.roster = r && r.ok ? r.readers : [];
      s.quiet = inQuietWindow(Date.now());
      s.publicUrl = SHORT + "/" + (await publicToken(p.b));
      return json(s, 200, origin);
    }

    if (op === "distribute" && request.method === "POST") {
      const r = await doCall(stub, "distribute", {});
      return json(r, r.ok ? 200 : 409, origin);
    }

    if (op === "extend" && request.method === "POST") {
      const r = await doCall(stub, "extend", { targetDate: cleanFree(b.targetDate, 20) });
      return json(r, 200, origin);
    }
  }

  return json({ ok: false, error: "not_found" }, 404, origin);
}

// ===== הגשת הדפים =====
// הדפים עצמם נשארים קבצים סטטיים בריפו ומוגשים מ-GitHub Pages. ה-Worker רק
// מושך אותם ומגיש תחת הכתובת הקצרה. כך אפשר לערוך עיצוב בדחיפה לגיט בלי
// לפרוס Worker, ובלי לכתוב HTML בתוך מחרוזת JavaScript - שם בדיוק גרשיים
// עבריות שוברות סקריפט שלם בלי הודעת שגיאה.

// דקה ולא חמש: הדף הוא קובץ סטטי בריפו, ותיקון שנדחף לגיט חייב להופיע
// בזמן סביר. חמש דקות של מטמון שאי אפשר לנקות הן חמש דקות של ניפוי באג
// שכבר תוקן.
async function servePage(path) {
  const r = await fetch(SITE + path, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!r.ok) return new Response("not found", { status: 404 });
  const html = await r.text();
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    try {
      if (url.pathname === "/" || url.pathname === "") {
        return Response.redirect(SITE + "/tehillim.html", 302);
      }
      if (url.pathname.startsWith("/api/")) {
        return handleApi(request, url, env, origin);
      }
      if (url.pathname.startsWith("/m/")) {
        return servePage("/tehillim/manage.html");
      }
      if (url.pathname === "/health") {
        return json({ ok: true, units: UNIT_COUNT }, 200, origin);
      }
      return servePage("/tehillim/book.html");
    } catch (e) {
      return fail("worker_error: " + (e && e.message ? e.message : String(e)), origin);
    }
  },
};
