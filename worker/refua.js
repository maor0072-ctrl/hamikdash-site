// hamikdash-refua - צד השרת של טופס השמות לרפואה ב-hamikdash.co.il.
//
// הצלע החיה של פרויקט "שמע, רפא ומשאלות". המבנה הוא שיקוף מכוון של
// worker/neshama.js, לפי הכרעת יעקב מ-7.10.2026: "כמו עילוי נשמות, רק
// שינוי במלל ההסבר". מה שבכל זאת שונה, ושינה גם את המודל ולא רק את המלל:
//
// 1. **שם האם ולא שם האב.** בתפילה על החיים נוקבים בשם האם. זה לא ניסוח
//    אלא נוהג, ולכן זה שדה אחר עם תווית אחרת.
// 2. **אין תאריך ואין חלון שבועי.** עילוי נשמה נשען על תאריך יארצייט
//    שמתגלגל; לחולה אין תאריך. השם נכנס לרשימה ונשאר בה כל עוד הוא נחוץ.
// 3. **הסרה בלחיצה אחת, בלי טופס.** חולה מחלים, ולהבדיל חולה נפטר, ושני
//    הרגעים האלה הם בדיוק הרגעים שבהם אסור לדרוש מאדם למלא טופס. לכל מייל
//    שיוצא מכאן מצורף קישור הסרה חתום.
//
// הדואר יוצא דרך **ברבו** מ-info@hamikdash.co.il, וג'ימייל נשאר כגיבוי.
// BREVO_API_KEY, COMPOSIO_API_KEY ו-REFUA_TOKEN_SECRET מוזרקים כסודות.
//
// **מה אסור להבטיח כאן:** תזכורת תקופתית למוסר, או כל דבר אוטומטי שעוד לא
// נבנה. הטופס מבטיח רק את מה שהכולל עושה בפועל השבוע.

const ALLOWED = [
  "https://hamikdash.co.il",
  "https://www.hamikdash.co.il",
  "http://127.0.0.1:8903",
];
const TO = "maor0072@gmail.com";

// **הזהות השולחת היא המוסד, לא יעקב.** מייל אוטומטי שיוצא בשמו הפרטי גורם
// לאנשים לחשוב שהרב עונה להם אישית, וזו הבטחה שלא נאמרה.
const FROM_ADDR = "info@hamikdash.co.il";
const FROM_NAME = "info@hamikdash.co.il";
const REPLY_TO_OWNER = "maor0072@gmail.com";
const COMPOSIO_USER = "maor0072@gmail.com";
const GMAIL_ACCOUNT = "ca_NGVDA1Vrsmz0";

const DONATE = "https://nedar.im/7009579";
const KEVA =
  "https://www.matara.pro/nedarimplus/online/?mosad=7009579&KevaDefault=1";
const PAGE = "https://hamikdash.co.il/refua.html";
// 09.10.2026: קישור ההסרה נשלח במייל, ולכן הוא חייב להיות בדומיין שלנו
// ולא ב-workers.dev - מי שהרשת שלו חוסמת את workers.dev לא יכול היה
// למסור שם, ולא יוכל גם להסיר אותו. הכתובת הישנה ממשיכה לענות, ולכן
// קישורים שיצאו במיילים קודמים לא נשברים.
const SELF = "https://refua.hamikdash.co.il";

const MAX_CHOLIM = 5; // תקרה שפויה; מעבר לזה זו כנראה הזנה אוטומטית

