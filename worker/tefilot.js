// hamikdash-tefilot - צד השרת של דף „תפילות ושירותים" ב-hamikdash.co.il.
//
// זה **שירות ולא דף צומת**, בהכרעת יעקב מ-12.10.2026 שהפכה את ההמלצה: הדף
// נבנה „ממש כמו דף עילוי נשמות, אבל עם תכנים אחרים. גם כאן מוסרים שמות,
// באותו אופן". בפועל הבסיס הוא worker/refua.js ולא neshama.js, כי מודל
// הנתונים כאן הוא שם בלי תאריך, בדיוק כמו ברפואה, ולא שם עם יארצייט.
//
// מה שונה מרפואה, וזה כל ההבדל:
//
// 1. **שדה `request` - הבקשה.** זה מה שהמוסר מבקש שיתפללו עליו: פרנסה, זרע
//    של קיימא, שלום בית, שידוך. השדה הוא טקסט חופשי עד 1500 תווים.
// 2. **הבקשה פרטית, והפרטיות הזאת היא תנאי ולא העדפה.** `publicEntry`
//    מחזיר שם, שם הורה ומין בלבד, ולכן הבקשה אינה מגיעה לרשימה הפומבית
//    בשום מסלול. מי שכותב „שלום בית" לא העלה בדעתו שזה יוצג באתר. **אין
//    להוסיף את `request` ל-publicEntry בלי הכרעת בעלים מפורשת.**
// 3. **„עצמי" הוא אפשרות הקרבה הראשונה.** בבקשה כללית רוב המוסרים מבקשים
//    על עצמם, בשונה מרפואה ומעילוי נשמה.
//
// מה שזהה לרפואה בכוונה: אין תאריך ואין חלון שבועי, השם נשאר ברשימה עד
// שהמוסר מוציא אותו, וההסרה היא קישור חתום בלחיצה אחת בלי טופס.
//
// הדואר יוצא דרך **ברבו** מ-info@hamikdash.co.il, וג'ימייל נשאר כגיבוי.
// BREVO_API_KEY, COMPOSIO_API_KEY ו-TEFILOT_TOKEN_SECRET מוזרקים כסודות.
//
// **מה אסור להבטיח כאן:** תזכורת תקופתית למוסר, או כל דבר אוטומטי שעוד לא
// נבנה. הטופס מבטיח רק את מה שהכולל, התהילים ושמע בחצות עושים בפועל.
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
const PAGE = "https://hamikdash.co.il/tefilot/";
// 09.10.2026: קישור ההסרה נשלח במייל, ולכן הוא חייב להיות בדומיין שלנו
// ולא ב-workers.dev - מי שהרשת שלו חוסמת את workers.dev לא יכול היה
// למסור שם, ולא יוכל גם להסיר אותו. הכתובת הישנה ממשיכה לענות, ולכן
// קישורים שיצאו במיילים קודמים לא נשברים.
const SELF = "https://tefilot.hamikdash.co.il";

