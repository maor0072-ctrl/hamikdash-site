import { Miniflare } from "miniflare";
const R = "/home/user/hamikdash-site/worker";
const mf = new Miniflare({
  modules: true, scriptPath: R + "/tehillim.js", modulesRoot: R,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
  compatibilityDate: "2025-01-01",
  bindings: { TEHILLIM_TOKEN_SECRET: "test-secret" },
  durableObjects: { BOOK: { className: "BookDO", useSQLite: true }, COUNTER: { className: "CounterDO", useSQLite: true } },
});
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (x ? "   " + x : "")); if (!c) fails++; };
const call = async (path, body) => {
  const r = await mf.dispatchFetch("https://t.hamikdash.co.il" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return r;
};
const open = (name, extra) => call("/api/book", Object.assign({ patientName: name, motherName: "פנינה", gender: "f", openerName: "בדיקה", openerPhone: "0501234567", openerEmail: "a@b.co" }, extra)).then(r => r.json());

const page0 = await (await call("/sfarim")).text();
check("קטלוג בלי ספרים: כולל קריאה כללית בלבד", page0.includes("להצלחת תורמי העמותה") && (page0.match(/class="bk"/g) || []).length === 1);

const a = await open("שרה", { listed: true });
const b = await open("רחל");                       // בלי listed
const c = await open("לאה", { listed: false });
check("שלושה ספרים נפתחו", a.ok && b.ok && c.ok);
let page = await (await call("/sfarim")).text();
check("רשום מופיע", page.includes("שרה בת פנינה"));
check("ללא סימון לא מופיע", !page.includes("רחל בת פנינה"));
check("listed:false לא מופיע", !page.includes("לאה בת פנינה"));
check("קישור קצר לספר", page.includes("https://t.hamikdash.co.il/" + a.id));

// נתיב השאלה: JSON
const j = await (await call("/api/catalog")).json();
check("api/catalog", j.ok && j.books.length === 2 && j.books[0].klali, JSON.stringify(j.books.map(x => x.label)));

// מספרים חיים: לוקחים וקוראים פרק
await call("/api/book/" + a.id + "/take", { readerKey: "r1", readerName: "דני", idxs: [0, 1] });
await call("/api/book/" + a.id + "/read", { readerKey: "r1", idxs: [0] });
const j2 = await (await call("/api/catalog")).json();
const mine = j2.books.find(x => x.id === a.id);
check("מספרים חיים: נקרא 1, פנויים 148", mine.st.read === 1 && mine.st.free === 148, JSON.stringify(mine.st));

// ניהול: הפעלה ל-b וכיבוי ל-a
const mt = (u) => u.split("/m/")[1];
const stA = await (await call("/api/manage/" + mt(a.manageUrl) + "/state")).json();
const stB = await (await call("/api/manage/" + mt(b.manageUrl) + "/state")).json();
check("state מדווח listed", stA.listed === 1 && stB.listed === 0, stA.listed + "/" + stB.listed);
let r = await (await call("/api/manage/" + mt(b.manageUrl) + "/listing", { listed: true })).json();
check("הפעלה בניהול", r.ok);
r = await (await call("/api/manage/" + mt(a.manageUrl) + "/listing", { listed: false })).json();
page = await (await call("/sfarim")).text();
check("אחרי המתג: b נכנס ו-a יצא", page.includes("רחל בת פנינה") && !page.includes("שרה בת פנינה"));
// טוקן ניהול מזויף
const bad = await call("/api/manage/" + a.id + ".AAAAAAAAAAAAAAAAAAAAAA/listing", { listed: true });
check("טוקן מזויף נדחה", bad.status === 403);
// טוקן ציבורי לא פותח ניהול
const bad2 = await call("/api/manage/" + a.id + "/listing", { listed: true });
check("מזהה ציבורי לא מנהל", bad2.status === 403);

// סגירת ספר מוציאה אותו: קוראים את כל 171 היחידות ב-b
const all = Array.from({ length: 171 }, (_, i) => i);
for (let k = 0; k < all.length; k += 30) await call("/api/book/" + b.id + "/read", { readerKey: "r2", idxs: all.slice(k, k + 30) });
page = await (await call("/sfarim")).text();
check("ספר שהושלם יוצא", !page.includes("רחל בת פנינה"));
// הספר הרגיל עדיין עובד
const stt = await (await call("/api/book/" + a.id + "/state")).json();
check("מצב ספר רגיל לא נפגע", stt.ok && stt.counts.read === 1, JSON.stringify(stt.counts));
// ספר שלא קיים ברישום אך נרשם -> לא קורס
await call("/api/manage/" + mt(a.manageUrl) + "/listing", { listed: true });
check("health", (await (await call("/health")).json()).ok);
console.log(fails ? "\nFAILED " + fails : "\nכל הבדיקות עברו");
await mf.dispose();
process.exit(fails ? 1 : 0);
