// בדיקת סגירת ספר על ידי הפותח (הכרעות ט5, ט6, 23.11.2026).
// הוורקר האמיתי מול BookDO ו-CounterDO אמיתיים על SQLite של node, בזיכרון -
// בלי רשת ובלי השרת החי. מריצים: node worker/_test_close.mjs
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import { BookDO } from "./tehillim-book-do.js";
import { CounterDO } from "./tehillim-counter-do.js";
import worker from "./tehillim.js";

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (extra ? "   " + extra : ""));
  if (!cond) fails++;
}

function sqlCtx() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q, ...args) {
      const st = db.prepare(q);
      const isSelect = /^\s*(SELECT|WITH)/i.test(q);
      const rows = isSelect ? st.all(...args) : (st.run(...args), []);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
  return { storage: { sql, setAlarm() {} } };
}

// מרחב שמות של DO: מופע אחד לכל שם, כמו idFromName בקלאודפלייר
function ns(Cls) {
  const inst = {};
  return {
    idFromName: (n) => n,
    get: (n) => {
      if (!inst[n]) inst[n] = new Cls(sqlCtx(), {});
      return { fetch: (url, init) => inst[n].fetch(new Request(url, init)) };
    },
  };
}

const SECRET = "test-secret-close";
const env = { BOOK: ns(BookDO), COUNTER: ns(CounterDO), TEHILLIM_TOKEN_SECRET: SECRET };
const ORIGIN = "https://hamikdash.co.il";

function msig(id) {
  return createHmac("sha256", SECRET).update(id + ":m").digest("base64url").slice(0, 22);
}

