// בדיקת רכיב א של בניית 5.11.2026: הספר הרדום שהופך לכללי (ה5), הפרק המוצע (ה1)
// ובסיס המונה (ה3). פונקציות טהורות, ואחריהן הנתיבים עצמם מול Durable Objects
// מדומים - בלי miniflare ובלי רשת. מריצים: node worker/_test_general.mjs
import { isIdle, isGeneral, pickGeneral, pickSuggest, selectItems, renderCatalog, IDLE_MS } from "./tehillim-catalog.js";
import { UNITS } from "./tehillim-units.js";
import worker from "./tehillim.js";

let fails = 0;
function check(name, cond, extra) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (extra ? "   " + extra : ""));
  if (!cond) fails++;
}
const N = UNITS.length;
const NOW = Date.parse("2026-11-05T12:00:00+02:00");
const DAY = 86400000;
const row = (o) => Object.assign({ ok: true, exists: true, status: "open", kind: "private", cycle: 0,
  patientName: "חנה", motherName: "פנינה", gender: "f", intent: "refua", targetDate: "",
  createdAt: NOW - 30 * DAY, lastMarkAt: 0, states: "f".repeat(N), id: "abc" }, o);

// ---- רדום ----
check("14 יום בדיוק אינו רדום", !isIdle(row({ createdAt: NOW - IDLE_MS }), NOW));
check("ספר בן 15 יום בלי סימון - רדום", isIdle(row({ createdAt: NOW - 15 * DAY }), NOW));
check("ספר ישן שסומן לפני 3 ימים - לא רדום", !isIdle(row({ lastMarkAt: NOW - 3 * DAY }), NOW));
check("ספר ישן שסומן לפני 20 יום - רדום", isIdle(row({ lastMarkAt: NOW - 20 * DAY }), NOW));
check("ספר חדש (5 ימים) - לא רדום", !isIdle(row({ createdAt: NOW - 5 * DAY }), NOW));
check("klali לעולם אינו רדום", !isIdle(row({ kind: "klali", createdAt: NOW - 400 * DAY }), NOW));
check("ספר סגור אינו רדום", !isIdle(row({ status: "closed" }), NOW));
check("סבב שני אינו רדום (הספר הושלם)", !isIdle(row({ cycle: 2 }), NOW));
check("ספר שכל פרקיו נקראו אינו רדום", !isIdle(row({ states: "r".repeat(N) }), NOW));
check("דביק: סומן כללי ונקרא אתמול - עדיין כללי", isGeneral(row({ lastMarkAt: NOW - DAY }), NOW, { abc: 1 }));
check("דביק אינו גובר על השלמה", !isGeneral(row({ cycle: 2 }), NOW, { abc: 1 }));

// ---- בחירת הספר הכללי ----
const g = pickGeneral([
  row({ id: "young", createdAt: NOW - 20 * DAY }),
  row({ id: "old", createdAt: NOW - 40 * DAY }),
  row({ id: "active", createdAt: NOW - 60 * DAY, lastMarkAt: NOW - DAY }),
  row({ id: "klali", kind: "klali", createdAt: NOW - 400 * DAY }),
  null,
], NOW, {});
check("הוותיק מבין הרדומים", g && g.id === "old", g && g.id);
check("אין רדום - null", pickGeneral([row({ lastMarkAt: NOW - DAY })], NOW, {}) === null);

// ---- הפרק המוצע ----
const U = (s, extra) => s.split("").map((c, i) => Object.assign({ i: i, s: c === "f" ? "free" : c === "t" ? "taken" : "read", mine: 0 }, (extra || {})[i] || {}));
check("הפנוי הראשון בסדר", JSON.stringify(pickSuggest(U("rtftf"))) === '{"idx":2,"state":"free"}');
check("אין פנוי - נבחר שלא נקרא, קודם שלי", JSON.stringify(pickSuggest(U("rtrt", { 3: { mine: 1 } }))) === '{"idx":3,"state":"taken"}');
check("אין פנוי ואין שלי - הנבחר הראשון", JSON.stringify(pickSuggest(U("rtrt"))) === '{"idx":1,"state":"taken"}');
check("הכל נקרא - null", pickSuggest(U("rrr")) === null);

// ---- קטלוג: תגיות ----
const items = selectItems([
  row({ id: "idle", createdAt: NOW - 40 * DAY, targetDate: "2026-09-24" }),
  row({ id: "past", createdAt: NOW - 40 * DAY, lastMarkAt: NOW - DAY, targetDate: "2026-09-24" }),
  row({ id: "future", createdAt: NOW - DAY, targetDate: "2026-12-01" }),
  row({ id: "klali", kind: "klali", title: "הקריאה הכללית" }),
], NOW, {});
const html = renderCatalog(items, {});
const li = (id) => html.slice(html.lastIndexOf('<li class="bk">', html.indexOf("/" + id + '"')), html.indexOf("/" + id + '"'));
check("רדום: תג ספר כללי במקום יעד", li("idle").includes("ספר כללי - פתוח לכל מי שרוצה לקרוא") && !li("idle").includes("24.09.2026"));
check("יעד שעבר ולא רדום", li("past").includes("היעד המקורי היה 24.09.2026. הספר טרם הושלם."));
check("יעד עתידי", li("future").includes("תאריך יעד 01.12.2026"));
check("הכללית: פתוח תמיד וכפתור משלה", li("klali").includes("הספר הכללי, פתוח תמיד") && html.includes("לקריאה בספר הכללי"));
check("מלל: נקראו X מתוך 150. עוד Y", html.includes("נקראו 0 מתוך 150 פרקים. עוד 150 פרקים להשלמת הספר."));
check("כותרת וכפתור לפי הנספח", html.includes("<h1>מצטרפים לקריאת תהילים</h1>") && html.includes("לקריאה בספר הזה") &&
  html.includes("רוצים לפתוח ספר עבור אדם יקר?") && html.includes("לפתיחת ספר חדש"));
