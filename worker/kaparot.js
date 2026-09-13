// hamikdash-kaparot - צד השרת של טופס השמות לפדיון כפרות ב-hamikdash.co.il.
//
// קמפיין יום כיפור תשפ"ז. עד היום יעקב קיבל את רשימות השמות כהודעות וואטסאפ
// חופשיות והקליד אותן ידנית; הטופס הזה מחליף את ההקלדה, לא את הקשר.
//
// **בכוונה בלי מאגר.** אין KV, אין D1 ואין רשימה פומבית - המייל ליעקב **הוא**
// הרשומה. לכן כישלון שליחה מחזיר 502 והמבקש רואה שגיאה, ולא אישור שקרי.
// זהו אותו גל-אפס של neshama.js, ומאותה סיבה: האתר סטטי (GitHub Pages) ואין
// לו צד שרת, ואסור ששירות טפסים חיצוני יראה שמות של אנשים.
//
// המבנה, הדואר וה-CORS מועתקים מ-worker/neshama.js כדי לא להמציא דפוס שני.
// זהו Worker נפרד לגמרי - אין נגיעה בקוד או בסודות של neshama ושל shema.
//
// **מה אסור להבטיח כאן:** שהשמות יישמרו, שתגיע תזכורת, או שמישהו יחזור אל
// הממלא. הטופס מבטיח רק את מה שקורה בפועל - השמות מגיעים ליעקב לפני כיפור.

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

// ברבו ראשי, ג'ימייל גיבוי. המייל הזה הוא הרשומה היחידה, ולכן אסור שכשל של
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

// ההוראות שחוזרות לממלא. **זו הסיבה שהטופס מבקש מייל בכלל** - יעקב הנחה
// (2026-09-13) שמי שמסר שמות יקבל בחזרה את סדר העשייה, כי מסירת השמות אינה
// הפדיון עצמו: הפדיון נעשה בבית, עם הכסף, על כל אחד מבני המשפחה.
function instructionsHtml() {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<h2 style="margin:0 0 6px">השמות התקבלו</h2>` +
    `<p style="margin:0 0 20px;color:#4a453e">הם יעלו בפדיון הכפרות לפני יום כיפור.</p>` +
    `<h3 style="margin:0 0 8px;color:#8a6d3b">איך עושים את פדיון הכפרות בפועל</h3>` +
    `<p style="margin:0 0 14px">לכל אחד ואחד מבני המשפחה, לקחת שטר כסף, נניח 50 שקלים או יותר. ` +
    `ולכוון <strong>שלא השטר הזה פיזית ישמש לפדיון הכפרות, אלא הסכום שאותו תרמתי</strong> - ` +
    `בין אם נתתי סכום פיזי ובין אם עשיתי העברה בנקאית או תשלום בביט או בכל דרך אחרת.</p>` +
    `<p style="margin:0 0 10px">לסובב את הכסף סביב הראש ולומר:</p>` +
    `<p style="margin:0 0 14px;padding:14px 18px;background:#faf7f0;border-right:4px solid #c9ab77;` +
    `border-radius:6px;font-weight:700">זה חליפתי תמורתי כפרתי, כשווה ערך של זה הכסף ילך לצדקה, ` +
    `ופלוני בן/בת פלוני ילך לחיים ארוכים ולשלום.</p>` +
    `<p style="margin:0 0 14px">ולכוון לראשי תיבות <strong>חת"ך</strong>.</p>` +
    `<p style="margin:0 0 20px">ושוב: זה חליפתי, תמורתי, כפרתי... <strong>שלוש פעמים</strong>. ` +
    `ולעשות כך לכל אחד ואחד מבני המשפחה.</p>` +
    `<h3 style="margin:0 0 8px;color:#8a6d3b">הסכום</h3>` +
    `<p style="margin:0 0 14px">מחיר תרנגול או תרנגולת, לכל אחד ואחד מבני המשפחה. ` +
    `כל אחד ישער לעצמו את המחיר. הכסף כולו הולך למשפחות נזקקות.</p>` +
    `<p style="margin:0 0 22px"><a href="${DONATE}" ` +
    `style="display:inline-block;padding:12px 26px;background:#8a6d3b;color:#fff;` +
    `text-decoration:none;border-radius:8px;font-weight:700">להעברת פדיון הכפרות</a></p>` +
    `<p style="margin:0 0 4px">גמר חתימה טובה,</p>` +
    `<p style="margin:0 0 18px"><strong>יעקב מאור</strong></p>` +
    `<p style="margin:0;color:#8a8378;font-size:13px">` +
    `כל ההסבר גם כאן: <a href="${PAGE}">${PAGE}</a></p>` +
    `</div>`
  );
}

