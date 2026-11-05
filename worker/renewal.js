// renewal.js - מודול משותף לשני הוורקרים של „רפואה ושאר משאלות" (refua.js ו-tefilot.js).
//
// שני דברים כאן, ושניהם נבנו ב-5.11.2026:
//
// א. **קישור עריכה אישי חתום.** עד היום „שינוי שמות שמסרת" עבד רק במכשיר שממנו
//    נמסרו השמות, כי הטופס נשען על הזיכרון המקומי. הקישור במייל נושא את מפתח
//    הבעלות וחתימה (אותה שיטה כמו קישור ההסרה, עם מחרוזת אחרת לחתימה כדי שקישור
//    אחד לא ישמש לפעולה של אחר), והדף שולף ממנו את השמות מהשרת בכל מכשיר.
//
// ב. **מייל החידוש החודשי** - הכרעת יעקב מ-7.10.2026 (י1, automations/active-work.md):
//    „כן, להשאיר" / „לא, להסיר" עם שדה סיבה. סיבת רפואה -> מייל שמח „ברוך שומע
//    תפילה" עם אפשרויות תרומה. סיבת פטירה -> מייל תנחומים והפניה לדף עילוי הנשמה,
//    כששם הנפטר ושם ההורה כבר ממולאים בטופס.
//    **מי שלא ענה - לא מחליטים עליו דבר.** השמות נשארים ושואלים שוב בעוד חודש.
//
// שלושה שומרים, וכולם בתוך הוורקר ולא בזיכרון של מי שמפעיל:
//   1. **מתג שליחה כבוי כברירת מחדל.** שולחים רק אם בקובץ ה-KV של הוורקר יש
//      cfg:renewal-send = "on" (או משתנה הסביבה RENEWAL_SEND = "on"). כבוי - הקרון
//      רק רושם ב-renewal-dry-latest למי היה שולח, ולא מסמן ששאל.
//   2. **חלון שקט מחמיר.** אותה טבלת שבתות וימים טובים של תהילים ישראל
//      (tehillim-quiet.js, נוצרת ב-scripts/gen_tehillim_quiet_windows.py, עד 2032):
//      כניסה מוקדמת ביותר ויציאה לפי רבנו תם המאוחרת ביותר בכל הארץ. בנוסף:
//      לא שולחים שלוש שעות לפני כניסת חלון, ולא בלילה (רק 05:00-18:00 UTC).
//   3. **מנה קטנה בכל ריצה** (8 מיילים לכל היותר), כי בתוכנית החינמית לריצת קרון
//      יש 10 מילישניות מעבד. הקרון רץ כל שעה, כך שמנה קטנה מספיקה.
//
// כל מייל שנולד מפעולה של המוסר (אחרי „להשאיר" או „להסיר") עובר דרך תור
// (outbox:) ונשלח בריצת הקרון הבאה, כדי שאותם שלושה שומרים יחולו גם עליו.

import { inQuietWindow } from "./tehillim-quiet.js";

const DAY = 24 * 3600 * 1000;
const RENEW_EVERY = 30 * DAY;
const BATCH = 8;
const QUIET_LEAD = 3 * 3600 * 1000;

const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- מייל עברי: כיוון מוצהר ובידוד לטיני (כלל 28) ----------
function isolateLatin(html) {
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.charAt(0) === "<") return part;
    return part.replace(/&[#\w]+;|[A-Za-z][\w.@:\/?=&%#+~-]*(?: +[A-Za-z][\w.@:\/?=&%#+~-]*)*/g,
      (m) => (m.charAt(0) === "&" && m.endsWith(";") ? m : `<span dir="ltr">${m}</span>`));
  }).join("");
}
export function rtlEmail(inner) {
  const body = isolateLatin(inner).replace(
    /<(p|ul|ol|li|table|tr|td|div|h[1-6])(?![^>]*\bdir=)(?=[\s>])/g, '<$1 dir="rtl"');
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>` +
    `<body dir="rtl" style="direction:rtl;text-align:right">${body}</body></html>`;
}
function button(href, text, color) {
  return `<a href="${String(href).replace(/&/g, "&amp;")}" style="background:${color || "#b08434"};color:#fff;text-decoration:none;` +
    `padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold;margin:4px 0 4px 8px">${text}</a>`;
}
const WRAP = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.8;color:#1c1a17">`;
const SIGN = `<p>באהבה,<br>יעקב מאור<br>0528395189</p>`;

