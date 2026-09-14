// hamikdash-kaparot - צד השרת של טופס השמות לפדיון כפרות ב-hamikdash.co.il.
//
// קמפיין יום כיפור תשפ"ז. עד היום יעקב קיבל את רשימות השמות כהודעות וואטסאפ
// חופשיות והקליד אותן ידנית; הטופס הזה מחליף את ההקלדה, לא את הקשר.
//
// **הגל השני (הוראת יעקב 2026-09-13): הרשימה נשמרת, ומייל האישור נושא שלושה
// כפתורים - להוסיף, לשנות, ולמחוק.** בגל הראשון לא היה אחסון כלל, ולכן לא היה
// מה לתקן. עכשיו הרשימה יושבת ב-KV תחת גיבוב של המייל, והקישור החתום (HMAC)
// שבמייל הוא המפתח אליה.
//
// **למה טוקן חתום ולא localStorage** (כמו בטופס עילוי הנשמה): שם התיקון עובד
// רק מהמכשיר שממנו נמסרו השמות, ומי שפותח את המייל בטלפון אחר מאבד את
// הרשימה. כאן הקישור עובד מכל מכשיר, וזה בדיוק מה שכפתור במייל אמור לעשות.
//
// המייל ליעקב הוא עדיין **הרשומה הקובעת**, וה-KV הוא נוחות למוסר. לכן כישלון
// שליחה ליעקב מחזיר 502, וכישלון כתיבה ל-KV לא מפיל את הבקשה.
//
// **הגל השלישי (הוראת יעקב 2026-09-14): השמות נפתחים רק אחרי תשלום מאומת.**
// המסלול: פרטי הממלא -> תרומה בנדרים פלוס -> אימות לפי טלפון -> דף השמות.
// שלוש נקודות כניסה חדשות - POST action=start פותח בקשה, GET ?intent= שואל
// אם שולם, ו-GET ?grant= הוא הכפתור שיעקב מקבל במייל כדי לפתוח ידנית למי
// ששילם בלי שהטלפון נרשם על העסקה. מסירת שמות בלי טוקן מוחזרת ב-402.
//
// המבנה, הדואר וה-CORS מועתקים מ-worker/neshama.js וטוקני ה-HMAC מ-shema.js,
// כדי לא להמציא דפוס שלישי. זהו Worker נפרד לגמרי.

const ALLOWED = [
  "https://hamikdash.co.il",
  "https://www.hamikdash.co.il",
  "http://127.0.0.1:8903",
];
const TO = "maor0072@gmail.com";

// הזהות השולחת היא המוסד ולא יעקב - מייל אוטומטי בשמו הפרטי נקרא כאילו הרב
// השיב אישית, וזו הבטחה שלא נאמרה.
const FROM_ADDR = "info@hamikdash.co.il";
const FROM_NAME = "info@hamikdash.co.il";
const REPLY_TO_OWNER = "maor0072@gmail.com";
const COMPOSIO_USER = "maor0072@gmail.com";
const GMAIL_ACCOUNT = "ca_NGVDA1Vrsmz0";

const DONATE = "https://www.matara.pro/nedarimplus/online/?mosad=7009579&Groupe=%D7%A4%D7%93%D7%99%D7%95%D7%9F%20%D7%9B%D7%A4%D7%A8%D7%95%D7%AA&GroupeLock=1";
const PAGE = "https://hamikdash.co.il/chagim/yom-kippur/";

// דף התרומה של נדרים פלוס שמקבל את הטלפון מראש. הקישור הקצר nedar.im אינו
// מעביר פרמטרים, ולכן לשלב התשלום נשלחת הכתובת המלאה.
const DONATE_PREFILL = "https://www.matara.pro/nedarimplus/online/?mosad=7009579&Groupe=%D7%A4%D7%93%D7%99%D7%95%D7%9F%20%D7%9B%D7%A4%D7%A8%D7%95%D7%AA&GroupeLock=1";

// **דף השמות נפרד מעמוד ההסבר מ-2026-09-14** (הוראת יעקב): בעמוד יום כיפור
// נשאר ההסבר בלבד וכפתור אחד, והשדות עברו לכאן - אחרי הפרטים ואחרי התשלום.
const SHEMOT_PAGE = "https://hamikdash.co.il/chagim/yom-kippur/shemot.html";

// משפחה גדולה היא לגמרי סבירה כאן - כפרות עושים לכל נפש, כולל ילדים וסבים.
// התקרה נועדה רק לעצור הזנה אוטומטית.
const MAX_SOULS = 30;
const TOKEN_DAYS = 60;

function cors(origin) {
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

function encodeHeader(v) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
  if (!m) return v;
  return `=?UTF-8?B?${b64(m[1])}?= <${m[2]}>`;
}