function cors(origin) {
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// "שרה" + "רבקה" הוא לא "שרה רבקה" אלא "שרה בת רבקה".
// המגדר הוא **שדה חובה מפורש** ולא נגזר מהקרבה, וההורה כאן הוא **האם**.
function fullName(n) {
  const parent = String(n.parent || "").trim();
  const name = String(n.name || "").trim();
  if (!parent) return name;
  if (/^(בן|בת|ב"ר|בר)\s/.test(parent)) return name + " " + parent;
  if (n.gender === "f") return name + " בת " + parent;
  if (n.gender === "m") return name + " בן " + parent;
  return name + " " + parent; // בלי מגדר לא ממציאים
}

function choleBlock(n, i) {
  return (
    `<table style="border-collapse:collapse;margin:0 0 16px">` +
    `<tr><td colspan="2" style="padding:0 0 6px;color:#b08434;font-weight:bold">שם ${i + 1}</td></tr>` +
    row("השם המלא", fullName(n)) +
    row("השם", n.name) +
    row("שם האם", n.parent) +
    row("קרבה למבקש", n.relation) +
    row("מין", n.gender === "f" ? "נקבה" : n.gender === "m" ? "זכר" : "לא צוין") +
    `</table>`
  );
}

function ownerNoticeHtml(req, cholim, isFix, isEmpty) {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<p><b>${isEmpty ? "בקשת הסרה" : isFix ? "תיקון רשימה" : "שמות חדשים לרפואה"}</b></p>` +
    `<table style="border-collapse:collapse;margin:0 0 20px">` +
    row("המבקש", req.name) + row("טלפון", req.phone) + row("מייל", req.email) +
    `</table>` +
    (isEmpty
      ? `<p>המבקש ביקש להסיר את כל השמות שמסר.</p>`
      : cholim.map(choleBlock).join("")) +
    (isFix && !isEmpty
      ? `<p><b>זהו תיקון.</b> הרשימה הזאת מחליפה את הקודמת של אותו מבקש, ואינה נוספת עליה.</p>`
      : "") +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

function thanksHtml(name, cholim, isFix, isEmpty, removeUrl) {
  const list = cholim
    .map((n) => `<li style="margin:4px 0">${esc(fullName(n))}</li>`)
    .join("");
  const h = (t) => `<p style="margin:22px 0 6px"><b>${t}</b></p>`;

  // ההסברים המלאים נשלחים **רק במסירה ראשונה**. מי שתיקן שם או הסיר שמות
  // כבר קיבל אותם, ולחזור עליהם בכל תיקון זה להציף אדם שעשה פעולה קטנה.
  const explain = isFix || isEmpty ? "" :
    h("מה נעשה בפועל.") +
    `<p>בכולל שלנו יושבים אברכים ולומדים כל יום. השמות שנמסרו נמצאים לפני ` +
    `האברכים, נאמרים בתפילות ובעת פתיחת ההיכל, והלימוד נעשה גם לרפואתם. ` +
    `השם מופיע גם ברשימה הגלויה שבאתר, כדי שכל מי שנכנס יוכל לומר עליו מילה ` +
    `או פרק תהילים.</p>` +

    h("זה נשאר ברשימה, ולא פג בשבוע.") +
    `<p>אין כאן תאריך שפג ואין צורך למסור שוב. השם נשאר ברשימה כל עוד הוא ` +
    `נחוץ, ואתם מחליטים מתי להוציא אותו.</p>` +

    h("וכשתבוא הרפואה.") +
    `<p>ברגע שתגיע הבשורה הטובה, בבקשה הודיעו לנו - בלחיצה אחת על הקישור ` +
    `שבתחתית המייל הזה, או בתשובה למייל. אנחנו רוצים לדעת, ורשימה מעודכנת ` +
    `היא גם תפילה מכוונת יותר.</p>` +

    h("אם הפרטים לא מדויקים.") +
    `<p>בתפילה על חולה נוקבים בשם האם. אם מסרתם בטעות שם של אב, או שהשם ` +
    `הכתוב אינו השם שקוראים בו, אפשר להשיב למייל הזה ונתקן, ואפשר לשנות ` +
    `בכל עת דרך האתר. שם שנמסר עם פרט חסר עדיף פי כמה על שם שלא נמסר.</p>` +

    h("וזה חלק ממשהו גדול יותר.") +
    `<p>השמות לרפואה הם חלק מפרויקט "שמע, רפא ומשאלות" - אמירת שמע ישראל ` +
    `בחצות, שמות לברכה ולרפואה, בקשת משאלות וחלוקת ספר התהילים. כל מה שנעשה ` +
    `שם, לרבות קריאת התהילים, נזקף גם לרפואת החולים שברשימה.</p>`;

  const removeLine = removeUrl && !isEmpty
    ? `<p style="font-size:14px;color:#4a453e">הבריא ברוך השם, או שאין צורך יותר? ` +
      `<a href="${removeUrl}" style="color:#8a6a1f">להסרת השמות מהרשימה בלחיצה אחת</a>.</p>`
    : "";

  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<p>שלום ${esc(name)},</p>` +
    (isEmpty
      ? `<p>השמות הוסרו לפי בקשתך, ואין לך כרגע שמות ברשימה. ` +
        `אפשר למסור שוב בכל עת.</p>`
      : isFix
      ? `<p>התיקון התקבל. זו הרשימה המעודכנת, והיא מחליפה את הקודמת:</p>`
      : `<p>קיבלנו את בקשתך, והשמות נמסרו לאברכי הכולל.</p>`) +
    (isEmpty ? "" :
      `<ul style="background:#f3ece0;border-right:4px solid #b08434;padding:14px 24px 14px 18px;` +
      `border-radius:8px;list-style:none;margin:20px 0">${list}</ul>`) +
    explain +
    (isFix || isEmpty
      ? `<p>אם משהו בפרטים לא מדויק, אפשר פשוט להשיב למייל הזה ונתקן.</p>`
      : "") +
    `<hr style="border:0;border-top:1px solid #e5ddd0;margin:28px 0">` +
    `<p>מה שמחזיק את הכולל הוא אנשים שנותנים בקביעות. אם רצונך לקחת חלק, כל סכום עוזר, ` +
    `וכל שקל הולך ממש לקודש הקודשים.</p>` +
    `<p><a href="${KEVA}" style="background:#b08434;color:#fff;text-decoration:none;` +
    `padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">` +
    `להוראת קבע לכולל</a>` +
    `<a href="${DONATE}" style="color:#4a453e;text-decoration:underline;` +
    `display:inline-block;padding:12px 18px">או תרומה חד פעמית</a></p>` +
    `<p style="margin-top:28px">שתזכו לבשורות טובות, ולרפואה שלמה במהרה.</p>` +
    `<p>באהבה,<br>יעקב מאור<br>0528395189</p>` +
    removeLine +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

const KV_KEY = "public-list";
const MAX_PUBLIC = 400; // תקרה להצגה; מעבר לזה הדף נהיה בלתי קריא

// הרשימה הפומבית מחזיקה **רק** את מה שמותר להופיע באתר: שם, שם האם ומגדר.
// שם המבקש, הטלפון והמייל שלו לעולם לא נכנסים לכאן, כי הקובץ הזה מוגש לכל
// אדם באינטרנט. גם הקרבה לא נכנסת - "אשתי" מזהה את המוסר.
function publicEntry(n) {
  return { name: n.name, parent: n.parent, gender: n.gender };
}

async function readPublic(env) {
  if (!env.REFUA) return [];
  const raw = await env.REFUA.get(KV_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

// KV הוא eventually consistent ואין בו טרנזקציות. שתי הגשות באותה שנייה
// יכולות לדרוס זו את זו. בהיקף של עשרות שמות בשבוע זה לא מעשי לדאוג לזה,
// והמייל ליעקב הוא ממילא הרשומה הקובעת - הרשימה הפומבית היא תצוגה.
// **הגשה רגילה מצטברת; רק תיקון מחליף.** ההנחה ההפוכה היא באג שכבר עלה
// ביוקר בדף עילוי הנשמות - 17 שמות ויארצייט אחד נמחקו בשקט כשאדם מסר מנה
// שנייה, וקיבל מייל אישור בלי שום סיבה לחשוד. התיקון כאן נעשה לפני שנמסר
// כאן ולו שם אחד.
async function writePublic(env, ownerKey, list, isFix) {
  if (!env.REFUA) return;
  const cur = await readPublic(env);
  const add = list.map((n) => Object.assign(publicEntry(n), { owner: ownerKey }));
  if (isFix) {
    const others = cur.filter((e) => e.owner !== ownerKey);
    await env.REFUA.put(KV_KEY, JSON.stringify(others.concat(add).slice(-MAX_PUBLIC)));
    return;
  }
  // מסירה חוזרת של אותו שם אינה מוסיפה אותו פעמיים. אין כאן תאריך, ולכן
  // המפתח הוא השם ושם האם בלבד.
  const key = (e) => [e.name, e.parent].join("|");
  const seen = new Set(cur.filter((e) => e.owner === ownerKey).map(key));
  const fresh = add.filter((e) => !seen.has(key(e)));
  await env.REFUA.put(KV_KEY, JSON.stringify(cur.concat(fresh).slice(-MAX_PUBLIC)));
}

// רשומת המוסר, פרטית לחלוטין. היא **לא** מוגשת באף מסלול GET. `ts` נשמר
// כדי שבהמשך נוכל לשאול את המוסר אם השם עוד נחוץ; אין על זה שום הבטחה
// באתר ולא במייל עד שהמנגנון באמת ירוץ.
//
// `cholim` כאן מצטבר בדיוק כמו הרשימה הפומבית, ומאותה סיבה: זו הרשימה
// שמייל החידוש החודשי ישלח למוסר, ומנה שמוחקת את קודמותיה הייתה מציגה
// לאדם פחות שמות ממה שמסר.
async function saveSubmitter(env, ownerKey, data, isFix) {
  if (!env.REFUA) return;
  if (!isFix) {
    const prev = await env.REFUA.get("sub:" + ownerKey);
    if (prev) {
      try {
        const old = JSON.parse(prev) || {};
        const key = (s) => [s.name, s.parent].join("|");
        const seen = new Set((data.cholim || []).map(key));
        const keep = (old.cholim || []).filter((s) => !seen.has(key(s)));
        data = Object.assign({}, data, { cholim: keep.concat(data.cholim || []) });
      } catch (e) {
        console.log("sub merge failed", String(e).slice(0, 200));
      }
    }
  }
  data.count = (data.cholim || []).length;
  await env.REFUA.put("sub:" + ownerKey, JSON.stringify(data));
}

async function ownerHash(email) {
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode("hamikdash:" + email.toLowerCase()));
  return Array.from(new Uint8Array(buf)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- קישור ההסרה: חתימה על מפתח הבעלות, בלי מצב בשרת -------------------
const enc = new TextEncoder();

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function removeUrlFor(env, ownerKey) {
  if (!env.REFUA_TOKEN_SECRET) return "";
  const sig = await hmac(env.REFUA_TOKEN_SECRET, ownerKey);
  return `${SELF}/remove?o=${ownerKey}&s=${sig}`;
}

function removePage(title, body) {
  return new Response(
    `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title} | אורות האמונה - בני משה</title>` +
    `<style>body{font-family:system-ui,Arial,sans-serif;background:#faf6ef;color:#1c1a17;` +
    `margin:0;padding:48px 20px;line-height:1.8}main{max-width:560px;margin:0 auto;` +
    `background:#fff;border:1px solid #e5ddd0;border-radius:14px;padding:28px 26px}` +
    `h1{font-size:26px;margin:0 0 14px;color:#8a6a1f}a{color:#8a6a1f}</style></head>` +
    `<body><main><h1>${title}</h1>${body}` +
    `<p style="margin-top:26px"><a href="${PAGE}">חזרה לדף השמות לרפואה</a></p>` +
    `</main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (request.method === "GET") {
      // GET /?list=public - הרשימה שכל המבקרים רואים.
      if (url.searchParams.get("list") === "public") {
        const all = (await readPublic(env)).map(publicEntry);
        return new Response(JSON.stringify({ names: all }), {
          status: 200,
          headers: Object.assign({}, headers, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          }),
        });
      }

      // GET /remove?o=&s= - הסרה בלחיצה אחת מתוך המייל. אדם שקיבל בשורה
      // טובה, ולהבדיל אדם שנפטר לו יקיר, לא ימלא טופס. הקישור חתום ולכן
      // הוא לא מאפשר להסיר את השמות של מישהו אחר.
      if (url.pathname === "/remove") {
        const o = url.searchParams.get("o") || "";
        const s = url.searchParams.get("s") || "";
        const bad = `<p>אפשר להסיר שמות גם מתוך הדף עצמו, בלשונית התיקון.</p>`;
        if (!o || !s || !env.REFUA_TOKEN_SECRET)
          return removePage("הקישור אינו תקין", bad);
        if ((await hmac(env.REFUA_TOKEN_SECRET, o)) !== s)
          return removePage("הקישור אינו תקין", bad);
        const before = await readPublic(env);
        const kept = before.filter((e) => e.owner !== o);
        if (kept.length !== before.length) await env.REFUA.put(KV_KEY, JSON.stringify(kept));
        await sendMail(env, {
          to: TO, replyTo: REPLY_TO_OWNER,
          subject: "הסרה מרשימת הרפואה (קישור מהמייל)",
          html: `<div dir="rtl">הוסרו ${before.length - kept.length} שמות של מוסר ${esc(o)}.</div>`,
        });
        return removePage("השמות הוסרו", `<p>הוסרו מהרשימה, ותודה שהודעתם. ` +
          `אם זו בשורה טובה - שתהיה שעה טובה ומבורכת, ואם לא, שלא תדעו עוד צער. ` +
          `אפשר למסור שמות חדשים בכל עת.</p>`);
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
    // מחזירים 200 בכוונה - בוט שמקבל שגיאה מנסה שוב, בוט שמקבל אישור הולך.
    if (d.website) return new Response("ok", { status: 200, headers });

    for (const f of ["name", "phone", "email"]) {
      if (!d[f] || !String(d[f]).trim())
        return new Response("missing " + f, { status: 400, headers });
    }
    const email = String(d.email).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return new Response("bad email", { status: 400, headers });

    // אימות בצד השרת - הבדיקה בדפדפן לבדה ניתנת לעקיפה.
    const digits = String(d.phone).trim().replace(/[\s\-().]/g, "");
    if (!/^(\+?972|0)5\d{8}$/.test(digits) && !/^\+\d{9,15}$/.test(digits))
      return new Response("bad phone", { status: 400, headers });

    const cholim = (Array.isArray(d.cholim) ? d.cholim : [])
      .map((n) => ({
        name: String((n && n.name) || "").trim().slice(0, 120),
        parent: String((n && n.parent) || "").trim().slice(0, 120),
        relation: String((n && n.relation) || "").trim().slice(0, 80),
        gender: (n && n.gender) === "f" ? "f" : (n && n.gender) === "m" ? "m" : "",
      }))
      .filter((n) => n.name)
      .slice(0, MAX_CHOLIM);

    // רשימה ריקה **בתיקון** היא בקשת הסרה מפורשת, לא טופס פגום.
    const isFix = d.kind === "correction";
    if (!cholim.length && !isFix)
      return new Response("no cholim", { status: 400, headers });
    for (const n of cholim) {
      if (!n.parent || !n.relation || !n.gender)
        return new Response("incomplete chole", { status: 400, headers });
    }

    const isEmpty = isFix && !cholim.length;
    const req = {
      name: String(d.name).trim().slice(0, 120),
      phone: String(d.phone).trim().slice(0, 40),
      email,
    };

    // ההודעה ליעקב היא העיקר ולכן היא נשלחת ראשונה: היא **הרשומה** של
    // הבקשה. אם היא נכשלה, המבקש חייב לראות שגיאה ולא אישור שקרי.
    const okNotice = await sendMail(env, {
      to: TO,
      replyTo: req.email,
      subject: (isEmpty ? "הסרה מרשימת הרפואה: " : isFix ? "תיקון רשימת רפואה: " : "שמות לרפואה: ") +
        `${req.name}${isEmpty ? "" : " (" + cholim.length + ")"}`,
      html: ownerNoticeHtml(req, cholim, isFix, isEmpty),
    });
    if (!okNotice) return new Response("send failed", { status: 502, headers });

    const ownerKey = await ownerHash(req.email);
    try {
      await writePublic(env, ownerKey, cholim, isFix);
      await saveSubmitter(env, ownerKey, Object.assign({}, req, {
        cholim: cholim,
        ts: new Date().toISOString(),
      }), isFix);
    } catch (e) {
      console.log("kv write failed", String(e).slice(0, 200));
    }

    await sendMail(env, {
      to: req.email,
      replyTo: REPLY_TO_OWNER,
      subject: isEmpty ? "השמות הוסרו מרשימת הרפואה"
             : isFix ? "הרשימה עודכנה" : "קיבלנו את השמות לרפואה",
      html: thanksHtml(req.name, cholim, isFix, isEmpty, await removeUrlFor(env, ownerKey)),
    });

    return new Response("ok", { status: 200, headers });
  },
};
