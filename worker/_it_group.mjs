import { Miniflare } from "miniflare";
const R = "/home/user/hamikdash-site/worker";
let FIX = '{"groups":[]}';
const mf = new Miniflare({
  modules: true, scriptPath: R + "/tehillim.js", modulesRoot: R,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }], compatibilityDate: "2025-01-01",
  bindings: { TEHILLIM_TOKEN_SECRET: "s" },
  durableObjects: { BOOK: { className: "BookDO", useSQLite: true }, COUNTER: { className: "CounterDO", useSQLite: true } },
  outboundService: async (req) => {
    if (new URL(req.url).pathname === "/tehillim/groups.json") return new Response(FIX, { headers: { "content-type": "application/json" } });
    return new Response("nope", { status: 404 });
  },
});
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (x ? "   " + x : "")); if (!c) fails++; };
const call = (p, b) => mf.dispatchFetch("https://t.hamikdash.co.il" + p, Object.assign(b ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) } : {}, { redirect: "manual" }));
const G = (n, c) => "https://chat.whatsapp.com/" + String(c).repeat(22);

// קובץ ריק
let r = await call("/kvutza");
check("ריק: 404 ולא קריסה", r.status === 404 && (await r.text()).includes("עדיין לא נפתחה"));
let j = await (await call("/api/group")).json();
check("ריק: api/group ok:false", j.ok === false);
let cat = await (await call("/sfarim")).text();
check("ריק: אין כפתור בקטלוג", !cat.includes("קבוצת הוואטסאפ"));

// שלוש קבוצות: 1 מלאה, 2 עם כתובת פגומה, 3 תקינה, מסודרות לא לפי הסדר
FIX = JSON.stringify({ groups: [
  { n: 3, url: G(3, "C"), full: false },
  { n: 1, url: G(1, "A"), full: true },
  { n: 2, url: "http://chat.whatsapp.com/" + "B".repeat(22), full: false },
]});
await new Promise(r => setTimeout(r, 10));
r = await call("/kvutza");
check("מדלג על מלאה ועל פגומה: מפנה ל-3", r.status === 302 && r.headers.get("location") === G(3, "C"), r.status + " " + r.headers.get("location"));
j = await (await call("/api/group")).json();
check("api/group מחזיר את הכתובת הקבועה ולא של וואטסאפ", j.ok && j.url === "https://t.hamikdash.co.il/kvutza" && j.n === 3, JSON.stringify(j));
cat = await (await call("/sfarim")).text();
check("קטלוג: כפתור קבוצה מופיע", cat.includes('href="https://t.hamikdash.co.il/kvutza"'));

// כתובות עוינות
for (const bad of ["javascript:alert(1)", "https://evil.com/https://chat.whatsapp.com/" + "A".repeat(22), "https://chat.whatsapp.com.evil.com/" + "A".repeat(22), "https://chat.whatsapp.com/short", "https://chat.whatsapp.com/" + "A".repeat(22) + "\r\nSet-Cookie: x=1"]) {
  FIX = JSON.stringify({ groups: [{ n: 1, url: bad, full: false }] });
  await new Promise(r => setTimeout(r, 10));
  const rr = await call("/kvutza");
  check("נדחה: " + JSON.stringify(bad).slice(0, 50), rr.status === 404, String(rr.status));
}
// קובץ שבור
FIX = "{not json";
r = await call("/kvutza"); check("JSON שבור: 404 ולא 500", r.status === 404, String(r.status));
// קישור עם query תקין
FIX = JSON.stringify({ groups: [{ n: 1, url: G(1, "A") + "?mode=ems_copy_c", full: false }] });
r = await call("/kvutza"); check("query תקין עובר", r.status === 302);

// קבוצה לכל ספר
const base = { patientName: "שרה", motherName: "פנינה", gender: "f", openerName: "x", openerPhone: "0501234567", openerEmail: "a@b.co" };
let b = await (await call("/api/book", Object.assign({}, base, { groupUrl: G(0, "Z") }))).json();
check("ספר עם קבוצה נפתח", b.ok);
let st = await (await call("/api/book/" + b.id + "/state")).json();
check("הקבוצה חוזרת ב-state", st.groupUrl === G(0, "Z"));
r = await call("/api/book", { method: "POST", ...{} });
const bad = await call("/api/book", Object.assign({}, base, { groupUrl: "javascript:alert(1)" }));
check("קבוצת ספר פגומה נדחית 400", bad.status === 400 && (await bad.json()).error === "bad_group");
b = await (await call("/api/book", base)).json();
st = await (await call("/api/book/" + b.id + "/state")).json();
check("בלי קבוצה: ריק", b.ok && st.groupUrl === "");
console.log(fails ? "\nFAILED " + fails : "\nכל הבדיקות עברו");
await mf.dispose(); process.exit(fails ? 1 : 0);