// בניית ה-MIME בעצמנו ולא דרך GMAIL_SEND_EMAIL: הכלי המובנה שולח את הגוף בלי
// להצהיר על קידוד, ג'ימייל מפרש כ-ASCII, וכל אות עברית יוצאת ג'יבריש.
function mime({ to, replyTo, subject, html }) {
  const lines = [`To: ${to}`, `From: ${encodeHeader(FROM_NAME + " <" + FROM_ADDR + ">")}`];
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  lines.push(
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(html)
  );
  return b64(lines.join("\r\n"))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ברבו ראשי, ג'ימייל גיבוי. המייל ליעקב הוא הרשומה הקובעת, ולכן אסור שכשל של
// ספק אחד יאבד אותה.
async function sendMail(env, msg) {
  if (env.BREVO_API_KEY) {
    try {
      const body = {
        sender: { name: FROM_NAME, email: FROM_ADDR },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
      };
      if (msg.replyTo) body.replyTo = { email: msg.replyTo };
      // הערה למי שיבדוק את הקישורים במייל: ברבו כותבת כל href מחדש לדומיין
      // מעקב (sendibt3.com), והוא מפנה 302 ליעד האמיתי. **בדיקה של הקישור
      // המעוקב חייבת להשתמש בכתובת המלאה** - כתובת קטועה מחזירה 404, וזה
      // נראה בטעות כמו כפתור שבור (נתפס ב-2026-09-13).
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (r.ok) return true;
      console.log("brevo rejected", r.status, (await r.text()).slice(0, 300));
    } catch (e) {
      console.log("brevo failed", String(e).slice(0, 200));
    }
  }
  return sendViaGmail(env, mime(msg));
}

async function sendViaGmail(env, raw) {
  const res = await fetch(
    "https://backend.composio.dev/api/v3/tools/execute/proxy",
    {
      method: "POST",
      headers: {
        "x-api-key": env.COMPOSIO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: COMPOSIO_USER,
        connected_account_id: GMAIL_ACCOUNT,
        endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        method: "POST",
        body: { raw },
      }),
    }
  );
  // ה-proxy מחזיר את תשובת ג'ימייל עטופה: {data, status, headers}.
  // 200 של ה-proxy עצמו לא מעיד על הצלחה - בודקים את status שבפנים.
  if (!res.ok) {
    console.log("proxy failed", res.status);
    return false;
  }
  const out = await res.json().catch(() => null);
  const ok = out && out.status >= 200 && out.status < 300;
  if (!ok) console.log("gmail rejected", JSON.stringify(out).slice(0, 400));
  return ok;
}

// ===== טוקנים חתומים (HMAC-SHA256), הדפוס של shema.js =====

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

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}

async function signToken(payloadObj, secret) {
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return payloadB64 + "." + b64url(new Uint8Array(sig));
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== "string" || token.indexOf(".") === -1) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlDecode(parts[1]), new TextEncoder().encode(parts[0])
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ===== אחסון הרשימה =====
// המפתח הוא גיבוב של המייל ולא המייל עצמו, כדי שלא תשב ב-KV רשימת כתובות.

