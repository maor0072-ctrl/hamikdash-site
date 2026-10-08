import { Miniflare } from "miniflare";
import fs from "fs";
import { chromium } from "playwright-core";
const R = "/home/user/hamikdash-site"; const W = R + "/worker";
const GRP = "https://chat.whatsapp.com/" + "Q".repeat(22);
const local = (p) => { const f = R + p; return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
const mf = new Miniflare({ modules: true, scriptPath: W + "/tehillim.js", modulesRoot: W,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }], compatibilityDate: "2025-01-01",
  bindings: { TEHILLIM_TOKEN_SECRET: "s" },
  durableObjects: { BOOK: { className: "BookDO", useSQLite: true }, COUNTER: { className: "CounterDO", useSQLite: true } },
  outboundService: async (req) => {
    const u = new URL(req.url); const f = local(u.pathname);
    if (u.pathname === "/tehillim/groups.json") return new Response(JSON.stringify({ groups: [{ n: 1, url: GRP, full: false }] }));
    return f ? new Response(fs.readFileSync(f)) : new Response("nf", { status: 404 });
  } });
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
const ct = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };
await ctx.route("https://t.hamikdash.co.il/**", async (route) => {
  const rq = route.request(); const r = await mf.dispatchFetch(rq.url(), { method: rq.method(), headers: rq.headers(), body: rq.postData() || undefined, redirect: "manual" });
  await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
});
await ctx.route("https://hamikdash.co.il/**", async (route) => {
  const u = new URL(route.request().url()); const f = local(u.pathname === "/" ? "/index.html" : u.pathname);
  if (!f) return route.fulfill({ status: 404, body: "nf" });
  const ext = f.slice(f.lastIndexOf(".")); await route.fulfill({ status: 200, contentType: ct[ext] || "application/octet-stream", body: fs.readFileSync(f) });
});
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
let ok = 0, bad = 0; const t = (n, c) => { console.log((c ? "  PASS  " : "  FAIL  ") + n); c ? ok++ : bad++; };

await pg.goto("https://hamikdash.co.il/tehillim.html");
t("דלת הקטלוג קיימת", await pg.locator('a.door[href="https://t.hamikdash.co.il/sfarim"]').count() === 1);
await pg.click('[data-go="form"]');
await pg.fill("#patientName", "שרה"); await pg.fill("#motherName", "פנינה"); await pg.selectOption("#gender", "f");
await pg.fill("#openerName", "בדיקה"); await pg.fill("#openerPhone", "0501234567"); await pg.fill("#openerEmail", "a@b.co");
// קבוצה פגומה נחסמת בלקוח
await pg.fill("#groupUrl", "https://evil.com/x"); await pg.click("#submit-btn");
t("קבוצה פגומה נחסמת בטופס", (await pg.textContent("#form-msg")).includes("וואטסאפ"));
await pg.fill("#groupUrl", GRP + "?mode=x");
let MAN = null; pg.on("response", async (r) => { if (r.url().endsWith("/api/book") && r.request().method() === "POST") { try { MAN = (await r.json()).manageUrl; } catch (e) {} } });
await pg.check("#listed");
await pg.click("#submit-btn");
await pg.waitForSelector("#view-done.on");
t("מסך הספר נפתח", true);
await pg.waitForFunction(() => document.getElementById("grp-done").style.display === "");
t("כפתור הקבוצה הכללית מוצג כשיש קבוצה", (await pg.getAttribute("#grp-done", "href")) === "https://t.hamikdash.co.il/kvutza");
const bookUrl = await pg.inputValue("#pub-link");
const cat = await (await mf.dispatchFetch("https://t.hamikdash.co.il/sfarim")).text();
t("הספר שסומן הופיע בקטלוג", cat.includes("שרה בת פנינה"));
await pg.screenshot({ path: "done.png", fullPage: true });

await pg.goto(bookUrl);
await pg.waitForSelector("#view-grid.on");
await pg.waitForTimeout(400);
t("קבוצת הספר מוצגת בראש הספר", (await pg.isVisible("#bk-grp")) && (await pg.getAttribute("#bk-grp-a", "href")).startsWith("https://chat.whatsapp.com/"));
// קורא פרק עד מסך הסיום
await pg.click('.cellu[data-i="0"], .cellu >> nth=0').catch(()=>{});
t("כפתור קבוצה במסך הסיום מוכן", (await pg.getAttribute("#grp-end", "href")) === "https://t.hamikdash.co.il/kvutza" && (await pg.evaluate(() => document.getElementById("grp-end").style.display)) === "");
const manageUrl = await (async () => { const m = await pg.evaluate(() => null); return null; })();
console.log("errors:", errs);
t("אין שגיאות JS", errs.length === 0);
await pg.screenshot({ path: "book.png" });
await pg.goto(MAN); await pg.waitForSelector("#app:not(.hidden)");
t("מנהל: מוצג כרשום", (await pg.textContent("#listing-state")).includes("מוצג כרגע"));
await pg.click("#listing-btn"); await pg.waitForFunction(() => document.getElementById("listing-state").textContent.includes("אינו מוצג"));
t("מנהל: הסרה עובדת בלחיצה", !(await (await mf.dispatchFetch("https://t.hamikdash.co.il/sfarim")).text()).includes("שרה בת פנינה"));
await pg.click("#listing-btn"); await pg.waitForFunction(() => document.getElementById("listing-state").textContent.includes("מוצג כרגע"));
t("מנהל: החזרה עובדת", (await (await mf.dispatchFetch("https://t.hamikdash.co.il/sfarim")).text()).includes("שרה בת פנינה"));
await pg.screenshot({ path: "manage.png", fullPage: true });
t("אין שגיאות JS במנהל", errs.length === 0);
console.log(ok + " עברו, " + bad + " נכשלו");
await br.close(); await mf.dispose(); process.exit(bad ? 1 : 0);