// "ראובן" + "שרה" הוא לא "ראובן שרה" אלא "ראובן בן שרה".
// המגדר הוא שדה מפורש ולא נגזר משום דבר אחר - בשם של אדם אסור לנחש.
// אם הממלא כבר כתב "בן"/"בת" בשדה ההורה, לא מוסיפים פעמיים.
function fullName(n) {
  const parent = String(n.parent || "").trim();
  const name = String(n.name || "").trim();
  if (!parent) return name;
  if (/^(בן|בת|ב"ר|בר)\s/.test(parent)) return name + " " + parent;
  if (n.gender === "f") return name + " בת " + parent;
  if (n.gender === "m") return name + " בן " + parent;
  return name + " בן/בת " + parent;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
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

    const sender = String(d.sender || "").trim().slice(0, 120);
    const phone = String(d.phone || "").trim().slice(0, 40);
    const email = String(d.email || "").trim().slice(0, 160);
    const note = String(d.note || "").trim().slice(0, 800);

    // **שם ההורה איננו חובה, וזו החלטה ולא רשלנות.** יעקב הנחה שמילוי השמות
    // באתר "לא חובה אבל כדאי", ומי שאינו יודע את שם אמו של סבו לא אמור
    // להיחסם. חסר - יעקב רואה זאת מסומן במייל ומשלים בעצמו.
    const souls = (Array.isArray(d.souls) ? d.souls : [])
      .map((n) => ({
        name: String((n && n.name) || "").trim().slice(0, 120),
        parent: String((n && n.parent) || "").trim().slice(0, 120),
        gender: (n && n.gender) === "f" ? "f" : (n && n.gender) === "m" ? "m" : "",
      }))
      .filter((n) => n.name)
      .slice(0, MAX_SOULS);

    if (!souls.length) return new Response("no souls", { status: 400, headers });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return new Response("bad email", { status: 400, headers });

    const missing = souls.filter((n) => !n.parent).length;

    const rows = souls
      .map(
        (n, i) =>
          `<tr><td style="padding:5px 12px 5px 0;color:#8a8378;width:28px">${i + 1}</td>` +
          `<td style="padding:5px 0;color:#1c1a17;font-size:16px"><strong>${esc(fullName(n))}</strong>` +
          (n.parent ? "" : ` <span style="color:#c0392b;font-size:13px">(חסר שם הורה)</span>`) +
          `</td></tr>`
      )
      .join("");

    // הבלוק להעתקה הוא העיקר במייל הזה: הוא נבנה בפורמט שהגנרטור של
    // הפדיון קורא - שורת כותרת עם שם התורם, ומתחתיה שורה לכל שם.
    const plain =
      (sender || "ללא שם") + "\n" + souls.map((n) => fullName(n)).join("\n");

    const html =
      `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
      `<h2 style="margin:0 0 4px">פדיון כפרות - ${souls.length} שמות</h2>` +
      `<p style="margin:0 0 18px;color:#4a453e">נשלח מהטופס ב-<a href="${PAGE}">עמוד יום כיפור</a>.</p>` +
      (sender || phone || email
        ? `<p style="margin:0 0 14px">` +
          (sender ? `<strong>${esc(sender)}</strong>` : "") +
          (phone ? ` · ${esc(phone)}` : "") +
          (email ? ` · ${esc(email)}` : "") +
          `</p>`
        : "") +
      `<table style="border-collapse:collapse;margin:0 0 18px">${rows}</table>` +
      (missing
        ? `<p style="margin:0 0 14px;padding:10px 14px;background:#fdecea;` +
          `border-right:4px solid #c0392b;border-radius:6px">` +
          `<strong>${missing} שמות ללא שם הורה.</strong> להשלים לפני הפדיון.</p>`
        : "") +
      (note
        ? `<p style="margin:0 0 14px;padding:10px 14px;background:#faf7f0;` +
          `border-right:4px solid #c9ab77;border-radius:6px">${esc(note)}</p>`
        : "") +
      `<p style="margin:22px 0 6px;color:#4a453e">להעתקה ישירה לגנרטור:</p>` +
      `<pre style="margin:0;padding:12px 14px;background:#f6f3ec;border-radius:6px;` +
      `font-family:inherit;font-size:15px;white-space:pre-wrap">${esc(plain)}</pre>` +
      `<p style="margin:22px 0 0;color:#8a8378;font-size:13px">` +
      `הטופס אינו שומר את השמות בשום מקום. המייל הזה הוא הרשומה היחידה.</p>` +
      `</div>`;

    const ok = await sendMail(env, {
      to: TO,
      replyTo: email || REPLY_TO_OWNER,
      subject: `פדיון כפרות - ${souls.length} שמות${sender ? " מ" + sender : ""}`,
      html,
    });

    if (!ok) return new Response("mail failed", { status: 502, headers });

    // ההוראות חוזרות לממלא. **כישלון כאן לא מפיל את הבקשה** - הרשומה כבר
    // יצאה ליעקב, והשמות לא ילכו לאיבוד רק מפני שמייל האישור לא נשלח.
    let replySent = false;
    if (email) {
      try {
        replySent = await sendMail(env, {
          to: email,
          replyTo: REPLY_TO_OWNER,
          subject: "פדיון כפרות - השמות התקבלו, וכך עושים את הפדיון",
          html: instructionsHtml(),
        });
        if (!replySent) console.log("instructions mail failed for", email);
      } catch (e) {
        console.log("instructions mail threw", String(e).slice(0, 200));
      }
    }

    return new Response(JSON.stringify({ ok: true, count: souls.length, replySent }), {
      status: 200,
      headers: Object.assign({}, headers, {
        "Content-Type": "application/json; charset=utf-8",
      }),
    });
  },
};