async function listKey(email) {
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode("kaparot:" + email.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readList(env, key) {
  if (!env.KAPAROT) return null;
  try {
    const raw = await env.KAPAROT.get("list:" + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.log("kv read failed", String(e).slice(0, 150));
    return null;
  }
}

// כתיבה ל-KV היא נוחות למוסר, לא הרשומה. לכן כישלון כאן נרשם ביומן ולא
// מפיל את הבקשה - המייל ליעקב כבר יצא.
async function writeList(env, key, data) {
  if (!env.KAPAROT) return false;
  try {
    await env.KAPAROT.put("list:" + key, JSON.stringify(data),
      { expirationTtl: 60 * 60 * 24 * 120 });
    return true;
  } catch (e) {
    console.log("kv write failed", String(e).slice(0, 150));
    return false;
  }
}

async function dropList(env, key) {
  if (!env.KAPAROT) return false;
  try {
    await env.KAPAROT.delete("list:" + key);
    return true;
  } catch (e) {
    console.log("kv delete failed", String(e).slice(0, 150));
    return false;
  }
}

// "ראובן" + "שרה" הוא לא "ראובן שרה" אלא "ראובן בן שרה".
// המגדר הוא שדה מפורש ולא נגזר משום דבר אחר - בשם של אדם אסור לנחש.
// אם הממלא כבר כתב "בן"/"בת" בשדה ההורה, לא מוסיפים פעמיים.
function fullName(n) {
  const parent = String(n.parent || "").trim();
  const name = String(n.name || "").trim();
  if (!parent) return name;
  if (/^(בן|בת|ב"ר|בר)\s/.test(parent)) return name + " " + parent;
  return name + (n.gender === "f" ? " בת " : " בן ") + parent;
}

const btn = (href, text, primary) =>
  `<a href="${href}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 20px;` +
  (primary
    ? `background:#8a6d3b;color:#ffffff;font-weight:700;`
    : `background:#f3ece0;color:#4a453e;border:1px solid #e0d5c0;`) +
  `text-decoration:none;border-radius:8px;font-size:15px">${text}</a>`;

// ההוראות שחוזרות לממלא, ומעליהן שלושת הכפתורים לניהול הרשימה.
// **זו הסיבה שהטופס מבקש מייל בכלל** - מסירת השמות אינה הפדיון עצמו:
// הפדיון נעשה בבית, עם הכסף, על כל אחד מבני המשפחה.
function confirmHtml(sender, souls, token, kind) {
  const link = (m) => `${SHEMOT_PAGE}?t=${encodeURIComponent(token)}&m=${m}`;
  const list = souls
    .map((n) => `<li style="margin:4px 0">${esc(fullName(n))}</li>`)
    .join("");

  const head =
    kind === "replace"
      ? `<h2 style="margin:0 0 6px">הרשימה עודכנה</h2>` +
        `<p style="margin:0 0 18px;color:#4a453e">זו הרשימה המעודכנת, והיא מחליפה את הקודמת.</p>`
      : `<h2 style="margin:0 0 6px">שלום ${esc(sender)}, השמות התקבלו</h2>` +
        `<p style="margin:0 0 18px;color:#4a453e">הם יעלו בפדיון הכפרות לפני יום כיפור.</p>`;

  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    head +
    `<ul style="background:#f3ece0;border-right:4px solid #b08434;padding:14px 24px 14px 18px;` +
    `border-radius:8px;list-style:none;margin:0 0 22px">${list}</ul>` +

    `<p style="margin:0 0 10px;font-weight:700">רוצים לשנות משהו ברשימה?</p>` +
    `<p style="margin:0 0 26px">` +
    btn(link("add"), "הוספת שמות", true) +
    btn(link("edit"), "שינוי השמות") +
    btn(link("del"), "מחיקת השמות") +
    `</p>` +

    `<hr style="border:0;border-top:1px solid #e5ddd0;margin:0 0 22px">` +

    `<h3 style="margin:0 0 8px;color:#8a6d3b">איך עושים את פדיון הכפרות בפועל</h3>` +
    `<p style="margin:0 0 14px">לכל אחד ואחד מבני המשפחה, לקחת שטר כסף, נניח 50 שקלים או יותר. ` +
    `ולכוון <strong>שלא השטר הזה פיזית ישמש לפדיון הכפרות, אלא הסכום שאותו תרמתי</strong> - ` +
    `בין אם נתתי סכום פיזי ובין אם עשיתי העברה בנקאית או תשלום בביט או בכל דרך אחרת.</p>` +
    `<p style="margin:0 0 10px">לסובב את הכסף סביב הראש ולומר:</p>` +
    `<p style="margin:0 0 14px;padding:14px 18px;background:#faf7f0;border-right:4px solid #c9ab77;` +
    `border-radius:6px;font-weight:700">זה חליפתי תמורתי כפרתי, כשווה ערך של זה הכסף ילך לצדקה, ` +
    `ופלוני בן/בת פלוני ילך לחיים ארוכים ולשלום.</p>` +
    `<p style="margin:0 0 14px">ולכוון לראשי תיבות <strong>חת"ך</strong>.</p>` +
    `<p style="margin:0 0 22px">ושוב: זה חליפתי, תמורתי, כפרתי... <strong>שלוש פעמים</strong>. ` +
    `ולעשות כך לכל אחד ואחד מבני המשפחה.</p>` +

    `<h3 style="margin:0 0 8px;color:#8a6d3b">הסכום</h3>` +
    `<p style="margin:0 0 14px">מחיר תרנגול או תרנגולת, לכל אחד ואחד מבני המשפחה. ` +
    `כל אחד ישער לעצמו את המחיר. הכסף כולו הולך למשפחות נזקקות.</p>` +
    `<p style="margin:0 0 26px">${btn(DONATE, "להעברת פדיון הכפרות", true)}</p>` +

    `<p style="margin:0 0 4px">גמר חתימה טובה,</p>` +
    `<p style="margin:0 0 18px"><strong>יעקב מאור</strong><br>0528395189</p>` +
    `<p style="margin:0;color:#8a8378;font-size:13px">` +
    `כל ההסבר גם כאן: <a href="${PAGE}">${PAGE}</a></p>` +
    `</div>`
  );
}

function deletedHtml(sender) {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<h2 style="margin:0 0 6px">השמות הוסרו</h2>` +
    `<p style="margin:0 0 18px">שלום ${esc(sender)}, השמות שמסרת הוסרו לפי בקשתך. ` +
    `אפשר למסור שוב בכל עת.</p>` +
    `<p style="margin:0 0 22px">${btn(PAGE, "למסירת שמות מחדש", true)}</p>` +
    `<p style="margin:0 0 4px">גמר חתימה טובה,</p>` +
    `<p style="margin:0"><strong>יעקב מאור</strong></p>` +
    `</div>`
  );
}

function ownerHtml(sender, phone, email, souls, note, kind) {
  const rows = souls
    .map(
      (n, i) =>
        `<tr><td style="padding:5px 12px 5px 0;color:#8a8378;width:28px">${i + 1}</td>` +
        `<td style="padding:5px 0;color:#1c1a17;font-size:16px"><strong>${esc(fullName(n))}</strong></td></tr>`
    )
    .join("");
  const plain = sender + "\n" + souls.map((n) => fullName(n)).join("\n");

  const head =
    kind === "replace"
      ? `<h2 style="margin:0 0 4px;color:#b08434">תיקון לרשימת כפרות שכבר נמסרה</h2>` +
        `<p style="margin:0 0 18px;padding:10px 14px;background:#fdf6e3;` +
        `border-right:4px solid #b08434;border-radius:6px">` +
        `<strong>הרשימה הזאת מחליפה את הקודמת של אותו אדם.</strong> לא להוסיף פעמיים.</p>`
      : `<h2 style="margin:0 0 4px">פדיון כפרות - ${souls.length} שמות</h2>` +
        `<p style="margin:0 0 18px;color:#4a453e">נשלח מהטופס ב-<a href="${PAGE}">עמוד יום כיפור</a>.</p>`;

  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
    head +
    `<p style="margin:0 0 14px"><strong>${esc(sender)}</strong> · ${esc(phone)} · ${esc(email)}</p>` +
    `<table style="border-collapse:collapse;margin:0 0 18px">${rows}</table>` +
    (note
      ? `<p style="margin:0 0 14px;padding:10px 14px;background:#faf7f0;` +
        `border-right:4px solid #c9ab77;border-radius:6px">${esc(note)}</p>`
      : "") +
    `<p style="margin:22px 0 6px;color:#4a453e">להעתקה ישירה לגנרטור:</p>` +
    `<pre style="margin:0;padding:12px 14px;background:#f6f3ec;border-radius:6px;` +
    `font-family:inherit;font-size:15px;white-space:pre-wrap">${esc(plain)}</pre>` +
    `</div>`
  );
}

function cleanSouls(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((n) => ({
      name: String((n && n.name) || "").trim().slice(0, 120),
      parent: String((n && n.parent) || "").trim().slice(0, 120),
      gender: (n && n.gender) === "f" ? "f" : (n && n.gender) === "m" ? "m" : "",
    }))
    .filter((n) => n.name)
    .slice(0, MAX_SOULS);
}

// ==========================================================================
// אימות תשלום מול נדרים פלוס
//
// **הוראת יעקב 2026-09-14: השמות נפתחים רק אחרי שהתשלום נראה בנדרים פלוס.**
// פדיון כפרות הוא הכסף עצמו - רשימת שמות בלי נתינה אינה פדיון. לכן הדף
// מתחיל בפרטים, ממשיך לתרומה, ורק אחר כך נפתחים שדות השמות.
//
// האימות הוא **לפי מספר טלפון**, בדיוק כמו בשירות ה-RTL: דף התרומה של נדרים
// מקבל את הטלפון מראש בכתובת (Phone=05XXXXXXXX, אומת מול הדף החי), ולכן
// המספר שנחפש הוא המספר שנוחת על העסקה. אין קוד, אין קריאת מיילים.
//
// **המכסה היא האילוץ שמעצב את המבנה:** ל-API כ-20 קריאות בשעה, והמכסה
// משותפת עם הקולקטור היומי של DataOS. לכן ה-Worker לא שואל את נדרים לכל
// גולש: הוא מחזיק ב-KV מפת טלפון אל זמן התרומה האחרונה, מרענן אותה לכל
// היותר אחת לדקה וחצי, ומודד כל קריאה במונה מתגלגל. גולש נוסף באותה דקה
// נענה מהמפה בלי לעלות קריאה.
const NEDARIM_API = "https://matara.pro/nedarimplus/Reports/Manage3.aspx";
// **המספרים האלה קשורים זה בזה:** מרווח של שתי דקות מאפשר 30 שליפות בשעה,
// והמונה חוסם אחרי 15 - כלומר במצב עומס רצוף מרענן אחת לארבע דקות, ובמצב
// רגיל אחת לשתיים. שליפה אחת פותרת את **כל** הממתינים בבת אחת, כי המפה
// משותפת, ולכן מספר הממתינים אינו מכפיל את העלות.
const NED_REFRESH_MS = 120 * 1000; // מרווח מינימלי בין שתי שליפות
const NED_MAX_CALLS_HOUR = 15; // מתוך 20 בערך, השאר לקולקטור של DataOS
const NED_PAGE_SIZE = 500;

// **הוראת יעקב 2026-09-14: תרומה קודמת אינה נחשבת.** פדיון כפרות הוא נתינה
// חדשה לצורך הכפרות; מי שתרם לפדיון נפש, או תרם סתם, עדיין צריך לתת סכום
// חדש עכשיו. לכן הבדיקה אינה "האם יש תרומה בימים האחרונים" אלא **האם נכנסה
// תרומה מאז שהאדם הזה פתח את הבקשה**.
//
// החסד היחיד הוא חלון קצר לאחור, למי שתרם דרך הקישור השקט שבעמוד ורק אחר כך
// לחץ על הוספת שמות - הוא לא יתבקש לשלם פעמיים על אותה נתינה.
const PAY_GRACE_MS = 20 * 60 * 1000;

// כמה זמן רשומה נשמרת במפת הטלפונים. אין לה תפקיד מעבר לבקשות הפתוחות,
// והמפה קטנה יותר כשגוזמים אותה.
const PAY_WINDOW_DAYS = 3;

// כמה זמן חיה בקשה שטרם שולמה. מספיק ליום עיון ולחזרה, ולא יותר.
const INTENT_HOURS = 48;

function normPhone(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00972")) d = d.slice(5);
  else if (d.startsWith("972")) d = d.slice(3);
  if (!d.startsWith("0")) d = "0" + d;
  return d;
}

// תאריך נדרים בתבנית יום/חודש/שנה שעה -> מילישניות. פער שעון ישראל מול UTC
// אינו קריטי כאן, כי החלון נמדד בימים ולא בדקות.
function nedTime(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
    String(value || "").trim()
  );
  if (!m) return 0;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

async function kvJson(env, key, fallback) {
  try {
    const raw = await env.KAPAROT.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.log("kv read failed", key, String(e).slice(0, 120));
    return fallback;
  }
}

// מונה מתגלגל על שעה. נשמר ב-KV ולכן אינו מדויק לחלוטין בין מופעים מקבילים -
// זו הגנה על המכסה, לא נעילה. הסטייה האפשרית היא קריאה בודדת.
async function spendNedarimCall(env) {
  const now = Date.now();
  const calls = (await kvJson(env, "ned:calls", [])).filter((t) => now - t < 3600000);
  if (calls.length >= NED_MAX_CALLS_HOUR) return false;
  calls.push(now);
  try {
    await env.KAPAROT.put("ned:calls", JSON.stringify(calls), { expirationTtl: 3600 });
  } catch (e) {
    console.log("kv calls write failed", String(e).slice(0, 120));
  }
  return true;
}

// שליפת העסקאות שנוספו מאז הסמן, ועדכון מפת הטלפונים.
// מחזירה true אם רוענן בפועל. **כשל אינו שגיאה של הגולש** - הוא נענה מהמפה
// הקיימת, ובפעם הבאה ינסה שוב.
async function refreshNedarim(env) {
  if (!env.NEDARIM_MOSAD_ID || !env.NEDARIM_API_PASSWORD) return false;
  const state = await kvJson(env, "ned:state", { cursor: 0, fetched: 0 });
  if (Date.now() - (state.fetched || 0) < NED_REFRESH_MS) return false;
  if (!(await spendNedarimCall(env))) return false;

  const body = new URLSearchParams({
    Action: "GetHistoryJson",
    MosadId: env.NEDARIM_MOSAD_ID,
    ApiPassword: env.NEDARIM_API_PASSWORD,
    MaxId: String(NED_PAGE_SIZE),
  });
  if (state.cursor) body.set("LastId", String(state.cursor));

  let rows;
  try {
    const r = await fetch(NEDARIM_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!r.ok) throw new Error("http " + r.status);
    const out = await r.json();
    rows = Array.isArray(out) ? out : out && (out.data || out.Data);
  } catch (e) {
    console.log("nedarim fetch failed", String(e).slice(0, 150));
    return false;
  }
  if (!Array.isArray(rows)) return false;

  const phones = await kvJson(env, "ned:phones", {});
  let cursor = state.cursor || 0;
  for (const row of rows) {
    const id = parseInt(row.TransactionId, 10);
    if (id > cursor) cursor = id;
    const p = normPhone(row.Phone);
    const t = nedTime(row.TransactionTime);
    const amount = parseFloat(row.Amount || "0") || 0;
    if (!p || !t || amount <= 0) continue;
    if (!phones[p] || phones[p] < t) phones[p] = t;
  }
  // גיזום: מה שמעבר לחלון כבר לא פותח דבר, ואין סיבה לגרור אותו.
  const cutoff = Date.now() - PAY_WINDOW_DAYS * 86400000;
  for (const p of Object.keys(phones)) if (phones[p] < cutoff) delete phones[p];

  try {
    await env.KAPAROT.put("ned:phones", JSON.stringify(phones));
    await env.KAPAROT.put("ned:state", JSON.stringify({ cursor: cursor, fetched: Date.now() }));
  } catch (e) {
    console.log("kv state write failed", String(e).slice(0, 120));
  }
  return true;
}

// האם נכנסה תרומה מהטלפון הזה **מאז** הרגע שנמסר. מרענן קודם אם הגיע הזמן.
//
// לפני הכול נבדק פטור ידני: `exempt:<טלפון>` ב-KV פותח לאדם מסוים בלי תלות
// בזמן. זה נועד למי שיעקב יודע עליו שכבר נתן לצורך הזה - למשל תרומה שנכנסה
// עם הערה מפורשת לפני שהטופס בכלל נולד. מפתח, ולא רשימה בקוד, כדי שאפשר
// יהיה להוסיף אדם בלי לפרוס מחדש.
async function phoneHasPaid(env, phone, since) {
  const p = normPhone(phone);
  if (!p) return false;
  const exempt = await kvJson(env, "exempt:" + p, null);
  if (exempt) return true;
  let phones = await kvJson(env, "ned:phones", {});
  if (phones[p] && phones[p] >= since) return true;
  if (await refreshNedarim(env)) phones = await kvJson(env, "ned:phones", {});
  return !!(phones[p] && phones[p] >= since);
}

// ---------- בקשות ממתינות לתשלום ----------

async function readIntent(env, id) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ""))) return null;
  return await kvJson(env, "intent:" + id, null);
}

