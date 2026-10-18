// בדיקת מודל ההחזקות (הכרעות 6, 8, 17, 2, 3): BookDO אמיתי על SQLite של node.
// מריצים: node worker/_test_holds.mjs
import { DatabaseSync } from "node:sqlite";
import { BookDO } from "./tehillim-book-do.js";

function makeDO() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q, ...args) {
      const st = db.prepare(q);
      const isSelect = /^\s*SELECT/i.test(q);
      const rows = isSelect ? st.all(...args) : (st.run(...args), []);
      return { toArray: () => rows };
    },
  };
  const ctx = { storage: { sql, setAlarm() {} } };
  return { d: new BookDO(ctx, {}), db, sql };
}
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const H = 3600000;

const { d, sql } = makeDO();
d.create({ patientName: "דוד", motherName: "לאה", gender: "m", intent: "refua" }, 171);

// שני קוראים לוקחים את אותו פרק - שניהם מקבלים אותו
const a = d.take("A", "אבי", [0, 1, 2], H);
const b = d.take("B", "בני", [1, 2, 3], H);
ok(a.ok && a.taken.length === 3 && a.shared.length === 0, "א לוקח 0-2");
ok(b.ok && b.taken.length === 3 && JSON.stringify(b.shared) === "[1,2]", "ב לוקח 1-3, ומודיעים לו ש-1,2 אצל אחר");
const sa = d.snapshot("A"), sb = d.snapshot("B");
ok(sa.units[1].mine === 1 && sb.units[1].mine === 1 && sa.units[1].n === 2, "פרק 1 'שלי' אצל שניהם, 2 מחזיקים");

// ב קורא את 1 ראשון - נספר פעם אחת; א מקבל 'כבר נקרא'
const rb = d.markRead("B", [1], "בני");
const ra = d.markRead("A", [1], "אבי");
ok(rb.read.length === 1 && ra.read.length === 0 && ra.already.length === 1, "הראשון שסימן נספר, השני מקבל already");
ok(d.snapshot("A").counts.read === 1, "אין ספירה כפולה");

// take על פרק שנקרא מחזיר alreadyRead (הכרעה 8)
const t2 = d.take("C", "גדי", [1, 4], H);
ok(JSON.stringify(t2.alreadyRead) === "[1]" && JSON.stringify(t2.taken) === "[4]", "בחירה שכוללת פרק שנקרא - חלקית, לא נכשלת");

// סימון דיווחי בלי take, רצף שלם (הכרעות 2, 3)
const range = Array.from({ length: 41 }, (_, k) => k); // ספר ראשון: פרקים 1-41
const rr = d.markRead("D", range, "דנה");
ok(rr.read.length === 40 && rr.already.length === 1, "סימון ספר ראשון שלם בלי לקחת: 40 חדשים, 1 כבר נקרא");
ok(sql.exec("SELECT COUNT(*) AS c FROM holds WHERE idx < 41").toArray()[0].c === 0, "החזקות על פרקים שנקראו נמחקו");

// שחרור של אחד לא משחרר את השני
d.take("E", "", [50], H); d.take("F", "", [50], H);
d.release("E", [50]);
ok(d.snapshot("F").units[50].s === "taken" && d.snapshot("F").units[50].mine === 1, "שחרור של E משאיר את F מחזיק");
d.release("F", [50]);
ok(d.snapshot("F").units[50].s === "free", "שחרור אחרון מפנה את הפרק");

// פקיעה: מזייפים takenAt ישן
d.take("C", "גדי", [60], H);
sql.exec("UPDATE holds SET takenAt = ? WHERE idx = 60", Date.now() - 5 * H);
ok(d.snapshot("C").units[60].s === "free", "החזקה שפגה משחררת את הפרק");

// הגירה של ספר ישן: taken על units בלי holds
const o2 = makeDO();
o2.d.create({}, 171);
o2.sql.exec("DELETE FROM holds");
o2.sql.exec("DELETE FROM meta WHERE k='holdsMigrated'");
o2.sql.exec("UPDATE units SET state='taken', readerKey='OLD', readerName='ישן', takenAt=?, budgetMs=? WHERE idx=7", Date.now(), H);
o2.d.init();
ok(o2.d.snapshot("OLD").units[7].mine === 1 && o2.d.snapshot("OLD").units[7].s === "taken", "ספר מלפני הטבלה: ההחזקה הישנה עוברת ל-holds");

// סגירה וסבב חדש מנקה החזקות
const k = makeDO(); k.d.create({}, 171);
k.d.take("X", "", [5], H);
k.d.markRead("Y", Array.from({ length: 171 }, (_, i) => i));
ok(k.d.getMeta("status") === "closed", "כל 171 סומנו - הספר נסגר");
k.d.reopen({});
ok(k.sql.exec("SELECT COUNT(*) AS c FROM holds").toArray()[0].c === 0 && k.d.snapshot("X").counts.free === 171, "סבב חדש: הכל פנוי ואין החזקות");

// חלוקת הנותרים יוצרת החזקות ולא נמחקת ב-sweep
const g = makeDO(); g.d.create({}, 171);
g.d.markRead("R1", [0]); g.d.markRead("R2", [1]);
const dist = g.d.distribute();
ok(dist.assigned === 169 && g.d.snapshot("R1").counts.taken === 169, "חלוקת נותרים שורדת את ה-sweep");
process.exit(fail ? 1 : 0);
