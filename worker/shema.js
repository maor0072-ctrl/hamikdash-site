// hamikdash-shema - צד השרת של "שמע בחצות" ב-hamikdash.co.il.
//
// גל ראשון (MVP) של פרויקט "שמע בחצות": הצטרפות עם אימות מייל, עד שלוש
// שורות משאלה, רשימה כללית פומבית (שם פרטי + שם ההורה בלבד), דיווח והסרה.
// בלי כסף, בלי מכסות, בלי מיון, בלי אזור אישי, בלי מחזור חיים אוטומטי -
// אלה מגיעים בגלים הבאים לפי outputs/specs/2026-09-08-shema-bachatzot.md.
//
// שני צעדים ולא אחד (בניגוד ל-neshama.js): הצטרפות שולחת מייל עם קישור
// חתום (HMAC), וביקור בקישור *הוא* האימות - בלי D1 ובלי טבלת "בקשות
// ממתינות". זה עקבי עם ההחלטה שבגל הזה אין שאילתות אמיתיות ולכן אין צורך
// ב-D1 בכלל (ראה build/shema-bachatzot/DECISIONS.md סעיף 13).
//
// המבנה הכללי (CORS, שליחת מייל, KV לרשימה הפומבית) מועתק בכוונה מ-
// build/hamikdash-site/worker/neshama.js, כדי לא להמציא דפוס שני. זהו
// Worker נפרד לגמרי - אין נגיעה בקוד או בסודות של neshama.

const ALLOWED = [
  "https://hamikdash.co.il",
  "https://www.hamikdash.co.il",
  "http://127.0.0.1:8903",
];
const TO = "maor0072@gmail.com";
const FROM_ADDR = "info@hamikdash.co.il";
const FROM_NAME = "info@hamikdash.co.il";
const REPLY_TO_OWNER = "maor0072@gmail.com";
const COMPOSIO_USER = "maor0072@gmail.com";
const GMAIL_ACCOUNT = "ca_NGVDA1Vrsmz0";

const DONATE = "https://nedar.im/7009579";
const KEVA =
  "https://www.matara.pro/nedarimplus/online/?mosad=7009579&KevaDefault=1";
const PAGE = "https://hamikdash.co.il/shema.html";
const WISHES_PAGE = "https://hamikdash.co.il/shema-wishes.html";
const SELF_URL = "https://hamikdash-shema.maor0072.workers.dev";

const MAX_WISHES = 3;
const JOIN_TOKEN_DAYS = 30;
const REMOVE_TOKEN_DAYS = 14;

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

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:6px 14px 6px 0;color:#4a453e;white-space:nowrap;vertical-align:top">${label}</td>` +
         `<td style="padding:6px 0;color:#1c1a17"><strong>${esc(value)}</strong></td></tr>`;
}

const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

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

function encodeHeader(v) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
  if (!m) return v;
  return `=?UTF-8?B?${b64(m[1])}?= <${m[2]}>`;
}

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
  if (!res.ok) {
    console.log("proxy failed", res.status);
    return false;
  }
  const out = await res.json().catch(() => null);
  const ok = out && out.status >= 200 && out.status < 300;
  if (!ok) console.log("gmail rejected", JSON.stringify(out).slice(0, 400));
  return ok;
}

// ===== טוקנים חתומים (HMAC-SHA256) - בלי D1, בלי מצב שמור בצד השרת =====
// הביקור בקישור החתום *הוא* האימות. תוקף הטוקן נבדק בזמן האימות (exp),
// ואין רשימת "טוקנים שכבר נוצלו" - לא נדרש בהיקף הזה (ראה DECISIONS §13).

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
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(payloadB64)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ===== סינון תוכן מבוסס-AI, לא רשימת מילים, ולא חוסם =====
// הוראה מפורשת של יעקב: "כשאתה לא בטוח שהמלל לא תקין, אתה מאפשר את זה".
// כשל בקריאה (timeout/שגיאת רשת/שגיאת API) חייב לברור ל-OK תמיד - תקלה
// אצל ספק ה-AI לעולם לא חוסמת פרסום.
async function moderateWishes(env, texts) {
  const fallback = texts.map(() => "OK");
  if (!env.ANTHROPIC_API_KEY || !texts.length) return fallback;
  try {
    const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0,
        system:
          "אתה בודק תוכן קצר לפני פרסום בדף תפילה קהילתי. תפקידך היחיד הוא " +
          "לזהות תוכן שהוא איום אלים ממשי, קללה בוטה, או הסתה - ותו לא. " +
          "תוכן עצוב, כואב, מוזר, תמים, או כתוב בשגיאות - כל זה OK. " +
          "כשיש לך ספק כלשהו, תמיד תבחר OK. תקבל רשימה ממוספרת של משפטים, " +
          "ותחזיר אך ורק מערך JSON שטוח באורך זהה, כל איבר המילה 'OK' או " +
          "'NEEDS_REVIEW', בלי שום טקסט נוסף לפני או אחרי.",
        messages: [{ role: "user", content: numbered }],
      }),
    });
    if (!res.ok) return fallback;
    const out = await res.json();
    const text = out && out.content && out.content[0] && out.content[0].text;
    if (!text) return fallback;
    const match = text.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(match ? match[0] : text);
    if (!Array.isArray(arr) || arr.length !== texts.length) return fallback;
    return arr.map((v) => (v === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "OK"));
  } catch (e) {
    console.log("moderation failed", String(e).slice(0, 200));
    return fallback;
  }
}