async function writeIntent(env, id, data) {
  try {
    await env.KAPAROT.put("intent:" + id, JSON.stringify(data), {
      expirationTtl: INTENT_HOURS * 3600,
    });
    return true;
  } catch (e) {
    console.log("intent write failed", String(e).slice(0, 120));
    return false;
  }
}

// הקישור שנפתח לגולש ברגע שהתשלום אומת, וגם נשלח אליו במייל.
const shemotUrl = (token) => SHEMOT_PAGE + "?t=" + encodeURIComponent(token);

function paidMailHtml(sender, token) {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#2c2416">` +
    `<p style="margin:0 0 14px">שלום ${esc(sender)},</p>` +
    `<p style="margin:0 0 14px">התרומה התקבלה, תבורכו. הדף למסירת השמות פתוח עבורכם:</p>` +
    `<p style="margin:0 0 18px">${btn(shemotUrl(token), "מסירת השמות", true)}</p>` +
    `<p style="margin:0 0 14px">אפשר למסור את השמות עכשיו או מאוחר יותר - הקישור נשמר ופתוח.</p>` +
    `<p style="margin:0">בברכה,<br>אורות האמונה - בני משה</p></div>`
  );
}

// מעבר בקשה למצב שולם: נפתחת רשומת רשימה ריקה ונוצר הטוקן החתום שמוביל
// אליה. מכאן ואילך ממשיך בדיוק המנגנון שכבר קיים - אותו מסך, אותו מייל
// אישור עם שלושת הכפתורים.
async function grantPaid(env, id, intent, how) {
  const key = await listKey(intent.email);
  const prev = await readList(env, key);
  const record = prev || {
    sender: intent.sender,
    phone: intent.phone,
    email: intent.email,
    souls: [],
    ts: Date.now(),
  };
  record.paid = true;
  record.paidHow = how;
  await writeList(env, key, record);

  const token = await signToken(
    { k: key, exp: Date.now() + TOKEN_DAYS * 86400000 },
    env.KAPAROT_TOKEN_SECRET
  );
  intent.status = "paid";
  intent.token = token;
  intent.paidAt = Date.now();
  intent.how = how;
  await writeIntent(env, id, intent);

  if (!intent.mailed) {
    try {
      const sent = await sendMail(env, {
        to: intent.email,
        replyTo: REPLY_TO_OWNER,
        subject: "פדיון כפרות - הדף למסירת השמות פתוח",
        html: paidMailHtml(intent.sender, token),
      });
      if (sent) {
        intent.mailed = true;
        await writeIntent(env, id, intent);
      }
    } catch (e) {
      console.log("paid mail threw", String(e).slice(0, 150));
    }
  }
  return token;
}

