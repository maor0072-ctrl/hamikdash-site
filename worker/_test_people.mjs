// בדיקת ההרשמה מרצון: rekey בספר, ורשימת הקוראים במונה. מריצים: node worker/_test_people.mjs
import { DatabaseSync } from "node:sqlite";
import { BookDO } from "./tehillim-book-do.js";
import { CounterDO } from "./tehillim-counter-do.js";
function ctxOf() {
  const db = new DatabaseSync(":memory:");
  const sql = { exec(q, ...a) { const st = db.prepare(q); const rows = /^\s*SELECT/i.test(q) ? st.all(...a) : (st.run(...a), []); return { toArray: () => rows }; } };
  return { storage: { sql, setAlarm() {} } };
}
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const H = 3600000;
const d = new BookDO(ctxOf(), {});
d.create({}, 171);
d.take("rLocal", "שרה", [3, 4], H);
d.markRead("rLocal", [3], "שרה");
d.rekey("rLocal", "pABC", "שרה", "4567", "s@x.co");
const s = d.snapshot("pABC");
ok(s.units[4].mine === 1 && s.units[3].mine === 1, "אחרי הרשמה: ההחזקה והקריאה עוברות למפתח הקבוע");
ok(d.snapshot("rLocal").units[4].mine === 0, "המפתח המקומי כבר לא מחזיק");
const r = d.sql.exec("SELECT marked, phone, email FROM readers WHERE rkey='pABC'").toArray()[0];
ok(r.marked === 1 && r.phone === "4567" && r.email === "s@x.co", "שורת הקורא אוחדה עם הספירה, ונשמרות רק 4 ספרות טלפון");
d.rekey("pABC", "pABC", "", "", "");
ok(d.sql.exec("SELECT name FROM readers WHERE rkey='pABC'").toArray()[0].name === "שרה", "הרשמה חוזרת בלי שם לא מוחקת שם קיים");

let Counter;
try { Counter = CounterDO; } catch (e) {}
const c = new Counter(ctxOf(), {});
c.personUpsert({ pkey: "ABC", first: "שרה", last: "כהן", email: "s@x.co" });
c.personBump("ABC", 5); c.personBump("ABC", 2);
ok(c.personGet("ABC").marked === 7, "ספירה אישית מצטברת");
c.personUpsert({ pkey: "ABC", first: "", last: "", email: "" });
ok(c.mailList().people.length === 1 && c.mailList().people[0].email === "s@x.co", "רשימת המייל החודשי שומרת את המייל");
ok(c.personGet("nope").known === 0, "קורא לא מוכר");
process.exit(fail ? 1 : 0);