// ===== הרשימה הפומבית ב-KV =====
// שם פרטי ושם ההורה בלבד - בלי שם משפחה, בלי מייל/טלפון, בלי הצורך
// המפורט (הצורך נשמר רק במייל ליעקב). כל שורה מקבלת id אקראי כדי שדיווח
// והסרה יוכלו למקד שורה מדויקת בלי לבלבל בין שני אנשים באותו שם.
const KV_KEY = "public-list";
const MAX_PUBLIC = 1000;

async function readPublic(env) {
  if (!env.SHEMA_WISHES) return [];
  const raw = await env.SHEMA_WISHES.get(KV_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

async function writePublic(env, list) {
  if (!env.SHEMA_WISHES) return;
  await env.SHEMA_WISHES.put(KV_KEY, JSON.stringify(list.slice(-MAX_PUBLIC)));
}

// הגשה חוזרת מאותו בעלים (אותו טוקן/מייל) מחליפה את השורות הקודמות שלו
// ולא מכפילה אותן - זהה לעיקרון ב-appendPublic של neshama.js. בגל הזה אין
// אזור אישי שבו אפשר "להוסיף עוד", אז זו ברירת המחדל הבטוחה.
async function appendPublic(env, entries, ownerKey) {
  const cur = await readPublic(env);
  const kept = cur.filter((e) => e.owner !== ownerKey);
  const add = entries.map((e) => ({
    id: crypto.randomUUID(),
    name: e.name,
    parent: e.parent,
    owner: ownerKey,
  }));
  await writePublic(env, kept.concat(add));
  return add;
}

async function ownerHash(email) {
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode("shema:" + email.toLowerCase()));
  return Array.from(new Uint8Array(buf)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PHONE_RE = /^(\+?972|0)5\d{8}$/;
const PHONE_INTL_RE = /^\+\d{9,15}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validPhone(raw) {
  const digits = String(raw || "").trim().replace(/[\s\-().]/g, "");
  return PHONE_RE.test(digits) || PHONE_INTL_RE.test(digits);
}

// ===== מיילים =====

function joinMailHtml(name, wishesUrl) {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<p>שלום ${esc(name)},</p>` +
    `<p>שמחים שהצטרפת ל"שמע בחצות". כל לילה בחצות (24:00 שעון ישראל, בלי קשר לשעון ` +
    `קיץ) שותפי הפרויקט בכל העולם אומרים יחד "שְׁמַע יִשְׂרָאֵל ה' אֱלקינוּ ה' אֶחָד", ` +
    `ומיד אחר כך מבקשים את משאלות ליבם - קודם על חברם, ורק אחר כך על עצמם.</p>` +
    `<p>הצעד הבא, אם תרצה/י: מסירת שם למי שתרצה/י שיתפללו עליו.</p>` +
    `<p style="margin:26px 0"><a href="${esc(wishesUrl)}" style="background:#b08434;color:#fff;` +
    `text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;` +
    `font-weight:bold">למילוי משאלות</a></p>` +
    `<p style="color:#8a8478;font-size:14px">הקישור הזה אישי ותקף לחודש. אין צורך להיכנס ` +
    `לאתר כדי לומר "שמע" בחצות - זה לא תנאי, אפשר לומר כל לילה בלי לבקר כאן אף פעם.</p>` +
    `<p style="margin-top:28px">באהבה,<br>יעקב מאור</p>` +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

function ownerNoticeHtml(d, wishes, flags) {
  const list = wishes.map((w, i) => {
    const mark = flags[i] === "NEEDS_REVIEW"
      ? `<p style="margin:0 0 6px;color:#c0392b;font-weight:bold">⚠️ לבדוק</p>` : "";
    return `<table style="border-collapse:collapse;margin:0 0 16px">` +
      `<tr><td colspan="2">${mark}</td></tr>` +
      row("שם", w.name) + row("שם ההורה", w.parent) + row("הקרבה", w.relation) +
      row("המשאלה", w.wish) +
      row("פרסום", w.publicOk && !w.privateOnly ? "ברשימה הכללית" : "פרטי בלבד") +
      `</table>`;
  }).join("");
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
    `<h2 style="margin:0 0 4px">בקשת משאלות חדשה - שמע בחצות</h2>` +
    `<p style="margin:0 0 18px;color:#8a8478;font-size:13px">${wishes.length} שורות · מהאתר</p>` +
    `<table style="border-collapse:collapse;margin-bottom:20px">` +
    row("שם המבקש", d.name) + row("טלפון", d.phone) + row("דוא\"ל", d.email) +
    `</table>` + list + `</div>`
  );
}

function wishesThanksHtml(name, wishes) {
  const pub = wishes.filter((w) => w.publicOk && !w.privateOnly);
  const priv = wishes.filter((w) => !(w.publicOk && !w.privateOnly));
  const li = (w) => `<li style="margin:4px 0">${esc(w.name)} - ${esc(w.parent)}</li>`;
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<p>שלום ${esc(name)},</p>` +
    `<p>קיבלנו את המשאלות שמסרת. הלילה, בחצות, שותפי הפרויקט מתפללים גם עליהן.</p>` +
    (pub.length
      ? `<p>אלה עלו לרשימה הכללית שכל השותפים רואים:</p>` +
        `<ul style="background:#f3ece0;border-right:4px solid #b08434;padding:14px 24px 14px 18px;` +
        `border-radius:8px;list-style:none;margin:20px 0">${pub.map(li).join("")}</ul>`
      : "") +
    (priv.length
      ? `<p>ואלה נשמרו אצלנו בלבד, ולא מוצגות באתר: ` +
        `${priv.map((w) => esc(w.name) + " - " + esc(w.parent)).join(", ")}.</p>`
      : "") +
    `<p>אם משהו לא מדויק, פשוט השב/י למייל הזה.</p>` +
    `<hr style="border:0;border-top:1px solid #e5ddd0;margin:28px 0">` +
    `<p>מה שמחזיק את הכולל הוא אנשים שנותנים בקביעות. אם רצונך לקחת חלק, כל סכום עוזר.</p>` +
    `<p><a href="${KEVA}" style="background:#b08434;color:#fff;text-decoration:none;` +
    `padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">` +
    `להוראת קבע לכולל</a>` +
    `<a href="${DONATE}" style="color:#4a453e;text-decoration:underline;` +
    `display:inline-block;padding:12px 18px">או תרומה חד פעמית</a></p>` +
    `<p style="margin-top:28px">באהבה,<br>יעקב מאור<br>0528395189</p>` +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

function removedHtml(msg) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>שמע בחצות</title></head><body style="font-family:Arial,sans-serif;` +
    `font-size:18px;padding:40px 24px;text-align:center;color:#1c1a17">` +
    `<p>${esc(msg)}</p></body></html>`;
}

// ===== הבקשה עצמה =====

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (request.method === "GET") {
      if (url.pathname === "/remove") {
        const payload = await verifyToken(url.searchParams.get("token"), env.SHEMA_TOKEN_SECRET);
        if (!payload || payload.action !== "remove") {
          return new Response(removedHtml("הקישור הזה כבר לא בתוקף, או שהשורה כבר הוסרה."), {
            status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        const cur = await readPublic(env);
        const next = cur.filter((e) => e.id !== payload.id);
        await writePublic(env, next);
        return new Response(removedHtml("השורה הוסרה מהרשימה הכללית."), {
          status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      if (url.searchParams.get("list") === "public") {
        const all = (await readPublic(env)).map((e) => ({ id: e.id, name: e.name, parent: e.parent }));
        return new Response(JSON.stringify({ names: all }), {
          status: 200,
          headers: Object.assign({}, headers, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          }),
        });
      }
      return new Response("method not allowed", { status: 405, headers });
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
    if (d.website) return new Response("ok", { status: 200, headers });

    if (d.action === "join") return handleJoin(d, env, headers);
    if (d.action === "wishes") return handleWishes(d, env, headers);
    if (d.action === "report") return handleReport(d, env, headers);
    return new Response("bad action", { status: 400, headers });
  },
};

async function handleJoin(d, env, headers) {
  for (const f of ["name", "phone", "email"]) {
    if (!d[f] || !String(d[f]).trim())
      return new Response("missing " + f, { status: 400, headers });
  }
  const email = String(d.email).trim();
  if (!EMAIL_RE.test(email)) return new Response("bad email", { status: 400, headers });
  if (!validPhone(d.phone)) return new Response("bad phone", { status: 400, headers });

  const payload = {
    name: String(d.name).trim().slice(0, 120),
    phone: String(d.phone).trim().slice(0, 40),
    email,
    exp: Date.now() + JOIN_TOKEN_DAYS * 86400000,
  };
  const token = await signToken(payload, env.SHEMA_TOKEN_SECRET);
  const wishesUrl = `${WISHES_PAGE}?t=${encodeURIComponent(token)}`;

  const ok = await sendMail(env, {
    to: email,
    replyTo: REPLY_TO_OWNER,
    subject: "ברוך/ה הבא/ה ל'שמע בחצות'",
    html: joinMailHtml(payload.name, wishesUrl),
  });
  if (!ok) return new Response("send failed", { status: 502, headers });
  return new Response("ok", { status: 200, headers });
}

async function handleWishes(d, env, headers) {
  const identity = await verifyToken(d.token, env.SHEMA_TOKEN_SECRET);
  if (!identity || !identity.email)
    return new Response("bad or expired token", { status: 401, headers });

  const raw = Array.isArray(d.wishes) ? d.wishes : [];
  const wishes = raw
    .map((w) => ({
      name: String((w && w.name) || "").trim().slice(0, 80),
      parent: String((w && w.parent) || "").trim().slice(0, 80),
      wish: String((w && w.wish) || "").trim().slice(0, 500),
      relation: String((w && w.relation) || "").trim().slice(0, 80),
      publicOk: !!(w && w.publicOk),
      privateOnly: !!(w && w.privateOnly),
    }))
    .filter((w) => w.name)
    .slice(0, MAX_WISHES);

  if (!wishes.length) return new Response("no wishes", { status: 400, headers });
  for (const w of wishes) {
    if (!w.parent || !w.wish || !w.relation)
      return new Response("incomplete wish", { status: 400, headers });
    if (!w.publicOk && !w.privateOnly)
      return new Response("missing permission", { status: 400, headers });
  }

  const flags = await moderateWishes(env, wishes.map((w) => w.wish));

  const requester = { name: identity.name, phone: identity.phone, email: identity.email };
  const flaggedAny = flags.some((f) => f === "NEEDS_REVIEW");
  const okNotice = await sendMail(env, {
    to: TO,
    replyTo: requester.email,
    subject: (flaggedAny ? "⚠️ לבדוק: " : "") +
      `בקשת משאלות: ${requester.name} (${wishes.length})`,
    html: ownerNoticeHtml(requester, wishes, flags),
  });
  if (!okNotice) return new Response("send failed", { status: 502, headers });

  const publicWishes = wishes.filter((w) => w.publicOk && !w.privateOnly);
  if (publicWishes.length) {
    try {
      await appendPublic(env, publicWishes, await ownerHash(requester.email));
    } catch (e) {
      console.log("kv append failed", String(e).slice(0, 200));
    }
  }

  await sendMail(env, {
    to: requester.email,
    replyTo: REPLY_TO_OWNER,
    subject: "קיבלנו את המשאלות שלך",
    html: wishesThanksHtml(requester.name, wishes),
  });

  return new Response("ok", { status: 200, headers });
}

async function handleReport(d, env, headers) {
  const id = String(d.id || "").trim();
  if (!id) return new Response("missing id", { status: 400, headers });
  const cur = await readPublic(env);
  const entry = cur.find((e) => e.id === id);
  if (!entry) return new Response("ok", { status: 200, headers }); // כבר לא ברשימה

  const removeToken = await signToken(
    { action: "remove", id: entry.id, exp: Date.now() + REMOVE_TOKEN_DAYS * 86400000 },
    env.SHEMA_TOKEN_SECRET
  );
  const removeUrl = `${SELF_URL}/remove?token=${encodeURIComponent(removeToken)}`;

  const html =
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
    `<h2 style="margin:0 0 4px;color:#c0392b">דיווח על שורה - שמע בחצות</h2>` +
    `<p style="margin:0 0 18px;padding:10px 14px;background:#fdecea;` +
    `border-right:4px solid #c0392b;border-radius:6px">מבקר באתר דיווח על השורה הבאה.</p>` +
    `<table style="border-collapse:collapse;margin-bottom:20px">` +
    row("שם", entry.name) + row("שם ההורה", entry.parent) + `</table>` +
    `<p><a href="${removeUrl}" style="background:#c0392b;color:#fff;text-decoration:none;` +
    `padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">` +
    `להסיר את השורה הזאת</a></p>` +
    `<p style="color:#8a8478;font-size:13px">אם השורה בסדר, אין צורך לעשות כלום.</p>` +
    `</div>`;

  await sendMail(env, { to: TO, subject: "🚩 דיווח על שורה: " + entry.name, html });
  return new Response("ok", { status: 200, headers });
}
