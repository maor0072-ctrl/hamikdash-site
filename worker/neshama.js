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
    `</table>`
  );
}

function thanksHtml(name, niftarim, isFix, isEmpty) {
  const list = niftarim
    .map((n) => `<li style="margin:4px 0">${esc(fullName(n))}</li>`)
    .join("");
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
    `<p>בכולל שלנו אברכים יושבים ולומדים כל יום. הלימוד של השבוע הקרוב יוקדש גם ` +
    `לעילוי נשמת יקירך, וייאמרו קדישים ואשכבות בתפילות. נר נשמה דולק כל השנה, ` +
    `בלי נדר.</p>` +
    `<p>אם משהו בפרטים לא מדויק, אפשר פשוט להשיב למייל הזה ונתקן.</p>` +
    `<hr style="border:0;border-top:1px solid #e5ddd0;margin:28px 0">` +
    `<p>מה שמחזיק את הכולל הוא אנשים שנותנים בקביעות. אם רצונך לקחת חלק, כל סכום עוזר, ` +
    `וכל שקל הולך ממש לקודש הקודשים.</p>` +
    `<p><a href="${KEVA}" style="background:#b08434;color:#fff;text-decoration:none;` +
    `padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">` +
    `להוראת קבע לכולל</a>` +
    `<a href="${DONATE}" style="color:#4a453e;text-decoration:underline;` +
    `display:inline-block;padding:12px 18px">או תרומה חד פעמית</a></p>` +
    `<p style="margin-top:28px">שתזכה לרוב נחת, ושתהיה שנה טובה ומבורכת לך ולכל בני משפחתך.</p>` +
    `<p>באהבה,<br>יעקב מאור<br>0528395189</p>` +
    `<p style="font-size:13px;color:#8a8478">${PAGE}</p>` +
    `</div>`
  );
}

const KV_KEY = "public-list";
const MAX_PUBLIC = 400; // תקרה להצגה; מעבר לזה הדף נהיה בלתי קריא

// הרשימה הפומבית מחזיקה **רק** את מה שמותר להופיע באתר: שם, שם ההורה,
// מגדר ותאריך. שם המבקש, הטלפון והמייל שלו לעולם לא נכנסים לכאן, כי הקובץ
// הזה מוגש לכל אדם באינטרנט.
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
async function appendPublic(env, list, ownerKey) {
  if (!env.NAMES) return;
  const cur = await readPublic(env);
  const kept = cur.filter((e) => e.owner !== ownerKey);
  const add = list.map((n) => Object.assign(publicEntry(n), { owner: ownerKey }));
  const next = kept.concat(add).slice(-MAX_PUBLIC);
  await env.NAMES.put(KV_KEY, JSON.stringify(next));
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
      await appendPublic(env, niftarim, await ownerHash(email));
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
