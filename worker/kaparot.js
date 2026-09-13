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

const DONATE = "https://nedar.im/7009579";
const PAGE = "https://hamikdash.co.il/chagim/yom-kippur/";

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
  const link = (m) => `${PAGE}?t=${encodeURIComponent(token)}&m=${m}`;
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

    // GET ?t=<token> - שליפת הרשימה הקיימת, למסך הניהול בעמוד.
    if (request.method === "GET") {
      const url = new URL(request.url);
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
      const next = Object.assign({}, prev, { souls: souls, ts: Date.now() });
      await writeList(env, payload.k, next);

      const ok = await sendMail(env, {
        to: TO, replyTo: prev.email,
        subject: "תיקון פדיון כפרות - " + souls.length + " שמות מ" + prev.sender,
        html: ownerHtml(prev.sender, prev.phone, prev.email, souls, "", "replace"),
      });
      if (!ok) return new Response("mail failed", { status: 502, headers });

      let replySent = false;
      try {
        replySent = await sendMail(env, {
          to: prev.email, replyTo: REPLY_TO_OWNER,
          subject: "פדיון כפרות - הרשימה עודכנה",
          html: confirmHtml(prev.sender, souls, d.token, "replace"),
        });
      } catch (e) {
        console.log("confirm mail threw", String(e).slice(0, 150));
      }
      return json({ ok: true, count: souls.length, replySent: replySent });
    }

    // ---------- מסלול המסירה הראשונה ----------
    const sender = String(d.sender || "").trim().slice(0, 120);
    const phone = String(d.phone || "").trim().slice(0, 40);
    const email = String(d.email || "").trim().slice(0, 160);
    const note = String(d.note || "").trim().slice(0, 800);

    // **שלושת השדות חובה** (הוראת יעקב 2026-09-13): השם, שם ההורה, וזכר/נקבה.
    // בלי שם ההורה אי אפשר לומר "פלוני בן פלוני" בפדיון, ובלי המגדר אי אפשר
    // לדעת אם "בן" או "בת" - ובשם של אדם לא מנחשים.
    const souls = cleanSouls(d.souls);
    if (!souls.length) return new Response("no souls", { status: 400, headers });
    for (const n of souls) {
      if (!n.parent || !n.gender)
        return new Response("incomplete soul", { status: 400, headers });
    }

    // אימות בצד השרת - הבדיקה בדפדפן לבדה ניתנת לעקיפה.
    if (!sender) return new Response("missing sender", { status: 400, headers });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return new Response("bad email", { status: 400, headers });
    const digits = phone.replace(/[\s\-().]/g, "");
    if (!/^(\+?972|0)5\d{8}$/.test(digits) && !/^\+\d{9,15}$/.test(digits))
      return new Response("bad phone", { status: 400, headers });

    // מסירה שנייה מאותו מייל **מוסיפה** ולא דורסת - מי שנזכר בעוד סבתא
    // ממלא שוב את הטופס, ולא מצפה שהראשונים ייעלמו.
    const key = await listKey(email);
    const prev = await readList(env, key);
    const merged = prev && Array.isArray(prev.souls)
      ? prev.souls.concat(souls).slice(0, MAX_SOULS)
      : souls;

    const ok = await sendMail(env, {
      to: TO,
      replyTo: email,
      subject: "פדיון כפרות - " + souls.length + " שמות מ" + sender,
      html: ownerHtml(sender, phone, email, souls, note, "new"),
    });
    if (!ok) return new Response("mail failed", { status: 502, headers });

    await writeList(env, key, {
      sender: sender, phone: phone, email: email, souls: merged, ts: Date.now(),
    });

    // ההוראות והכפתורים חוזרים לממלא. **כישלון כאן לא מפיל את הבקשה** -
    // הרשומה כבר יצאה ליעקב, והשמות לא ילכו לאיבוד בגלל מייל אישור.
    let replySent = false;
    try {
      const token = await signToken(
        { k: key, exp: Date.now() + TOKEN_DAYS * 86400000 },
        env.KAPAROT_TOKEN_SECRET
      );
      replySent = await sendMail(env, {
        to: email,
        replyTo: REPLY_TO_OWNER,
        subject: "פדיון כפרות - השמות התקבלו, וכך עושים את הפדיון",
        html: confirmHtml(sender, merged, token, "new"),
      });
      if (!replySent) console.log("confirm mail failed for", email);
    } catch (e) {
      console.log("confirm mail threw", String(e).slice(0, 200));
    }

    return json({ ok: true, count: souls.length, replySent: replySent });
  },
};
