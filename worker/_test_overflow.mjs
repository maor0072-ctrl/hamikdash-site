// שום קריאה אינה הולכת לאיבוד (יעקב, 24.11.2026): קריאה כפולה עוברת לספר אחר.
// מריצים: node worker/_test_overflow.mjs
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

const SECRET = "test-secret-overflow";
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

// ---- A ו-B פתוחים בקטלוג; B קרוב יותר לסיום ----
const A = await openBook("אברהם");
const B = await openBook("יצחק");
await call("POST", "/api/book/" + B + "/read", { readerKey: "rb", idxs: [20, 21, 22] });

// קורא ראשון קורא את 0 ב-A, קורא שני קורא את אותו פרק ב-A
let r = await call("POST", "/api/book/" + A + "/read", { readerKey: "r1", idxs: [0] });
check("הקורא הראשון נספר ב-A", r.d.read.length === 1 && !(r.d.overflow || []).length);
r = await call("POST", "/api/book/" + A + "/read", { readerKey: "r2", readerName: "דן", idxs: [0] });
check("הקורא השני מקבל already ב-A", r.d.already.length === 1);
check("הקריאה הכפולה עברה ל-B (הקרוב לסיום)", r.d.overflow.length === 1 && r.d.overflow[0].to === B && r.d.overflow[0].i === 0, JSON.stringify(r.d.overflow));
check("התווית בצורת יעד", r.d.overflow[0].label === "לספר של יצחק בן שרה", r.d.overflow[0].label);
let s = await call("GET", "/api/book/" + B + "/state");
check("ב-B פרק 0 נקרא עכשיו", s.d.units[0].s === "read" && s.d.counts.read === 4);

// קורא שלישי על אותו פרק: A ו-B כבר מלאים בו -> הקריאה הכללית
r = await call("POST", "/api/book/" + A + "/read", { readerKey: "r3", idxs: [0] });
check("קורא שלישי עובר לקריאה הכללית", r.d.overflow.length === 1 && r.d.overflow[0].to === "klali" && r.d.overflow[0].label === "לקריאה הכללית", JSON.stringify(r.d.overflow));
s = await call("GET", "/api/book/klali/state");
check("בקריאה הכללית פרק 0 נקרא", s.d.units[0].s === "read");

// כפילות בתוך הקריאה הכללית עצמה הולכת לספרים האחרים, לא חוזרת אליה
r = await call("POST", "/api/book/klali/read", { readerKey: "r4", idxs: [0, 1] });
check("מהקריאה הכללית: 1 חדש, 0 כפול", r.d.read.length === 1 && r.d.already.length === 1);
check("והכפול לא נשאר בקריאה הכללית", (r.d.overflow || []).every((o) => o.to !== "klali"));

// מונה כללי כולל את כל הקריאות האמיתיות
const st = await call("GET", "/api/stats");
console.log("  info  stats:", JSON.stringify(st.d).slice(0, 160));

console.log(fails ? fails + " FAIL" : "ALL PASS");
process.exit(fails ? 1 : 0);
