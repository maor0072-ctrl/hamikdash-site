// בדיקת שמירת הרשימה של תהילים אישי (22.11.2026): הנתיבים /api/personal/* מול
// CounterDO אמיתי שה-sql שלו הוא node:sqlite בזיכרון - בלי miniflare ובלי רשת.
// מריצים: node worker/_test_personal_store.mjs
import { DatabaseSync } from "node:sqlite";
import { CounterDO } from "./tehillim-counter-do.js";
import { cleanList, validId, newPersonalId, MAX_BODY } from "./tehillim-personal.js";
import worker from "./tehillim.js";

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (extra ? "   " + extra : ""));
  if (!cond) fails++;
}

// ---- Durable Object מדומה: מופע CounterDO לכל שם, כל אחד עם מסד משלו ----
function fakeCtx() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(q, ...a) {
      const st = db.prepare(q);
      const rows = /^\s*SELECT/i.test(q) ? st.all(...a) : (st.run(...a), []);
      return { toArray: () => rows };
    },
  };
  return { storage: { sql, setAlarm() {} }, db };
}
const instances = {};
const COUNTER = {
  idFromName: (n) => n,
  get(name) {
    if (!instances[name]) {
      const ctx = fakeCtx();
      instances[name] = { obj: new CounterDO(ctx, {}), db: ctx.db };
    }
    const o = instances[name].obj;
    return { fetch: (u, init) => o.fetch(new Request(u, init)) };
  },
};
const env = { COUNTER, BOOK: { idFromName: (n) => n, get() { throw new Error("BOOK לא אמור להיקרא"); } } };

const logs = [];
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
function capture() {
  console.log = (...a) => logs.push(a.join(" "));
  console.error = console.log;
  console.warn = console.log;
}
function release() {
  console.log = origLog;
  console.error = origErr;
  console.warn = origWarn;
}

async function api(action, body, opts) {
  const o = opts || {};
  const init = { method: o.method || "POST", headers: { "content-type": "application/json", Origin: o.origin || "https://hamikdash.co.il" } };
  if (init.method !== "GET") init.body = typeof body === "string" ? body : JSON.stringify(body || {});
  capture();
  let res;
  try {
    res = await worker.fetch(new Request("https://t.hamikdash.co.il/api/personal/" + action, init), env);
  } finally {
    release();
  }
  return { status: res.status, headers: res.headers, data: await res.json() };
}

const LIST = {
  people: [
    { id: "p1", name: "יוסי", parent: "שרה", gender: "m", birth: { year: 5773, month: 9, day: 12 } },
    { name: "רחל לאה", parent: "", gender: "f", birth: { year: 5784, month: 12, day: 30 } },
  ],
  ranges: [{ from: 1, to: 10 }, { from: 20, to: 20 }],
  settings: { nameVerses: true, noTachanunPerek20: false, requestChapters: true, requests: ["refua", "parnasa"] },
};

// ---- מזהה ----
const ids = new Set();
for (let i = 0; i < 2000; i++) ids.add(newPersonalId());
const one = newPersonalId();
check("מזהה: 24 תווי base64url (144 ביט)", /^[A-Za-z0-9_-]{24}$/.test(one), one.length);
check("מזהה: 2000 הגרלות בלי כפילות", ids.size === 2000);
check("validId דוחה קצר ותווים זרים", !validId("abc") && !validId("a".repeat(23) + "!") && !validId(null));

// ---- אימות ----
check("רשימה תקינה עוברת", !cleanList(LIST).error);
check("רשימה ריקה עוברת עם ברירות מחדל",
  JSON.stringify(cleanList({}).list) === '{"people":[],"ranges":[],"settings":{"nameVerses":false,"noTachanunPerek20":false,"requestChapters":false,"requests":[]}}');