check("אין מקף ארוך", !/[–—]/.test(html));

// ---- הנתיבים מול DO מדומים ----
const books = {
  klali: row({ id: "klali", kind: "klali", createdAt: NOW - 400 * DAY }),
  OLD1: row({ id: "OLD1", createdAt: NOW - 40 * DAY }),
  NEW1: row({ id: "NEW1", createdAt: NOW - 2 * DAY }),
};
const counterC = { total: 46, books: 11, done: 0 };
const gen = {};
const calls = [];
function stub(name, handler) { return { fetch: async (u, init) => {
  const op = new URL(u).pathname.slice(1);
  const body = init && init.body ? JSON.parse(init.body) : {};
  calls.push(name + ":" + op);
  return new Response(JSON.stringify(handler(op, body)));
} }; }
const env = {
  TEHILLIM_TOKEN_SECRET: "test",
  BOOK: { idFromName: (n) => n, get: (id) => stub(id, (op, body) => {
    const b = books[id];
    if (op === "counts") return b || { ok: true, exists: false };
    if (op === "reopen") return { ok: true, cycle: 1 };
    if (op === "state") {
      if (!b) return { ok: true, createdAt: 0, units: [] };
      const units = b.states.split("").map((c, i) => ({ i: i, s: c === "f" ? "free" : c === "t" ? "taken" : "read", mine: 0 }));
      const read = units.filter((u) => u.s === "read").length;
      return { ok: true, status: b.status, createdAt: b.createdAt, units: units, counts: { total: units.length, read: read } };
    }
    return { ok: false, error: "unexpected:" + op };
  }) },
  COUNTER: { idFromName: (n) => n, get: () => stub("counter", (op, body) => {
    if (op === "catalog-list") return { ok: true, books: [{ id: "OLD1" }, { id: "NEW1" }] };
    if (op === "gen-list") return { ok: true, general: Object.assign({}, gen) };
    if (op === "gen-mark") { for (const id of body.ids) gen[id] = NOW; return { ok: true }; }
    return Object.assign({ ok: true, today: 0, month: 0 }, counterC);
  }) },
};
const get = async (p) => (await worker.fetch(new Request("https://t.hamikdash.co.il" + p), env)).json();

let r = await get("/api/stats");
check("stats: total = מונה + 2700", r.total === 2746, JSON.stringify(r));
check("stats: booksDone = הושלמו + 18, today/month בלי בסיס", r.booksDone === 18 && r.today === 0 && r.month === 0 && r.books === 11);

r = await get("/api/general");
check("general: הרדום הוותיק", r.ok && r.token === "OLD1" && r.idle === true && r.url === "https://t.hamikdash.co.il/OLD1", JSON.stringify(r));
check("general: נרשם כדביק", gen.OLD1 === NOW || gen.OLD1 > 0);
books.OLD1.lastMarkAt = Date.now() - DAY; // מישהו קרא בו אתמול
r = await get("/api/general");
check("general: דביק נשאר כללי אחרי קריאה", r.token === "OLD1", JSON.stringify(r));
books.OLD1.cycle = 2; // הושלם ונפתח לסבב נוסף
r = await get("/api/general");
check("general: אין כללי - klali", r.ok && r.token === "klali" && r.idle === false && r.title.length > 10, JSON.stringify(r));

calls.length = 0;
books.NEW1.states = "rrt" + "f".repeat(N - 3);
r = await get("/api/book/NEW1/suggest?rk=r123");
check("suggest: הפנוי הראשון", r.ok && r.idx === 3 && r.state === "free" && r.unit.ch === 4 && r.unit.min >= 1 && r.left === N - 2, JSON.stringify(r));
check("suggest אינו קורא ל-take/read", !calls.some((c) => /:(take|read|release)$/.test(c)), calls.join());
books.NEW1.states = "r".repeat(N);
r = await get("/api/book/NEW1/suggest");
check("suggest: ספר שנקרא כולו - done", r.ok && r.idx === null && r.done === true, JSON.stringify(r));
const nb = await worker.fetch(new Request("https://t.hamikdash.co.il/api/book/NOSUCH/suggest"), env);
check("suggest: מזהה שאינו ספר - 404", nb.status === 404);

console.log(fails ? "\nFAILED: " + fails : "\nכל הבדיקות עברו");
process.exit(fails ? 1 : 0);