function pageHtml(title, body) {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(title)}</title></head>` +
      `<body style="font-family:Arial,sans-serif;background:#faf7f2;color:#2c2416;` +
      `display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">` +
      `<div style="max-width:520px;padding:28px;text-align:center;line-height:1.8">${body}</div>` +
      `</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// מייל ליעקב כשגולש לוחץ "שילמתי והדף לא נפתח". כ-10% מהעסקאות מגיעות
// לנדרים בלי טלפון, ואז אין מה להתאים - הכפתור בקישור פותח לו ידנית.
function helpMailHtml(intent, grantUrl) {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
    `<h2 style="margin:0 0 8px;color:#b8860b">בקשה לפתיחה ידנית</h2>` +
    `<p style="margin:0 0 12px">מישהו מדווח ששילם ודף השמות לא נפתח לו. ` +
    `זה קורה כשהעסקה נרשמה בנדרים בלי מספר טלפון, או כששילם ממספר אחר.</p>` +
    `<p style="margin:0 0 6px"><strong>${esc(intent.sender)}</strong></p>` +
    `<p style="margin:0 0 6px">טלפון: ${esc(intent.phone)}</p>` +
    `<p style="margin:0 0 16px">מייל: ${esc(intent.email)}</p>` +
    `<p style="margin:0 0 16px">אחרי שווידאת בנדרים פלוס שהתרומה נכנסה:</p>` +
    `<p style="margin:0 0 18px">${btn(grantUrl, "לפתוח לו את דף השמות", true)}</p>` +
    `<p style="margin:0;color:#7a6a52;font-size:13px">הקישור פותח את הדף ושולח לו מייל עם הקישור.</p>` +
    `</div>`
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: Object.assign({}, headers, {
          "Content-Type": "application/json; charset=utf-8",
        }),
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (request.method === "GET") {
      const url = new URL(request.url);

      // GET ?intent=<id> - הדף שואל אם התשלום כבר נראה בנדרים פלוס.
      // נענה מהמפה שב-KV; שליפה אמיתית מנדרים קורית לכל היותר אחת לדקה וחצי.
      const intentId = url.searchParams.get("intent");
      if (intentId) {
        const intent = await readIntent(env, intentId);
        if (!intent) return json({ ok: false, reason: "gone" }, 404);
        if (intent.status === "paid" && intent.token)
          return json({ ok: true, paid: true, url: shemotUrl(intent.token) });
        if (await phoneHasPaid(env, intent.phone, intent.since || intent.createdAt)) {
          const token = await grantPaid(env, intentId, intent, "auto");
          return json({ ok: true, paid: true, url: shemotUrl(token) });
        }
        return json({ ok: true, paid: false });
      }

      // GET ?grant=<טוקן חתום> - יעקב לוחץ על הכפתור שבמייל ופותח ידנית
      // למי ששילם ולא זוהה. נפתח בדפדפן שלו, ולכן מחזיר עמוד ולא JSON.
      const grant = url.searchParams.get("grant");
      if (grant) {
        const payload = await verifyToken(grant, env.KAPAROT_TOKEN_SECRET);
        if (!payload || !payload.i)
          return pageHtml("קישור לא תקף", `<h2>הקישור אינו תקף או שפג תוקפו</h2>`);
        const intent = await readIntent(env, payload.i);
        if (!intent)
          return pageHtml("הבקשה פגה", `<h2>הבקשה כבר אינה קיימת</h2>` +
            `<p>בקשה שלא שולמה נמחקת אחרי יומיים. אפשר לבקש מהתורם למלא שוב.</p>`);
        await grantPaid(env, payload.i, intent, "manual");
        return pageHtml(
          "נפתח",
          `<h2 style="color:#8a6d3b">הדף נפתח ל${esc(intent.sender)}</h2>` +
            `<p>נשלח אליו מייל עם הקישור לדף השמות, והדף שהוא השאיר פתוח ייפתח מעצמו.</p>`
        );
      }

      // GET ?t=<token> - שליפת הרשימה הקיימת, למסך הניהול בעמוד.
      const payload = await verifyToken(url.searchParams.get("t"), env.KAPAROT_TOKEN_SECRET);
      if (!payload) return json({ ok: false, reason: "bad token" }, 401);
      const data = await readList(env, payload.k);
      if (!data) return json({ ok: false, reason: "gone" }, 404);
      return json({
        ok: true, sender: data.sender, phone: data.phone,
        email: data.email, souls: data.souls,
      });
    }

    if (request.method !== "POST")
      return new Response("method not allowed", { status: 405, headers });

    let d;
    try {
      d = await request.json();
    } catch {
      return new Response("bad json", { status: 400, headers });
    }

    // מלכודת ספאם: שדה שאדם אמיתי לעולם לא רואה ולכן לא ממלא.
    // מחזירים 200 בכוונה - בוט שמקבל שגיאה מנסה שוב, בוט שמקבל אישור הולך.
    if (d.website) return new Response("ok", { status: 200, headers });

    // ---------- שלב א: פרטי הממלא, לפני התשלום ----------
    // ארבעת השדות חובה, כמו בטופס עילוי הנשמה. הטלפון אינו רק דרך ליצור קשר -
    // הוא **המפתח לאימות התשלום**, ולכן הוא נבדק כאן ונשלח לדף התרומה מראש.
    if (d.action === "start") {
      const sender = String(d.sender || "").trim().slice(0, 120);
      const phone = String(d.phone || "").trim().slice(0, 40);
      const email = String(d.email || "").trim().slice(0, 160);
      if (!sender) return json({ ok: false, reason: "missing sender" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return json({ ok: false, reason: "bad email" }, 400);
      const p = normPhone(phone);
      if (!/^05\d{8}$/.test(p))
        return json({ ok: false, reason: "bad phone" }, 400);

      const id = crypto.randomUUID().replace(/-/g, "");
      const now = Date.now();
      const intent = {
        sender: sender, phone: p, email: email.toLowerCase(),
        status: "open", createdAt: now, since: now - PAY_GRACE_MS,
      };
      if (!(await writeIntent(env, id, intent)))
        return json({ ok: false, reason: "storage" }, 503);

      // רק מי שתרם ממש עכשיו, בתוך חלון החסד, נכנס בלי לעבור שוב בתשלום.
      if (await phoneHasPaid(env, p, intent.since)) {
        const token = await grantPaid(env, id, intent, "existing");
        return json({ ok: true, id: id, paid: true, url: shemotUrl(token) });
      }
      return json({
        ok: true, id: id, paid: false,
        donate: DONATE_PREFILL + "&Phone=" + encodeURIComponent(p),
      });
    }

    // ---------- שילמתי והדף לא נפתח ----------
    // כ-10% מהעסקאות נרשמות בנדרים בלי טלפון, ויש מי שמשלם מכרטיס של בן
    // משפחה. במקום להשאיר אותו תקוע, יעקב מקבל מייל עם כפתור שפותח לו.
    if (d.action === "help") {
      const intent = await readIntent(env, d.id);
      if (!intent) return json({ ok: false, reason: "gone" }, 404);
      const grant = await signToken(
        { i: String(d.id), exp: Date.now() + 7 * 86400000 },
        env.KAPAROT_TOKEN_SECRET
      );
      const grantUrl = new URL(request.url).origin + "/?grant=" + encodeURIComponent(grant);
      const ok = await sendMail(env, {
        to: TO,
        replyTo: intent.email,
        subject: "פדיון כפרות - " + intent.sender + " מדווח ששילם והדף לא נפתח",
        html: helpMailHtml(intent, grantUrl),
      });
      if (!ok) return json({ ok: false, reason: "mail failed" }, 502);
      intent.helpAskedAt = Date.now();
      await writeIntent(env, d.id, intent);
      return json({ ok: true });
    }

    // ---------- מסלול הניהול: תיקון או מחיקה, מול טוקן חתום ----------
    if (d.token) {
      const payload = await verifyToken(d.token, env.KAPAROT_TOKEN_SECRET);
      if (!payload) return json({ ok: false, reason: "bad token" }, 401);
      const prev = await readList(env, payload.k);
      if (!prev) return json({ ok: false, reason: "gone" }, 404);

      if (d.kind === "delete") {
        await dropList(env, payload.k);
        const ok = await sendMail(env, {
          to: TO, replyTo: prev.email,
          subject: "ביטול פדיון כפרות - " + prev.sender,
          html:
            `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
            `<h2 style="margin:0 0 4px;color:#c0392b">בקשת מחיקה</h2>` +
            `<p style="margin:0 0 14px"><strong>${esc(prev.sender)}</strong> · ` +
            `${esc(prev.phone)} · ${esc(prev.email)} ביקש למחוק את השמות שמסר:</p>` +
            `<p style="margin:0;white-space:pre-wrap">` +
            esc(prev.souls.map((n) => fullName(n)).join("\n")) + `</p></div>`,
        });
        if (!ok) return new Response("mail failed", { status: 502, headers });
        try {
          await sendMail(env, {
            to: prev.email, replyTo: REPLY_TO_OWNER,
            subject: "פדיון כפרות - השמות הוסרו",
            html: deletedHtml(prev.sender),
          });
        } catch (e) {
          console.log("deleted mail threw", String(e).slice(0, 150));
        }
        return json({ ok: true, deleted: true });
      }

      const souls = cleanSouls(d.souls);
      if (!souls.length) return json({ ok: false, reason: "no souls" }, 400);
      for (const n of souls) {
        if (!n.parent || !n.gender) return json({ ok: false, reason: "incomplete" }, 400);
      }
      // מסירה ראשונה מתוך רשומה ריקה היא מסירה, לא תיקון. הרשומה נפתחת ריקה
      // ברגע שהתשלום אומת, ולכן ההבחנה היא בין souls ריק לבין רשימה קיימת.
      const first = !(prev.souls && prev.souls.length);
      const note = String(d.note || prev.note || "").trim().slice(0, 800);
      const next = Object.assign({}, prev, { souls: souls, note: note, ts: Date.now() });
      await writeList(env, payload.k, next);

      const ok = await sendMail(env, {
        to: TO, replyTo: prev.email,
        subject: (first ? "פדיון כפרות - " : "תיקון פדיון כפרות - ") +
          souls.length + " שמות מ" + prev.sender,
        html: ownerHtml(prev.sender, prev.phone, prev.email, souls, note,
          first ? "new" : "replace"),
      });
      if (!ok) return new Response("mail failed", { status: 502, headers });

      let replySent = false;
      try {
        replySent = await sendMail(env, {
          to: prev.email, replyTo: REPLY_TO_OWNER,
          subject: first
            ? "פדיון כפרות - השמות התקבלו, וכך עושים את הפדיון"
            : "פדיון כפרות - הרשימה עודכנה",
          html: confirmHtml(prev.sender, souls, d.token, first ? "new" : "replace"),
        });
      } catch (e) {
        console.log("confirm mail threw", String(e).slice(0, 150));
      }
      return json({ ok: true, count: souls.length, replySent: replySent });
    }

    // ---------- מסירה בלי טוקן: סגור ----------
    // עד 2026-09-13 אפשר היה למסור שמות ישירות מהעמוד, בלי תשלום. מאז שהשמות
    // נפתחים רק אחרי תרומה מאומתת, הדלת הזאת חייבת להיסגר - אחרת די בשליחת
    // בקשה ישירה כדי לעקוף את כל השער.
    return json({ ok: false, reason: "payment required" }, 402);
  },
};