const enc = new TextEncoder();
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isQuiet(now) {
  if (inQuietWindow(now) || inQuietWindow(now + QUIET_LEAD)) return true;
  const h = new Date(now).getUTCHours();
  return h < 5 || h >= 18;
}

/**
 * cfg: { kind: "refua"|"bakasha", field: "cholim"|"bakashot", kvName, secretName,
 *        self, publicKey, sendMail, fullName, ownerTo, replyTo, donate, keva }
 */
export function makeRenewal(cfg) {
  const kv = (env) => env[cfg.kvName];
  const secret = (env) => env[cfg.secretName];
  const isRefua = cfg.kind === "refua";
  const SITE = "https://hamikdash.co.il";
  const T = isRefua
    ? { what: "השמות", list: "רשימת הרפואה", bless: "ולרפואה שלמה במהרה",
        healed: "ברוך השם, הבריא/ה", healedShort: "הבריא" }
    : { what: "השמות והבקשות", list: "רשימת הבקשות", bless: "ושהבקשה תתקבל במהרה",
        healed: "ברוך השם, הבקשה התקבלה", healedShort: "הבקשה התקבלה" };

  const sendingOn = async (env) =>
    env.RENEWAL_SEND === "on" || (kv(env) && (await kv(env).get("cfg:renewal-send")) === "on");

  async function editUrlFor(env, o) {
    if (!secret(env)) return "";
    return `${SITE}/refua.html?edit=${cfg.kind}&o=${o}&s=${await hmac(secret(env), "edit:" + o)}`;
  }
  async function renewUrl(env, o, a) {
    return `${cfg.self}/renew?o=${o}&a=${a}&s=${await hmac(secret(env), "renew:" + o)}`;
  }
  const names = (rec) => (rec && Array.isArray(rec[cfg.field]) ? rec[cfg.field] : []);
  const listHtml = (list) =>
    `<ul style="background:#f3ece0;border-right:4px solid #b08434;padding:14px 24px 14px 18px;` +
    `border-radius:8px;list-style:none;margin:20px 0">` +
    list.map((n) => `<li style="margin:4px 0">${esc(cfg.fullName(n))}` +
      (n.request ? `<br><span style="font-size:14px;color:#4a453e">${esc(n.request)}</span>` : "") +
      `</li>`).join("") + `</ul>`;

  // ---------- נוסחי המיילים ----------
  async function renewalEmail(env, o, rec) {
    const keep = await renewUrl(env, o, "keep"), remove = await renewUrl(env, o, "remove");
    const edit = await editUrlFor(env, o);
    return {
      subject: isRefua ? "האם להשאיר את השמות ברשימת הרפואה?" : "האם להשאיר את הבקשות ברשימה?",
      html: WRAP +
        `<p>שלום ${esc(rec.name)},</p>` +
        `<p>מסרתם לתפילה את ${T.what} האלה:</p>` + listHtml(names(rec)) +
        `<p>בכל יום כל השותפים בפרויקט מתפללים על השמות האלה, יחד עם האברכים והרבנים בכולל ובעמותה.</p>` +
        `<p>כדי שהרשימה תהיה תפילה מכוונת, אנחנו שואלים פעם בחודש: להשאיר את השמות ברשימה?</p>` +
        `<p>${button(keep, "כן, להשאיר")} ${button(remove, "לא, להסיר", "#6b6459")}</p>` +
        `<p>אם לא תענו, השמות יישארו ברשימה, ונשאל שוב בעוד חודש.</p>` +
        (edit ? `<p>אפשר גם לתקן את השמות או להוסיף שמות: <a href="${edit}" style="color:#8a6a1f">לשינוי השמות שמסרתם</a>.</p>` : "") +
        `<p style="margin-top:28px">שתזכו לבשורות טובות, ${T.bless}.</p>` + SIGN + `</div>`,
    };
  }
  function keptEmail(rec) {
    return {
      subject: "השמות נשארים ברשימה",
      html: WRAP +
        `<p>שלום ${esc(rec.name)},</p>` +
        `<p>תודה שעדכנתם. ${T.what} נשארים ב${T.list}, והתפילות עליהם ממשיכות:</p>` + listHtml(names(rec)) +
        `<p>בעוד כחודש נשאל שוב.</p>` +
        `<p>${button("https://t.hamikdash.co.il/klali", "לפתוח ספר תהילים להתפלל על השמות שנמסרו")}</p>` +
        `<p style="margin-top:28px">שתזכו לבשורות טובות, ${T.bless}.</p>` + SIGN + `</div>`,
    };
  }
  function healedEmail(rec, removed) {
    return {
      subject: "ברוך שומע תפילה",
      html: WRAP +
        `<p>שלום ${esc(rec.name)},</p>` +
        `<p><strong>ברוך שומע תפילה!</strong> שמחנו מאוד לשמוע את הבשורה הטובה, ואנחנו מודים לה' יחד אתכם.</p>` +
        `<p>${removed.length === 1 ? "השם הוסר" : "השמות הוסרו"} מהרשימה:</p>` + listHtml(removed) +
        `<p>מי שרוצה להודות על הישועה ולהמשיך את הזכות, יכול לתרום לכולל, ובכך להחזיק את האברכים שלמדו והתפללו.</p>` +
        `<p>${button(cfg.donate, "לתרומה חד פעמית")} ${button(cfg.keva, "להוראת קבע")}</p>` +
        `<p>ואם יש עוד מישהו שזקוק לתפילה, אפשר למסור את שמו בכל עת: ` +
        `<a href="${SITE}/refua.html" style="color:#8a6a1f">${SITE}/refua.html</a></p>` +
        `<p style="margin-top:28px">שתמשיכו לבשר בשורות טובות.</p>` + SIGN + `</div>`,
    };
  }
  function passedEmail(rec, removed) {
    const links = removed.map((n) => {
      const q = new URLSearchParams({ prefill: "1", name: n.name || "", parent: n.parent || "",
        gender: n.gender || "" }).toString();
      return `<p>${button(`${SITE}/neshama.html?${q}`, "למסירת " + esc(cfg.fullName(n)) + " לעילוי נשמה")}</p>`;
    }).join("");
    return {
      subject: "משתתפים בצערכם",
      html: WRAP +
        `<p>שלום ${esc(rec.name)},</p>` +
        `<p>קיבלנו את ההודעה, ואנחנו משתתפים בצערכם. המקום ינחם אתכם בתוך שאר אבלי ציון וירושלים.</p>` +
        `<p>${removed.length === 1 ? "השם הוסר" : "השמות הוסרו"} מ${T.list}.</p>` +
        `<p>אם תרצו, אפשר למסור את השם לעילוי נשמה. בדף עילוי הנשמה מוסרים את שם הנפטר ואת תאריך פטירתו. ` +
        `מקבלים מייל עם ההלכות של השבעה, של החודש ושל השנה הראשונה, ולפני כל יארצייט מגיעה תזכורת. ` +
        `בשבוע היארצייט השם מופיע בחלון הפתוח באתר, וכל המצוות שנעשות בעמותה - לימוד האברכים, השיעורים ` +
        `וסיומי המסכתות - נזקפות לעילוי נשמת הנפטרים שבאתר.</p>` +
        `<p>הקישור כבר ממלא את השם ואת שם ההורה. נשאר להשלים את תאריך הפטירה ואת שאר הפרטים, ` +
        `ואם נהוג אצלכם להזכיר את שם האב, אפשר להחליף אותו שם.</p>` + links +
        `<p style="margin-top:28px">תנוחמו מהשמיים.</p>` + SIGN + `</div>`,
    };
  }

  // ---------- דפים שהוורקר מגיש ----------
  function page(title, body, status) {
    return new Response(
      `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title} | אורות האמונה - בני משה</title>` +
      `<style>body{font-family:system-ui,Arial,sans-serif;background:#faf6ef;color:#1c1a17;` +
      `margin:0;padding:40px 18px;line-height:1.8}main{max-width:560px;margin:0 auto;` +
      `background:#fff;border:1px solid #e5ddd0;border-radius:14px;padding:26px 22px}` +
      `h1{font-size:25px;margin:0 0 14px;color:#8a6a1f}a{color:#8a6a1f}` +
      `label{display:block;margin:8px 0}textarea{width:100%;box-sizing:border-box;font:inherit;` +
      `padding:10px;border:1px solid #e5ddd0;border-radius:8px;min-height:5em}` +
      `button{font:inherit;font-weight:bold;background:#b08434;color:#fff;border:0;border-radius:8px;` +
      `padding:12px 26px;cursor:pointer;margin-top:14px}fieldset{border:0;padding:0;margin:0 0 16px}` +
      `legend{font-weight:bold;padding:0;margin-bottom:4px}</style></head>` +
      `<body><main><h1>${title}</h1>${body}` +
      `<p style="margin-top:26px"><a href="${SITE}/refua.html">לדף רפואה ושאר משאלות</a></p>` +
      `</main></body></html>`,
      { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  async function queue(env, o, to, mail) {
    await kv(env).put(`outbox:${Date.now()}:${o}`, JSON.stringify({ to, subject: mail.subject, html: rtlEmail(mail.html) }));
  }

  async function removeFromPublic(env, o, removed) {
    const raw = await kv(env).get(cfg.publicKey);
    let cur = [];
    try { cur = raw ? JSON.parse(raw) : []; } catch (e) { cur = []; }
    const keys = new Set(removed.map((n) => [n.name, n.parent].join("|")));
    const kept = cur.filter((e) => !(e.owner === o && keys.has([e.name, e.parent].join("|"))));
    if (kept.length !== cur.length) await kv(env).put(cfg.publicKey, JSON.stringify(kept));
    return cur.length - kept.length;
  }

  // ---------- נתבים ----------
  async function handle(request, env, url, headers) {
    const p = url.pathname;
    if (p !== "/mine" && p !== "/renew" && p !== "/renewal-dry") return null;
    if (!kv(env) || !secret(env)) return new Response("not configured", { status: 503, headers });

    // GET /mine?o=&s= - השמות של המוסר, לקישור העריכה האישי.
    if (p === "/mine") {
      const o = url.searchParams.get("o") || "", s = url.searchParams.get("s") || "";
      if (!o || s !== (await hmac(secret(env), "edit:" + o)))
        return new Response("bad link", { status: 403, headers });
      let rec = null;
      try { rec = JSON.parse((await kv(env).get("sub:" + o)) || "null"); } catch (e) { rec = null; }
      if (!rec) return new Response("not found", { status: 404, headers });
      return new Response(JSON.stringify({
        me: { name: rec.name || "", phone: rec.phone || "", email: rec.email || "" },
        names: names(rec),
      }), { status: 200, headers: Object.assign({}, headers, {
        "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }) });
    }

    // GET /renewal-dry?k= - הרצה ידנית של סריקת החידוש במצב יבש בלבד, לבדיקה.
    if (p === "/renewal-dry") {
      if ((url.searchParams.get("k") || "") !== (await hmac(secret(env), "renewal-admin")))
        return new Response("forbidden", { status: 403, headers });
      const out = await scan(env, Date.now(), true);
      return new Response(JSON.stringify(out, null, 1), { status: 200, headers: Object.assign({}, headers, {
        "Content-Type": "application/json; charset=utf-8" }) });
    }

    // /renew - „כן, להשאיר" / „לא, להסיר"
    const isPost = request.method === "POST";
    let form = url.searchParams;
    if (isPost) {
      try { form = new URLSearchParams(await request.text()); } catch (e) { form = new URLSearchParams(); }
    }
    const o = form.get("o") || "", s = form.get("s") || "", a = form.get("a") || "";
    const bad = page("הקישור אינו תקין", `<p>אפשר לתקן או להסיר שמות גם מתוך הדף עצמו.</p>`, 403);
    if (!o || s !== (await hmac(secret(env), "renew:" + o))) return bad;
    let rec = null;
    try { rec = JSON.parse((await kv(env).get("sub:" + o)) || "null"); } catch (e) { rec = null; }
    const list = names(rec);
    if (!rec || !list.length)
      return page("אין שמות ברשימה", `<p>לא נמצאו שמות פעילים שמסרתם. אפשר למסור שמות חדשים בכל עת.</p>`);

    if (!isPost && a === "keep") {
      rec.keptAt = Date.now();
      await kv(env).put("sub:" + o, JSON.stringify(rec));
      await queue(env, o, rec.email, keptEmail(rec));
      return page("השמות נשארים ברשימה", `<p>תודה שעדכנתם. ${T.what} נשארים ברשימה, והתפילות עליהם ` +
        `ממשיכות. בעוד כחודש נשאל שוב.</p>` + listHtml(list));
    }

    if (!isPost) {
      // טופס ההסרה: אילו שמות, ומה הסיבה. הבחירה בין הסיבות קובעת איזה מייל יישלח,
      // ושדה הסיבה החופשי עובר ליעקב כפי שנכתב.
      const boxes = list.map((n, i) => `<label><input type="checkbox" name="n" value="${i}" checked> ` +
        `${esc(cfg.fullName(n))}</label>`).join("");
      return page("הסרת שמות מהרשימה",
        `<form method="post" action="${cfg.self}/renew">` +
        `<input type="hidden" name="o" value="${esc(o)}"><input type="hidden" name="s" value="${esc(s)}">` +
        `<fieldset><legend>אילו שמות להסיר?</legend>${boxes}</fieldset>` +
        `<fieldset><legend>מה הסיבה?</legend>` +
        `<label><input type="radio" name="why" value="healed" required> ${T.healed}</label>` +
        `<label><input type="radio" name="why" value="passed"> חלילה, נפטר/ה</label>` +
        `<label><input type="radio" name="why" value="other"> סיבה אחרת</label></fieldset>` +
        `<label for="reason"><b>סיבה</b> - אפשר לכתוב כאן במילים שלכם (לא חובה)</label>` +
        `<textarea id="reason" name="reason" maxlength="1000"></textarea>` +
        `<button type="submit">הסרה מהרשימה</button></form>`);
    }

    // POST /renew - ביצוע ההסרה
    const pick = new Set(form.getAll("n").map((x) => Number(x)));
    const removed = list.filter((_, i) => pick.has(i));
    if (!removed.length) return page("לא נבחרו שמות", `<p>לא סימנתם שם להסרה, ולכן לא הוסר דבר.</p>`);
    const why = ["healed", "passed", "other"].includes(form.get("why")) ? form.get("why") : "other";
    const reason = String(form.get("reason") || "").slice(0, 1000);
    const rest = list.filter((_, i) => !pick.has(i));
    const count = await removeFromPublic(env, o, removed);
    rec[cfg.field] = rest;
    rec.count = rest.length;
    rec.keptAt = Date.now();
    await kv(env).put("sub:" + o, JSON.stringify(rec));
    // ליעקב מיד - זו הרשומה של ההסרה, כמו בכל הסרה אחרת.
    await cfg.sendMail(env, {
      to: cfg.ownerTo, replyTo: rec.email,
      subject: `הסרה מ${T.list} (מייל החידוש): ${rec.name}`,
      html: rtlEmail(WRAP + `<p><b>${esc(rec.name)}</b> (${esc(rec.email)}, ${esc(rec.phone)}) הסיר/ה ` +
        `${removed.length} שמות (${count} מהרשימה הגלויה).</p>` + listHtml(removed) +
        `<p>הסיבה שנבחרה: <b>${why === "healed" ? T.healed : why === "passed" ? "נפטר/ה" : "סיבה אחרת"}</b></p>` +
        (reason ? `<p>מה שנכתב: ${esc(reason)}</p>` : "") + `</div>`),
    });
    if (why === "healed") await queue(env, o, rec.email, healedEmail(rec, removed));
    if (why === "passed") await queue(env, o, rec.email, passedEmail(rec, removed));
    return page(why === "passed" ? "משתתפים בצערכם" : why === "healed" ? "ברוך שומע תפילה" : "השמות הוסרו",
      (why === "passed" ? `<p>השמות הוסרו. המקום ינחם אתכם בתוך שאר אבלי ציון וירושלים. נשלח אליכם מייל ` +
        `עם קישור למסירת השם לעילוי נשמה.</p>`
      : why === "healed" ? `<p>שמחנו מאוד לשמוע את הבשורה הטובה. השמות הוסרו מהרשימה.</p>`
      : `<p>השמות הוסרו מהרשימה. תודה שעדכנתם.</p>`) + listHtml(removed));
  }

  // ---------- הסריקה ----------
  // dryOnly: מצב יבש מפורש (בדיקה ידנית). אחרת - יבש רק אם המתג כבוי.
  async function scan(env, now, dryOnly) {
    const on = !dryOnly && (await sendingOn(env));
    const quiet = isQuiet(now);
    const live = on && !quiet;
    const report = { at: new Date(now).toISOString(), kind: cfg.kind, sending: on ? "on" : "off",
      quiet, outbox: 0, outboxSent: 0, due: [], sent: 0 };
    let budget = BATCH;

    // 1. התור: מיילים שנולדו מלחיצה של מוסר
    const ob = await kv(env).list({ prefix: "outbox:", limit: 50 });
    report.outbox = ob.keys.length;
    if (live) {
      for (const k of ob.keys) {
        if (budget <= 0) break;
        const m = JSON.parse((await kv(env).get(k.name)) || "null");
        if (m && (await cfg.sendMail(env, { to: m.to, replyTo: cfg.replyTo, subject: m.subject, html: m.html }))) {
          await kv(env).delete(k.name); report.outboxSent++; budget--;
        }
      }
    }

    // 2. מי הגיע זמנו לשאלה החודשית
    let cursor;
    do {
      const lst = await kv(env).list({ prefix: "sub:", cursor, limit: 1000 });
      for (const k of lst.keys) {
        let rec;
        try { rec = JSON.parse((await kv(env).get(k.name)) || "null"); } catch (e) { rec = null; }
        if (!rec || !names(rec).length || !rec.email) continue;
        const last = Math.max(Date.parse(rec.ts || 0) || 0, rec.keptAt || 0);
        if (now - last < RENEW_EVERY || now - (rec.askedAt || 0) < RENEW_EVERY) continue;
        const o = k.name.slice(4);
        report.due.push({ o, names: names(rec).length, since: rec.ts || "" });
        if (!live || budget <= 0) continue;
        const mail = await renewalEmail(env, o, rec);
        if (await cfg.sendMail(env, { to: rec.email, replyTo: cfg.replyTo, subject: mail.subject, html: rtlEmail(mail.html) })) {
          rec.askedAt = now;
          await kv(env).put(k.name, JSON.stringify(rec));
          report.sent++; budget--;
        }
      }
      cursor = lst.list_complete ? null : lst.cursor;
    } while (cursor);

    if (!dryOnly) await kv(env).put("renewal-dry-latest", JSON.stringify(report));
    return report;
  }

  async function clearSubmitter(env, o) {
    const raw = await kv(env).get("sub:" + o);
    if (!raw) return;
    try {
      const rec = JSON.parse(raw);
      rec[cfg.field] = []; rec.count = 0;
      await kv(env).put("sub:" + o, JSON.stringify(rec));
    } catch (e) { /* רשומה פגומה - אין מה לנקות */ }
  }

  return {
    handle, editUrlFor, clearSubmitter,
    scheduled: (env) => scan(env, Date.now(), false),
    // לבדיקה מקומית ולרינדור דוגמאות
    _emails: { renewalEmail, keptEmail, healedEmail, passedEmail },
  };
}