const many = { people: Array.from({ length: 101 }, () => LIST.people[0]) };
check("101 אנשים נדחה", cleanList(many).error === "too_many_people");
check("100 אנשים עובר", !cleanList({ people: Array.from({ length: 100 }, () => LIST.people[0]) }).error);
check("טווח 0 נדחה", cleanList({ ranges: [{ from: 0, to: 3 }] }).error === "bad_field:ranges.0.from");
check("טווח 151 נדחה", cleanList({ ranges: [{ from: 1, to: 151 }] }).error === "bad_field:ranges.0.to");
check("טווח הפוך נדחה", cleanList({ ranges: [{ from: 9, to: 3 }] }).error === "bad_field:ranges.0.to");
check("טווח לא שלם נדחה", cleanList({ ranges: [{ from: 1.5, to: 3 }] }).error === "bad_field:ranges.0.from");
check("שדה לא מוכר נדחה בשמו", cleanList({ people: [], foo: 1 }).error === "unknown_field:foo");
check("שדה לא מוכר באדם נדחה", cleanList({ people: [Object.assign({ phone: "050" }, LIST.people[0])] }).error === "unknown_field:people.0.phone");
check("שם עם תג HTML נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { name: "<b>x</b>" })] }).error === "bad_field:people.0.name");
check("שם ארוך מ-40 נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { name: "א".repeat(41) })] }).error === "bad_field:people.0.name");
check("שם ריק נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { name: "  " })] }).error === "bad_field:people.0.name");
check("שם בלועזית עובר", !cleanList({ people: [Object.assign({}, LIST.people[0], { name: "Yossi" })] }).error);
check("מין לא מוכר נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { gender: "x" })] }).error === "bad_field:people.0.gender");
check("חודש 14 נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { birth: { year: 5780, month: 14, day: 1 } })] }).error === "bad_field:people.0.birth.month");
check("יום 31 נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { birth: { year: 5780, month: 1, day: 31 } })] }).error === "bad_field:people.0.birth.day");
check("יום כמחרוזת נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { birth: { year: 5780, month: 1, day: "1" } })] }).error === "bad_field:people.0.birth.day");
check("מתג שאינו בוליאני נדחה", cleanList({ settings: { nameVerses: "yes" } }).error === "bad_field:settings.nameVerses");
check("בקשה עם תו זר נדחית", cleanList({ settings: { requests: ["רפואה"] } }).error === "bad_field:settings.requests");
check("שם קצר בתבנית d/m/y הישנה נדחה", cleanList({ people: [Object.assign({}, LIST.people[0], { birth: { d: 1, m: 1, y: 5780 } })] }).error === "unknown_field:people.0.birth.d");
check("רווחים כפולים בשם מצטמצמים", cleanList({ people: [Object.assign({}, LIST.people[0], { name: "  רחל   לאה " })] }).list.people[0].name === "רחל לאה");

// ---- הנתיבים ----
let r = await api("create", { list: LIST });
check("create: 200 ומזהה תקין", r.status === 200 && r.data.ok && validId(r.data.id), JSON.stringify(r.data).slice(0, 80));
check("create: no-store", r.headers.get("cache-control") === "no-store");
check("create: CORS למקור האתר", r.headers.get("access-control-allow-origin") === "https://hamikdash.co.il");
check("create: הרשימה חוזרת מנוקה", JSON.stringify(r.data.list) === JSON.stringify(cleanList(LIST).list));
check("create: חותמות זמן", r.data.createdAt > 0 && r.data.updatedAt === r.data.createdAt);
const id1 = r.data.id;
check("הרשימות במופע personal ולא במופע global", !!instances.personal && !instances.global);

r = await api("get", { id: id1 });
check("get: מחזיר את הרשימה", r.status === 200 && r.data.ok && r.data.list.people.length === 2 && r.data.list.ranges[0].to === 10);

const t0 = r.data.updatedAt;
const L2 = JSON.parse(JSON.stringify(LIST));
L2.people.pop();
r = await api("update", { id: id1, list: L2, baseUpdatedAt: t0 });
check("update עם baseUpdatedAt נכון", r.status === 200 && r.data.ok && r.data.list.people.length === 1 && r.data.updatedAt > t0);
r = await api("update", { id: id1, list: LIST, baseUpdatedAt: t0 });
check("update עם baseUpdatedAt ישן - 409 עם הגרסה הנוכחית", r.status === 409 && r.data.error === "conflict" && r.data.list.people.length === 1);
r = await api("update", { id: id1, list: LIST });
check("update בלי baseUpdatedAt - דורס", r.status === 200 && r.data.list.people.length === 2);
r = await api("update", { id: id1, list: { people: "x" } });
check("update עם קלט פסול - 400 והרשימה לא נפגעה", r.status === 400 && (await api("get", { id: id1 })).data.list.people.length === 2);

r = await api("rotate", { id: id1 });
const id2 = r.data.id;
check("rotate: מזהה חדש, אותה רשימה", r.status === 200 && validId(id2) && id2 !== id1 && r.data.list.people.length === 2);
r = await api("get", { id: id1 });
check("rotate: הישן מחזיר 404", r.status === 404 && r.data.error === "not_found");
r = await api("update", { id: id1, list: LIST });
check("rotate: הישן לא ניתן לעדכון", r.status === 404);
r = await api("get", { id: id2 });
check("rotate: החדש עובד", r.status === 200 && r.data.ok);

r = await api("delete", { id: id2 });
check("delete: ok", r.status === 200 && r.data.deleted === true);
r = await api("get", { id: id2 });
check("delete: אחרי המחיקה 404", r.status === 404);
const left = instances.personal.db.prepare("SELECT COUNT(*) AS n FROM plist").get().n;
check("delete: אין שורה שנשארה במסד", left === 0, "rows=" + left);
r = await api("delete", { id: id2 });
check("delete חוזר - 404", r.status === 404);

// ---- הגנות ----
r = await api("get", { id: "short" });
check("מזהה פסול - 400", r.status === 400 && r.data.error === "bad_request");
r = await api("get", null, { method: "GET" });
check("GET - 405", r.status === 405);
r = await api("create", "{not json");
check("JSON שבור - 400", r.status === 400 && r.data.error === "bad_json");
r = await api("create", JSON.stringify({ list: { people: [] }, pad: "x".repeat(MAX_BODY) }));
check("גוף גדול מדי - 413", r.status === 413 && r.data.error === "too_large");
r = await api("frobnicate", { id: id1 });
check("פעולה לא מוכרת - 404", r.status === 404 && r.data.error === "unknown_action");
r = await api("get/" + id1, {});
check("מזהה בכתובת אינו נתמך", r.status === 404 && r.data.error === "unknown_action");
r = await api("create", { list: LIST }, { origin: "https://evil.example" });
check("מקור זר אינו מקבל את המקור שלו ב-CORS", r.headers.get("access-control-allow-origin") === "https://hamikdash.co.il");
const id3 = r.data.id;

// המזהה לא מופיע בשום לוג
const leaked = logs.filter((l) => l.includes(id1) || l.includes(id2) || (id3 && l.includes(id3)));
check("שום לוג לא מכיל מזהה", leaked.length === 0, "logs=" + logs.length);
check("הקוד עצמו בלי console", !/console\./.test((await import("node:fs")).readFileSync(new URL("./tehillim-personal.js", import.meta.url), "utf8")));

// ---- הנתיבים הקיימים לא נשברו ----
const h = await worker.fetch(new Request("https://t.hamikdash.co.il/health"), env);
check("/health עדיין עונה", h.status === 200 && (await h.json()).ok === true);
const pre = await worker.fetch(new Request("https://t.hamikdash.co.il/api/personal/create", { method: "OPTIONS", headers: { Origin: "https://t.hamikdash.co.il" } }), env);
check("OPTIONS מחזיר 204 עם POST", pre.status === 204 && pre.headers.get("access-control-allow-methods").includes("POST"));

console.log(fails ? `\n${fails} נכשלו` : "\nהכל עבר");
process.exit(fails ? 1 : 0);
