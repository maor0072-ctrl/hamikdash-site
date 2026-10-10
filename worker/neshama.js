// hamikdash-neshama - צד השרת של טופס עילוי הנשמות ב-hamikdash.co.il.
//
// זהו **הגל האפס** של מערכת היארצייטים: עמוד אחד וטופס, בלי מאגר, בלי
// אוטומציה ובלי מנוע תאריך עברי. הפנייה מגיעה ליעקב במייל והוא מטפל ידנית.
// המערכת המלאה מאופיינת ב-outputs/specs/2026-09-08-hamikdash-iluy-neshamot-draft.md
// ותחליף את זה אחרי החגים.
//
// המבנה זהה ל-worker/lead.js של reshimu.co.il ומאותה סיבה: האתר סטטי
// (GitHub Pages) ואין לו צד שרת. שום שירות טפסים חיצוני לא רואה את הפניות.
//
// הדואר יוצא דרך **ברבו** מ-info@hamikdash.co.il, וג'ימייל נשאר כגיבוי.
// BREVO_API_KEY ו-COMPOSIO_API_KEY מוזרקים כסודות ואינם נמצאים בקוד.
//
// **מה אסור להבטיח כאן:** תזכורת שנתית, שמירה במאגר, או כל דבר אוטומטי.
// אף אחד מהם עוד לא קיים. הטופס מבטיח רק את מה שהכולל עושה בפועל השבוע.

const ALLOWED = [
  "https://hamikdash.co.il",
  "https://www.hamikdash.co.il",
  "http://127.0.0.1:8903",
];
const TO = "maor0072@gmail.com";

// **הזהות השולחת היא המוסד, לא יעקב.** מייל אוטומטי שיוצא בשמו הפרטי גורם
// לאנשים לחשוב שהרב עונה להם אישית, וזו הבטחה שלא נאמרה. לכן השם והכתובת
// הם info@hamikdash.co.il, ולא חשבון הג'ימייל האישי.
const FROM_ADDR = "info@hamikdash.co.il";
const FROM_NAME = "info@hamikdash.co.il";
// תשובה של אדם שמשיב למייל צריכה בכל זאת להגיע ליעקב.
const REPLY_TO_OWNER = "maor0072@gmail.com";
const COMPOSIO_USER = "maor0072@gmail.com";
const GMAIL_ACCOUNT = "ca_NGVDA1Vrsmz0";

const DONATE = "https://nedar.im/7009579";
const KEVA =
  "https://www.matara.pro/nedarimplus/online/?mosad=7009579&KevaDefault=1";
const PAGE = "https://hamikdash.co.il/neshama.html";

const MAX_NIFTARIM = 5; // תקרה שפויה; מעבר לזה זו כנראה הזנה אוטומטית

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

// שליחה דרך ברבו מהדומיין שלנו. ג'ימייל נשאר כגיבוי בלבד: המייל ליעקב הוא
// **הרשומה** של הבקשה בגל אפס, ולכן אסור שכשל של ספק אחד יאבד אותה.
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

// "ראובן" + "ניסן" הוא לא "ראובן ניסן" אלא "ראובן בן ניסן".
// המגדר הוא **שדה חובה מפורש** ולא נגזר מהקרבה: "קרוב משפחה" ו"אחר" לא
// מסגירים מגדר, ובשם של נפטר אסור לנחש. אם המבקש כבר כתב "בן"/"בת" בשם
// ההורה, לא מוסיפים פעמיים.