async function call(method, path, body) {
  const init = { method, headers: { Origin: ORIGIN, "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await worker.fetch(new Request("https://t.hamikdash.co.il" + path, init), env);
  let d = null;
  try { d = await r.json(); } catch (e) { d = null; }
  return { status: r.status, d };
}

async function openBook(name) {
  const r = await call("POST", "/api/book", {
    patientName: name, motherName: "שרה", gender: "m", intent: "refua",
    openerName: "בודק", openerPhone: "050-1234567", openerEmail: "t@example.com", listed: true,
  });
  return r.d.id;
}

// ---- פתיחה, קריאה, ובדיקה שהספר בקטלוג לפני הסגירה ----
const A = await openBook("אברהם");
const B = await openBook("יצחק");
check("שני ספרי בדיקה נפתחו", !!A && !!B);
const MA = A + "." + msig(A);

await call("POST", "/api/book/" + A + "/read", { readerKey: "r1", readerName: "רות", idxs: [0, 1, 2] });
await call("POST", "/api/book/" + A + "/take", { readerKey: "r2", readerName: "דן", idxs: [5, 6] });
let cat = await call("GET", "/api/catalog");
check("לפני הסגירה: A בקטלוג", cat.d.books.some((b) => b.id === A));

// ---- טוקן ציבורי, טוקן מזויף ו-GET לא סוגרים ----
let r = await call("POST", "/api/manage/" + A + "/close", { reason: "filled" });
check("טוקן ציבורי לא יכול לסגור (403)", r.status === 403 && r.d.error === "bad_token", r.status);
r = await call("POST", "/api/manage/" + A + ".AAAAAAAAAAAAAAAAAAAAAA/close", { reason: "filled" });
check("חתימה מזויפת לא יכולה לסגור (403)", r.status === 403);
r = await call("POST", "/api/book/" + A + "/close", { reason: "filled" });
check("אין נתיב סגירה ציבורי", r.status === 404 || (r.d && !r.d.ok));
r = await call("GET", "/api/manage/" + MA + "/close");
check("GET לא סוגר", r.status === 404);
r = await call("POST", "/api/manage/" + MA + "/close", { reason: "because" });
check("סיבה לא מוכרת נדחית (400)", r.status === 400 && r.d.error === "bad_reason");
r = await call("GET", "/api/book/" + A + "/state");
check("אחרי כל אלה A עדיין פתוח", r.d.status === "open" && !r.d.closedBy);

// ---- הסגירה ----
r = await call("POST", "/api/manage/" + MA + "/close", { reason: "deceased", note: "לא נשמר" });
check("סגירה בטוקן הניהול מצליחה", r.status === 200 && r.d.ok && r.d.reason === "deceased" && r.d.closedAt > 0);
check("הערה נשמרת רק ב'אחר'", r.d.note === "");
r = await call("POST", "/api/manage/" + MA + "/close", { reason: "filled" });
check("סגירה כפולה - already, הסיבה הראשונה נשארת", r.d.ok && r.d.already && r.d.reason === "deceased");

// ---- מה רואה הקורא ----
r = await call("GET", "/api/book/" + A + "/state?rk=r1");
const s = r.d;
check("state: status closed ו-closedBy owner", s.status === "closed" && s.closedBy === "owner");
check("state: נקראו 3 פרקים", s.chaptersRead === 3, s.chaptersRead);
check("state: הודעה ניטרלית", s.closedMessage === "הספר נסגר לבקשת מי שפתח אותו. נקראו בו 3 פרקים. תודה לכל מי שקרא והתפלל.", s.closedMessage);
check("state: קישור לספר הכללי", s.generalUrl === "https://t.hamikdash.co.il/klali");
check("state הציבורי לא חושף את הסיבה", !JSON.stringify(s).includes("deceased") && s.closeReason === undefined);
check("מה שנקרא נשמר", s.counts.read === 3);
check("ההחזקות שוחררו", s.counts.taken === 0 && s.units[5].s === "free");
check("אין מקף ארוך בהודעה", !/[–—]/.test(s.closedMessage));

// ---- take/read אחרי הסגירה ----
r = await call("POST", "/api/book/" + A + "/take", { readerKey: "r3", idxs: [10] });
check("take אחרי סגירה נדחה (409 closed owner)", r.status === 409 && r.d.error === "closed" && r.d.closedBy === "owner", r.status);
r = await call("POST", "/api/book/" + A + "/read", { readerKey: "r3", idxs: [10] });
check("read אחרי סגירה נדחה (409 closed owner)", r.status === 409 && r.d.error === "closed" && r.d.closedBy === "owner", r.status);
r = await call("GET", "/api/book/" + A + "/state");
check("הסימון הנדחה לא נספר", r.d.counts.read === 3);
r = await call("GET", "/api/book/" + A + "/suggest");
check("suggest: אין פרק מוצע בספר סגור", r.d.idx === null && r.d.closed === true);

// ---- ניהול אחרי הסגירה ----
r = await call("GET", "/api/manage/" + MA + "/state");
check("ניהול: רואה את הסיבה", r.d.closedBy === "owner" && r.d.closeReason === "deceased" && r.d.patientName === "אברהם");
check("ניהול: יצא מרישום הקטלוג", r.d.listed === 0);
r = await call("POST", "/api/manage/" + MA + "/distribute");
check("ניהול: אין חלוקה בספר סגור", r.status === 409 && r.d.error === "closed");

// ---- קטלוג ו-general ----
cat = await call("GET", "/api/catalog");
check("A ירד מהקטלוג, B נשאר", !cat.d.books.some((b) => b.id === A) && cat.d.books.some((b) => b.id === B));
// ספר שנפתח לפני 30 יום בלי סימון הוא "רדום" ונבחר ככללי. נזיז את השעון קדימה.
const realNow = Date.now;
Date.now = () => realNow() + 30 * 86400000;
let gen = await call("GET", "/api/general");
check("general: הספר הסגור לא נבחר, נבחר B הרדום", gen.d.token === B, gen.d.token);
await call("POST", "/api/manage/" + B + "." + msig(B) + "/close", { reason: "stop" });
gen = await call("GET", "/api/general");
check("general: כשגם B נסגר - הקריאה הכללית", gen.d.token === "klali", gen.d.token);
Date.now = realNow;

// ---- אין סבב נוסף: reopen ישיר על ה-DO ----
const stubA = env.BOOK.get(A);
const ro = await (await stubA.fetch("https://do/reopen", { method: "POST", body: "{}" })).json();
check("reopen על ספר סגור נדחה", ro.ok === false && ro.error === "closed");
r = await call("GET", "/api/book/" + A + "/state");
check("ועדיין סגור", r.d.closedBy === "owner" && r.d.status === "closed");

// ---- ספר שהושלם אינו "נסגר על ידי הפותח" ----
const C = await openBook("יעקב");
const all = Array.from({ length: 171 }, (_, i) => i);
r = await call("POST", "/api/book/" + C + "/read", { readerKey: "rc", idxs: all });
check("ספר שהושלם נפתח לסבב נוסף כרגיל", r.d.ok && r.d.closed && r.d.reopened);
r = await call("GET", "/api/book/" + C + "/state");
check("ספר שהושלם - closedBy ריק", r.d.closedBy === "" && r.d.status === "open");

// ---- הקריאה הכללית לא נסגרת ----
await call("POST", "/api/klali");
r = await call("POST", "/api/manage/klali." + msig("klali") + "/close", { reason: "stop" });
check("klali: הנתיב מסרב (403)", r.status === 403 && r.d.error === "klali");
const sk = await (await env.BOOK.get("klali").fetch("https://do/shut", { method: "POST", body: JSON.stringify({ reason: "stop" }) })).json();
check("klali: גם ה-DO מסרב", sk.ok === false && sk.error === "klali");
r = await call("GET", "/api/book/klali/state");
check("klali: נשאר פתוח", r.d.status === "open" && !r.d.closedBy);
r = await call("GET", "/api/manage/klali." + msig("klali") + "/state");
check("klali: closable 0 במסך הניהול", r.d.closable === 0);
r = await call("GET", "/api/manage/" + MA + "/state");
check("ספר פרטי: closable 1", r.d.closable === 1);

// ---- 'אחר' עם הערה ----
const D = await openBook("משה");
r = await call("POST", "/api/manage/" + D + "." + msig(D) + "/close", { reason: "other", note: "  עברנו לספר אחר  " });
check("אחר: ההערה נשמרת ונוקתה", r.d.ok && r.d.reason === "other" && r.d.note === "עברנו לספר אחר", r.d.note);

console.log(fails ? "\n" + fails + " נכשלו" : "\nהכל עבר");
process.exit(fails ? 1 : 0);