const MAX_BAKASHOT = 5; // תקרה שפויה; מעבר לזה זו כנראה הזנה אוטומטית

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
// המגדר הוא **שדה חובה מפורש** ולא נגזר מהקרבה, וההורה הוא האם או האב לבחירת המוסר.
function fullName(n) {
  const parent = String(n.parent || "").trim();
  const name = String(n.name || "").trim();
  if (!parent) return name;
  if (/^(בן|בת|ב"ר|בר)\s/.test(parent)) return name + " " + parent;
  if (n.gender === "f") return name + " בת " + parent;
  if (n.gender === "m") return name + " בן " + parent;
  return name + " " + parent; // בלי מגדר לא ממציאים
}

function bakashaBlock(n, i) {
  return (
    `<table style="border-collapse:collapse;margin:0 0 16px">` +
    `<tr><td colspan="2" style="padding:0 0 6px;color:#b08434;font-weight:bold">שם ${i + 1}</td></tr>` +
    row("השם המלא", fullName(n)) +
    row("השם", n.name) +
    row("שם האם או האב", n.parent) +
    row("קרבה למבקש", n.relation) +
    row("מין", n.gender === "f" ? "נקבה" : n.gender === "m" ? "זכר" : "לא צוין") +
    row("הבקשה", n.request || "לא נכתבה") +
    `</table>`
  );
}

function ownerNoticeHtml(req, bakashot, isFix, isEmpty) {
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">` +
    `<p><b>${isEmpty ? "בקשת הסרה" : isFix ? "תיקון רשימה" : "שם ובקשה חדשים לתפילה"}</b></p>` +
    `<table style="border-collapse:collapse;margin:0 0 20px">` +
    row("המבקש", req.name) + row("טלפון", req.phone) + row("מייל", req.email) +
    `</table>` +
    (isEmpty
      ? `<p>המבקש ביקש להסיר את כל השמות שמסר.</p>`
      : bakashot.map(bakashaBlock).join("")) +
    (isFix && !isEmpty
      ? `<p><b>זהו תיקון.</b> הרשימה הזאת מחליפה את הקודמת של אותו מבקש, ואינה נוספת עליה.</p>`
      : "") +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

function thanksHtml(name, bakashot, isFix, isEmpty, removeUrl) {
  const list = bakashot
    .map((n) => `<li style="margin:4px 0">${esc(fullName(n))}</li>`)
    .join("");
  const h = (t) => `<p style="margin:22px 0 6px"><b>${t}</b></p>`;

  // ההסברים המלאים נשלחים **רק במסירה ראשונה**. מי שתיקן שם או הסיר שמות
  // כבר קיבל אותם, ולחזור עליהם בכל תיקון זה להציף אדם שעשה פעולה קטנה.
  const explain = isFix || isEmpty ? "" :
    h("מה עומד מאחורי הבקשה שלכם.") +
    `<p>בכולל שלנו יושבים אברכים ולומדים כל יום, שנה אחרי שנה. השם שמסרתם עומד ` +
    `לפניהם, נאמר בתפילות ובעת פתיחת ההיכל, והלימוד של אותם ימים מכוון גם לכך ` +
    `שהבקשה שנמסרה איתו תתקבל.</p>` +

    h("ולא רק הכולל.") +
    `<p>בפרויקט תהילים ישראל אומרים המוני אנשים את ספר התהילים כולו, שוב ושוב, ` +
    `וכל ספר שנסגר נסגר גם על השמות שברשימה. בפרויקט שמע בחצות יש שותפים שקמים ` +
    `בחצות הלילה, בשעה שהיא עת רצון, וגם הם אומרים את השמות. כל זה מצטרף לאותו ` +
    `דבר אחד: שהבקשה שלכם תתקבל.</p>` +

    h("מה שכתבתם בבקשה נשאר אצלנו.") +
    `<p>הבקשה עצמה הגיעה אלינו במייל ואינה עולה לשום רשימה גלויה, לא באתר ולא ` +
    `בשום מקום אחר. ברשימה הגלויה שבדף עומד השם בלבד, כדי שכל מי שנכנס יוכל ` +
    `לומר עליו מילה או פרק תהילים.</p>` +

    h("זה נשאר ברשימה, ולא פג בשבוע.") +
    `<p>אין כאן תאריך שפג ואין צורך למסור שוב. השם נשאר ברשימה כל עוד הוא ` +
    `נחוץ, ואתם מחליטים מתי להוציא אותו.</p>` +

    h("וכשתבוא הישועה.") +
    `<p>ברגע שתגיע הבשורה הטובה, בבקשה הודיעו לנו - בלחיצה אחת על הקישור ` +
    `שבתחתית המייל הזה, או בתשובה למייל. אנחנו רוצים לדעת, ורשימה מעודכנת ` +
    `היא גם תפילה מכוונת יותר.</p>` +

    h("אם הפרטים לא מדויקים.") +
    `<p>אם השם הכתוב אינו השם שקוראים בו, או שנפלה טעות באחד הפרטים, אפשר ` +
    `להשיב למייל הזה ונתקן, ואפשר לשנות בכל עת דרך האתר. שם שנמסר עם פרט ` +
    `חסר עדיף פי כמה על שם שלא נמסר.</p>`;

  const removeLine = removeUrl && !isEmpty
    ? `<p style="font-size:14px;color:#4a453e">התקבלה הבקשה ברוך השם, או שאין צורך יותר? ` +
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
      : `<p>קיבלנו את בקשתך, והשמות והבקשות נמסרו לאברכי הכולל.</p>`) +
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
    `<p style="margin-top:28px">שתזכו לבשורות טובות, ושהבקשה תתקבל במהרה.</p>` +
    `<p>באהבה,<br>יעקב מאור<br>0528395189</p>` +
    removeLine +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

const KV_KEY = "public-list";
// **תקרת מחיקה, לא תקרת תצוגה.** `slice(-MAX_PUBLIC)` רץ בכל כתיבה, ולכן
// מעבר לתקרה כל מסירה חדשה מוחקת בשקט את הרשומה הוותיקה ביותר - בלי שגיאה
// ובלי יומן. הנימוק הישן („הדף נהיה בלתי קריא") לא היה נכון: הדף קורא קובץ
// שכבר מסונן. מה שקובע את המספר הוא תקציב המעבד של התוכנית החינמית (10
// מילישניות להרצה), לא אחסון ולא כסף. נמדד 11.10.2026: 1,000 רשומות ≈ 1.4
// מ״ש · 5,000 ≈ 6 מ״ש · 10,000 ≈ 12 מ״ש, כלומר מעל התקרה. ההסבר המלא בראש
// `worker/neshama.js`, ושלושת הוורקרים מחזיקים את אותו מספר בכוונה.
const MAX_PUBLIC = 5000;

// הרשימה הפומבית מחזיקה **רק** את מה שמותר להופיע באתר: שם, שם ההורה ומגדר.
// שם המבקש, הטלפון והמייל שלו לעולם לא נכנסים לכאן, כי הקובץ הזה מוגש לכל
// אדם באינטרנט. גם הקרבה לא נכנסת - "אשתי" מזהה את המוסר.
function publicEntry(n) {
  return { name: n.name, parent: n.parent, gender: n.gender };
}

async function readPublic(env) {
  if (!env.TEFILOT) return [];
  const raw = await env.TEFILOT.get(KV_KEY);
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
  if (!env.TEFILOT) return;
  const cur = await readPublic(env);
  const add = list.map((n) => Object.assign(publicEntry(n), { owner: ownerKey }));
  if (isFix) {
    const others = cur.filter((e) => e.owner !== ownerKey);
    await env.TEFILOT.put(KV_KEY, JSON.stringify(others.concat(add).slice(-MAX_PUBLIC)));
    return;
  }
  // מסירה חוזרת של אותו שם אינה מוסיפה אותו פעמיים. אין כאן תאריך, ולכן
  // המפתח הוא השם ושם ההורה בלבד.
  const key = (e) => [e.name, e.parent].join("|");
  const seen = new Set(cur.filter((e) => e.owner === ownerKey).map(key));
  const fresh = add.filter((e) => !seen.has(key(e)));
  await env.TEFILOT.put(KV_KEY, JSON.stringify(cur.concat(fresh).slice(-MAX_PUBLIC)));
}

// רשומת המוסר, פרטית לחלוטין. היא **לא** מוגשת באף מסלול GET. `ts` נשמר
// כדי שבהמשך נוכל לשאול את המוסר אם השם עוד נחוץ; אין על זה שום הבטחה
// באתר ולא במייל עד שהמנגנון באמת ירוץ.
//
// `bakashot` כאן מצטבר בדיוק כמו הרשימה הפומבית, ומאותה סיבה: זו הרשימה
// שמייל החידוש החודשי ישלח למוסר, ומנה שמוחקת את קודמותיה הייתה מציגה
// לאדם פחות שמות ממה שמסר.
async function saveSubmitter(env, ownerKey, data, isFix) {
  if (!env.TEFILOT) return;
  if (!isFix) {
    const prev = await env.TEFILOT.get("sub:" + ownerKey);
    if (prev) {
      try {
        const old = JSON.parse(prev) || {};
        const key = (s) => [s.name, s.parent].join("|");
        const seen = new Set((data.bakashot || []).map(key));
        const keep = (old.bakashot || []).filter((s) => !seen.has(key(s)));
        data = Object.assign({}, data, { bakashot: keep.concat(data.bakashot || []) });
      } catch (e) {
        console.log("sub merge failed", String(e).slice(0, 200));
      }
    }
  }
  data.count = (data.bakashot || []).length;
  await env.TEFILOT.put("sub:" + ownerKey, JSON.stringify(data));
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
  if (!env.TEFILOT_TOKEN_SECRET) return "";
  const sig = await hmac(env.TEFILOT_TOKEN_SECRET, ownerKey);
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
        if (!o || !s || !env.TEFILOT_TOKEN_SECRET)
          return removePage("הקישור אינו תקין", bad);
        if ((await hmac(env.TEFILOT_TOKEN_SECRET, o)) !== s)
          return removePage("הקישור אינו תקין", bad);
        const before = await readPublic(env);
        const kept = before.filter((e) => e.owner !== o);
        if (kept.length !== before.length) await env.TEFILOT.put(KV_KEY, JSON.stringify(kept));
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

    const bakashot = (Array.isArray(d.bakashot) ? d.bakashot : [])
      .map((n) => ({
        name: String((n && n.name) || "").trim().slice(0, 120),
        parent: String((n && n.parent) || "").trim().slice(0, 120),
        relation: String((n && n.relation) || "").trim().slice(0, 80),
        gender: (n && n.gender) === "f" ? "f" : (n && n.gender) === "m" ? "m" : "",
        // **הבקשה היא השדה הפרטי של הדף הזה.** היא נשמרת ברשומה הפרטית של
        // המוסר ונשלחת במייל ליעקב, ו-publicEntry **אינו מחזיר אותה** - לכן
        // היא לעולם אינה מגיעה לרשימה הפומבית. מי שמבקש על שלום בית או על
        // זרע של קיימא לא העלה בדעתו שזה יוצג באתר, ואין לשנות את זה כאן
        // בלי הכרעת בעלים מפורשת.
        request: String((n && n.request) || "").trim().slice(0, 1500),
      }))
      .filter((n) => n.name)
      .slice(0, MAX_BAKASHOT);

    // רשימה ריקה **בתיקון** היא בקשת הסרה מפורשת, לא טופס פגום.
    const isFix = d.kind === "correction";
    if (!bakashot.length && !isFix)
      return new Response("no bakashot", { status: 400, headers });
    for (const n of bakashot) {
      if (!n.parent || !n.relation || !n.gender)
        return new Response("incomplete bakasha", { status: 400, headers });
    }

    const isEmpty = isFix && !bakashot.length;
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
        `${req.name}${isEmpty ? "" : " (" + bakashot.length + ")"}`,
      html: ownerNoticeHtml(req, bakashot, isFix, isEmpty),
    });
    if (!okNotice) return new Response("send failed", { status: 502, headers });

    const ownerKey = await ownerHash(req.email);
    try {
      await writePublic(env, ownerKey, bakashot, isFix);
      await saveSubmitter(env, ownerKey, Object.assign({}, req, {
        bakashot: bakashot,
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
      html: thanksHtml(req.name, bakashot, isFix, isEmpty, await removeUrlFor(env, ownerKey)),
    });

    return new Response("ok", { status: 200, headers });
  },
};