function fullName(n) {
  const parent = String(n.parent || "").trim();
  const name = String(n.name || "").trim();
  if (!parent) return name;
  if (/^(בן|בת|ב"ר|בר)\s/.test(parent)) return name + " " + parent;
  if (n.gender === "f") return name + " בת " + parent;
  if (n.gender === "m") return name + " בן " + parent;
  return name + " " + parent; // בלי מגדר לא ממציאים
}

function niftarBlock(n, i) {
  return (
    `<table style="border-collapse:collapse;margin:0 0 16px">` +
    `<tr><td colspan="2" style="padding:0 0 6px;color:#b08434;font-weight:bold">נפטר ${i + 1}</td></tr>` +
    row("השם המלא", fullName(n)) +
    row("שם הנפטר", n.name) +
    row("שם ההורה", n.parent) +
    row("תאריך הפטירה", n.date) +
    row("שנת הפטירה", n.year) +
    row("קרבה למבקש", n.relation) +
    row("מין", n.gender === "f" ? "נקבה" : n.gender === "m" ? "זכר" : "לא צוין") +
    row("הערות המוסר", n.notes) +
    `</table>`
  );
}

function thanksHtml(name, niftarim, isFix, isEmpty) {
  // ההערה הפרטית מוצגת למוסר **מתחת לשם**, ובמכוון. היא נכתבה כדי שהוא
  // יזכור למי הוא עושה עילוי נשמה, ולכן מייל שמזכיר את השם בלי ההערה מחמיץ
  // בדיוק את מה שבשבילו היא נמסרה. באתר הגלוי היא אינה מופיעה.
  const list = niftarim
    .map((n) => `<li style="margin:4px 0">${esc(fullName(n))}` +
      (n.notes
        ? `<div style="font-size:14px;color:#6b655c;margin:2px 0 0">${esc(n.notes)}</div>`
        : "") + `</li>`)
    .join("");
  const h = (t) => `<p style="margin:22px 0 6px"><b>${t}</b></p>`;

  // ההסברים המלאים נשלחים **רק במסירה ראשונה**. מי שתיקן שם או הסיר שמות
  // כבר קיבל אותם, ולחזור עליהם בכל תיקון זה להציף אדם שעשה פעולה קטנה.
  const explain = isFix || isEmpty ? "" :
    h("אתם לא תצטרכו לזכור יותר.") +
    `<p>תאריך היארצייט נשמר אצלנו. בכל שנה מחדש, בשבוע שבו חל היארצייט, ` +
    `יגיע אליכם מייל שאומר מה התאריך ובאיזה יום הוא חל. בלי להמיר תאריכים, ` +
    `בלי לחפש ביומן, ובלי להסתמך על הזיכרון בשנה שבה קשה לזכור.</p>` +

    h("מה נעשה בפועל.") +
    `<p>בכולל שלנו יושבים אברכים ולומדים כל יום, שנה אחרי שנה. הלימוד של ` +
    `השבוע שבו חל היארצייט מוקדש גם לעילוי נשמת יקירכם, ונאמרים עליו קדישים ` +
    `ואשכבות בתפילות. נר נשמה גדול דולק אצלנו כל השנה, בלי נדר, לעילוי נשמת ` +
    `כל מי שנמסר לנו. מדי פעם אנחנו עורכים גם סיומי מסכת, סיומי זוהר או סיום ` +
    `שישה סדרי משנה. השם מופיע גם ברשימה הגלויה שבאתר באותו שבוע, כדי שכל מי ` +
    `שנכנס יוכל לומר עליו מילה.</p>` +

    h("שבוע שלם, ולא יום אחד.") +
    `<p>עילוי הנשמה אצלנו מתחיל בשבת שלפני היארצייט ונמשך עד סוף יום היארצייט ` +
    `עצמו. יארצייט שחל ביום חמישי, למשל, מתחיל אצלנו כבר בשבת הקודמת. יארצייט ` +
    `שחל בשבת, מתחיל בשבת שלפניה ונמשך עד מוצאי שבת היארצייט.</p>` +

    h("ואם התאריך של השנה הזאת כבר עבר.") +
    `<p>לימוד תורה, תפילה וצדקה מועילים לנשמה בכל יום בשנה, ולא רק ביום ` +
    `היארצייט. השם נכנס לרשימה כבר עכשיו, הלימוד מוקדש בשבוע הקרוב, וממילא ` +
    `אתם רשומים לשנה הבאה מבעוד מועד ולא תפספסו שוב.</p>` +

    h("אם הפרטים לא מדויקים.") +
    `<p>תאריך לועזי מלא מתקבל בדיוק כמו עברי ואנחנו נמיר אותו. אם אתם זוכרים ` +
    `רק חודש או רק שנה, כתבו מה שאתם יודעים ונסתדר. שם שנמסר עם פרט חסר עדיף ` +
    `פי כמה על שם שלא נמסר. אפשר להשיב למייל הזה ונתקן, ואפשר להוסיף או לשנות ` +
    `שמות בכל עת דרך האתר.</p>` +
    `<p>ואם הנפטר בתוך השנה הראשונה לפטירתו ולא מסרתם את שנת הפטירה, כדאי ` +
    `להוסיף אותה: כך שמו יישאר כל השנה ברשימת עילוי הנשמות, ולא רק בשבוע ` +
    `היארצייט.</p>` +

    h("וזה חלק ממשהו גדול יותר.") +
    `<p>עילוי הנשמות הוא חלק מפרויקט "שמע, רפא ומשאלות" - אמירת שמע ישראל ` +
    `בחצות, שמות לברכה ולרפואה, בקשת משאלות וחלוקת ספר התהילים. כל מה שנעשה ` +
    `שם, לרבות קריאת התהילים, נזקף לעילוי נשמת הנפטרים של אותו השבוע.</p>`;

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
    `<p style="margin-top:28px">שתזכו לרוב נחת, ולכל הברכות והישועות.</p>` +
    `<p>באהבה,<br>יעקב מאור<br>0528395189</p>` +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

const KV_KEY = "public-list";
// **זו תקרת מחיקה, לא תקרת תצוגה, וחשוב לדעת את זה לפני שנוגעים בה.**
// `slice(-MAX_PUBLIC)` רץ בכל כתיבה, ולכן מעבר לתקרה כל מסירה חדשה מוחקת
// בשקט את הרשומה הוותיקה ביותר - והרשימה הזאת היא המקור שממנו נבנים חלון
// השבוע באתר, תזכורת יום חמישי והדוח השבועי. שם שנופל ממנה מפסיק לקבל
// יארצייט, בלי שגיאה ובלי יומן. הנימוק הישן („הדף נהיה בלתי קריא") לא היה
// נכון מעולם: הדף קורא `/data/neshama-week.json` שכבר מסונן לשבוע.
//
// **מה שבאמת קובע את המספר הוא תקציב המעבד, לא אחסון ולא כסף.** אחסון ב-KV
// חינמי עד ג׳יגה ועד 25 מ״ב לערך, ו-5,000 רשומות הן כחצי מגה. אבל התוכנית
// החינמית של Workers נותנת **10 מילישניות מעבד להרצה**, ו-`appendPublic`
// עושה parse, filter ו-stringify על כל הרשימה בכל מסירה. נמדד (11.10.2026):
// 1,000 רשומות ≈ 1.4 מ״ש · 5,000 ≈ 6 מ״ש · 10,000 ≈ 12 מ״ש, כלומר מעל
// התקרה · 50,000 ≈ 61 מ״ש. ומכיוון שהעיבוד הזה הוא רק חלק מההרצה, 5,000
// הוא המספר שמשאיר מרווח אמיתי. מעבר לו נדרשת תוכנית בתשלום ($5 לחודש,
// 30 שניות מעבד) ועדיף גם מבנה אחר - מפתח לרשומה או D1 - ולא בלוב אחד.
const MAX_PUBLIC = 5000;

// הרשימה הפומבית מחזיקה **רק** את מה שמותר להופיע באתר: שם, שם ההורה,
// מגדר ותאריך. שם המבקש, הטלפון והמייל שלו לעולם לא נכנסים לכאן, כי הקובץ
// הזה מוגש לכל אדם באינטרנט.
// **ושדה `notes` אינו נכנס לכאן, בכוונה ובהוראת יעקב (10.10.2026).** ההערה
// נכתבת כדי שהמוסר יזכה לזכור למי הוא עושה עילוי נשמה - "ניצול שואה שהכרתי,
// אין לו משפחה" - והיא פרטית לו: היא מופיעה בטופס שלו ובמיילים שנשלחים אליו,
// ולעולם לא בטבלה הגלויה באתר.
function publicEntry(n) {
  return { name: n.name, parent: n.parent, gender: n.gender,
           date: n.date, year: n.year };
}

async function readPublic(env) {
  if (!env.NAMES) return [];
  const raw = await env.NAMES.get(KV_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

// KV הוא eventually consistent ואין בו טרנזקציות. שתי הגשות באותה שנייה
// יכולות לדרוס זו את זו. בהיקף של עשרות שמות בשבוע זה לא מעשי לדאוג לזה,
// והמייל ליעקב הוא ממילא הרשומה הקובעת - הרשימה הפומבית היא תצוגה.
// **הגשה רגילה מצטברת; רק תיקון מחליף.** ההנחה ההפוכה הייתה כאן מההתחלה,
// והיא מחקה בשקט 17 שמות ויארצייט אחד (אברהם בן יהושע, כ״ד תשרי, 5.10.2026):
// אדם שמסר מנה שנייה - וזה בדיוק מה שאנשים עושים - איבד את הראשונה, קיבל
// מייל אישור, ולא הייתה לו שום סיבה לחשוד. הלוגיקה כאן זהה ל-`merged_by_person`
// ב-scripts/neshama_restore_from_mail.py, שכבר שוחזר ואומת מולה.
async function appendPublic(env, list, ownerKey, isFix) {
  if (!env.NAMES) return;
  const cur = await readPublic(env);
  const add = list.map((n) => Object.assign(publicEntry(n), { owner: ownerKey }));
  if (isFix) {
    const others = cur.filter((e) => e.owner !== ownerKey);
    await env.NAMES.put(KV_KEY, JSON.stringify(others.concat(add).slice(-MAX_PUBLIC)));
    return;
  }
  // מסירה חוזרת של שם שכבר ברשימה אינה מוסיפה אותו פעמיים.
  const key = (e) => [e.name, e.parent, e.date].join("|");
  const seen = new Set(cur.filter((e) => e.owner === ownerKey).map(key));
  const fresh = add.filter((e) => !seen.has(key(e)));
  await env.NAMES.put(KV_KEY, JSON.stringify(cur.concat(fresh).slice(-MAX_PUBLIC)));
}

// רשומת המוסר, פרטית לחלוטין. היא **לא** מוגשת באף מסלול GET - השם, הטלפון
// והמייל חיים כאן רק כדי שהדוח השבועי ליעקב יראה מי מסר כל שם, וכדי שנוכל
// לשלוח למוסר עצמו תזכורת ביום חמישי שלפני היארצייט. הוחלט 2026-09-22.
// עד לתאריך הזה הזהות לא נשמרה בכלל, ולכן שמות ישנים יופיעו בדוח בלי מוסר.
// אותו כלל כמו ברשימה הפומבית, ומאותה סיבה: `souls` כאן הוא מה שתזכורת
// יום חמישי שולחת למוסר. אם הוא מוחלף במנה האחרונה, התזכורת מציגה לאדם
// פחות שמות ממה שמסר - כלומר הבאג היה נשאר חי גם אחרי תיקון הדף.
async function saveSubmitter(env, ownerKey, data, isFix) {
  if (!env.NAMES) return;
  const prev = await env.NAMES.get("sub:" + ownerKey);
  // גיבוי לפני כל דריסה, ולא רק בתיקון. בטופס הזה הגשה חוזרת כבר דרסה
  // הגשה קודמת ואבדו 17 שמות ויארצייט אחד; מסלול התיקון הפתוח למוסר חוזר
  // מכפיל את הסיכוי לזה, ולכן הגיבוי אינו אופציונלי. נשמר שנה.
  if (prev) {
    try {
      await env.NAMES.put(
        "bak:" + ownerKey + ":" + new Date().toISOString().replace(/[:.]/g, "-"),
        prev,
        { expirationTtl: 60 * 60 * 24 * 365 }
      );
    } catch (e) {
      console.log("sub backup failed", String(e).slice(0, 200));
    }
  }
  if (!isFix) {
    if (prev) {
      try {
        const old = JSON.parse(prev) || {};
        const key = (s) => [s.name, s.parent, s.date].join("|");
        const seen = new Set((data.souls || []).map(key));
        const keep = (old.souls || []).filter((s) => !seen.has(key(s)));
        data = Object.assign({}, data, { souls: keep.concat(data.souls || []) });
      } catch (e) {
        console.log("sub merge failed", String(e).slice(0, 200));
      }
    }
  }
  await env.NAMES.put("sub:" + ownerKey, JSON.stringify(data));
}

// מפתח בעלות אנונימי: גיבוב של המייל, כדי שתיקון יחליף את השמות של אותו
// אדם ולא יכפיל אותם - בלי לשמור את המייל עצמו בקובץ הפומבי.
async function ownerHash(email) {
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode("hamikdash:" + email.toLowerCase()));
  return Array.from(new Uint8Array(buf)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    // GET /?list=public - הרשימה שכל המבקרים רואים.
    if (request.method === "GET") {
      const url = new URL(request.url);
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

    // זיהוי מוסר חוזר. מוחזרים **השמות בלבד** - לא השם, לא הטלפון ולא המייל
    // של המוסר. ההחלטה מ-22.9, שהרשומה הפרטית אינה מוגשת החוצה, נשמרת: מי
    // שמקליד כתובת של אדם אחר לא רואה את פרטיו, ואת מה שהוא כן רואה - השמות -
    // הוא ממילא רואה ברשימה הפומבית באתר. מסלול POST ולא GET בכוונה, כדי
    // שהכתובת לא תישמר בהיסטוריית הדפדפן, ב-Referer או במטמון.
    if (d.kind === "lookup") {
      const em = String(d.email || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))
        return new Response("bad email", { status: 400, headers });
      let souls = [];
      try {
        const ownerKey = await ownerHash(em);
        const raw = env.NAMES ? await env.NAMES.get("sub:" + ownerKey) : null;
        let removed = false;
        if (raw) {
          const rec = JSON.parse(raw) || {};
          // רשומה שהמוסר ביקש להסיר חוזרת ריקה. הוא הסיר אותה בכוונה,
          // ואין להחיות אותה מאחורי גבו.
          removed = !!rec.removed;
          if (!removed)
            souls = (rec.souls || []).map((x) => ({
              name: x.name || "",
              parent: x.parent || "",
              date: x.date || "",
              relation: x.relation || "",
              gender: x.gender || "",
              year: x.year || "",
              // ההערה הפרטית מוחזרת כאן **בכוונה**: מסלול הזיהוי הוא מה
              // שממלא את מסך העריכה, ואם ההערה לא תחזור היא תימחק ברגע
              // שהמוסר יתקן שם אחר. היא אינה בכלל הרשימה הפומבית.
              notes: x.notes || "",
            }));
        }
        // ואיחוד עם הרשימה הפומבית לפי אותו מפתח בעלות. `souls` נכתב רק
        // מהטופס ורק מ-22.9.2026, ואילו הרשימה הפומבית מכילה גם שמות
        // שנטענו ידנית, שנמסרו לפני התאריך הזה או ששוחזרו מהדואר. בלי
        // האיחוד הזה בעל 94 שמות ברשימה הפומבית ראה בטופס אפס - נמדד
        // 10.10.2026 על הרשומה של יעקב עצמו.
        if (!removed) {
          const key = (x) => [x.name, x.parent, x.date].join("|");
          const seen = new Set(souls.map(key));
          for (const x of await readPublic(env)) {
            if (x.owner !== ownerKey || seen.has(key(x))) continue;
            seen.add(key(x));
            souls.push({
              name: x.name || "",
              parent: x.parent || "",
              date: x.date || "",
              relation: x.relation || "",
              gender: x.gender || "",
              year: x.year || "",
              notes: "", // הרשימה הפומבית אינה מחזיקה הערות, ולכן אין מה לשחזר
            });
          }
        }
      } catch (e) {
        console.log("lookup failed", String(e).slice(0, 200));
      }
      return new Response(JSON.stringify({ souls }), {
        status: 200,
        headers: Object.assign({}, headers, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        }),
      });
    }

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

    const niftarim = (Array.isArray(d.niftarim) ? d.niftarim : [])
      .map((n) => ({
        name: String((n && n.name) || "").trim(),
        parent: String((n && n.parent) || "").trim(),
        date: String((n && n.date) || "").trim(),
        relation: String((n && n.relation) || "").trim(),
        gender: (n && n.gender) === "f" ? "f" : (n && n.gender) === "m" ? "m" : "",
        // שנת הפטירה, לא חובה. היא מה שיאפשר בגל 1 להציג שם **כל השנה
        // הראשונה** ולא רק בשבוע היארצייט. נאספת כבר עכשיו כדי שלא נאבד
        // אותה ממי שמוסר בימים האלה.
        year: String((n && n.year) || "").trim().slice(0, 30),
        // הערה חופשית קצרה של המוסר על הנפטר הזה, לא חובה (יעקב, 10.10.2026).
        // "ניצול שואה שהכרתי, אין לו משפחה" - מה שמאפשר לאדם לזכור בשנה הבאה
        // למי הוא עושה עילוי נשמה. פרטית לו: במיילים אליו כן, בטבלה הגלויה לא.
        notes: String((n && n.notes) || "").trim().slice(0, 400),
      }))
      .filter((n) => n.name)
      .slice(0, MAX_NIFTARIM);

    // רשימה ריקה **בתיקון** היא בקשת הסרה מפורשת, לא טופס פגום. אדם
    // שמבקש להסיר שם חייב לקבל את זה בלחיצה אחת, בלי מכשולים.
    const isFix = d.kind === "correction";
    if (!niftarim.length && !isFix)
      return new Response("no niftarim", { status: 400, headers });
    for (const n of niftarim) {
      if (!n.parent || !n.date || !n.relation || !n.gender)
        return new Response("incomplete niftar", { status: 400, headers });
    }

    // ההודעה ליעקב היא העיקר כאן ולכן היא נשלחת ראשונה. בגל האפס אין מאגר,
    // אז המייל הזה **הוא** הרשומה - אם הוא נכשל הבקשה אבודה, ולכן הכישלון
    // שלו מחזיר 502 והמבקש רואה שגיאה במקום אישור שקרי.
    // תיקון הוא לא בקשה חדשה. הוא חייב להיראות אחרת בתיבה, אחרת יעקב יוסיף
    // את השמות פעם שנייה במקום להחליף את הקודמים.
    const isEmpty = isFix && !niftarim.length;
    const notice =
      `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7">` +
      (isEmpty
        ? `<h2 style="margin:0 0 4px;color:#c0392b">בקשת הסרה</h2>` +
          `<p style="margin:0 0 18px;padding:10px 14px;background:#fdecea;` +
          `border-right:4px solid #c0392b;border-radius:6px">` +
          `<strong>האדם הזה ביקש להסיר את כל השמות שמסר.</strong> ` +
          `להוריד אותם מרשימת הכולל.</p>`
        : isFix
        ? `<h2 style="margin:0 0 4px;color:#b08434">תיקון לשמות שכבר נמסרו</h2>` +
          `<p style="margin:0 0 18px;padding:10px 14px;background:#fdf6e6;` +
          `border-right:4px solid #b08434;border-radius:6px">` +
          `<strong>הרשימה הזאת מחליפה את מה שהאדם הזה מסר קודם.</strong> ` +
          `לא להוסיף - להחליף.</p>`
        : `<h2 style="margin:0 0 4px">בקשה חדשה לעילוי נשמה</h2>`) +
      `<p style="margin:0 0 18px;color:#8a8478;font-size:13px">` +
      `${niftarim.length} נפטרים · מהטופס ב-hamikdash.co.il</p>` +
      `<table style="border-collapse:collapse;margin-bottom:20px">` +
      row("שם המבקש", d.name) +
      row("טלפון", d.phone) +
      row("דוא\"ל", email) +
      `</table>` +
      niftarim.map(niftarBlock).join("") +
      (d.note
        ? `<p style="margin:18px 0 6px;color:#4a453e">הערה מהמבקש:</p>` +
          `<div style="background:#f3ece0;border-right:4px solid #b08434;padding:14px 18px;` +
          `border-radius:8px;white-space:pre-wrap">${esc(d.note)}</div>`
        : "") +
      `</div>`;

    const okNotice = await sendMail(
      env,
      ({
        to: TO,
        replyTo: email,
        subject: (isEmpty ? "הסרת שמות: " : isFix ? "תיקון עילוי נשמה: " :
                  "עילוי נשמה: ") + `${d.name} (${niftarim.length})`,
        html: notice,
      })
    );
    if (!okNotice) return new Response("send failed", { status: 502, headers });

    // רק אחרי שהמייל ליעקב יצא בהצלחה השמות עולים לרשימה הפומבית.
    // הסדר הזה מכוון: שם שמופיע באתר ולא הגיע ליעקב הוא הבטחה ריקה.
    // הערה למי שיבדוק את זה בעתיד: כתיבה ל-KV מתפשטת עד כדקה. בדיקה
    // שקוראת מיד אחרי POST תראה את הערך הישן, וזה לא באג.
    try {
      const ownerKey = await ownerHash(email);
      await appendPublic(env, niftarim, ownerKey, isFix);
      await saveSubmitter(env, ownerKey, {
        sender: String(d.name).trim().slice(0, 120),
        phone: digits,
        email: email.toLowerCase(),
        souls: niftarim,
        removed: isEmpty,
        updated: new Date().toISOString(),
      }, isFix);
    } catch (e) {
      console.log('kv append failed', String(e).slice(0, 200));
    }

    // אישור למבקש. נכשל? הבקשה כבר אצל יעקב, אז לא מפילים את הפנייה.
    await sendMail(
      env,
      ({
        to: email,
        replyTo: REPLY_TO_OWNER,
        subject: isEmpty ? "השמות הוסרו"
               : isFix ? "התיקון התקבל" : "קיבלנו את השמות לעילוי נשמה",
        html: thanksHtml(d.name, niftarim, isFix, isEmpty),
      })
    );

    return new Response("ok", { status: 200, headers });
  },
};
