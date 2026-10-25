// בס"ד
// hamikdash-matana - רישום עניין במהדורה האלקטרונית של „רק הנשמה".
// הטופס בדף /matana/ שולח לכאן (ראוט hamikdash.co.il/api/matana), וכל נרשם
// נכתב כשורה בגיליון גוגל דרך ה-proxy של Composio. אישור יעקב 25.10.2026.
// אין כאן שליחה החוצה לנרשם - רק כתיבה לגיליון של העמותה.

const SHEET_ID = "1u-oYJQaiFqG_VJiwIL7r3Gn5HMjIx9sWvzAmu8K04hs";
const COMPOSIO_USER = "maor0072@gmail.com";
const SHEETS_ACCOUNT = "ca_vYAFkkVO1drE";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function clean(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

async function appendRow(env, row) {
  const res = await fetch("https://backend.composio.dev/api/v3/tools/execute/proxy", {
    method: "POST",
    headers: { "x-api-key": env.COMPOSIO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: COMPOSIO_USER,
      connected_account_id: SHEETS_ACCOUNT,
      endpoint: "https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID +
        "/values/A1:E1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
      method: "POST",
      body: { values: [row] },
    }),
  });
  // 200 של ה-proxy אינו הצלחה; הסטטוס של גוגל יושב בפנים.
  if (!res.ok) { console.log("proxy failed", res.status); return false; }
  const out = await res.json().catch(() => null);
  const ok = out && out.status >= 200 && out.status < 300;
  if (!ok) console.log("sheets rejected", JSON.stringify(out).slice(0, 400));
  return ok;
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
    let data = {};
    try {
      const ct = request.headers.get("Content-Type") || "";
      if (ct.includes("application/json")) data = await request.json();
      else data = Object.fromEntries((await request.formData()).entries());
    } catch (e) {
      return json({ ok: false, error: "bad body" }, 400);
    }
    if (data.website) return json({ ok: true }); // מלכודת בוטים: שדה נסתר שאדם לא ממלא
    const name = clean(data.gname, 80);
    const mail = clean(data.gmail, 120);
    const phone = clean(data.gphone, 30);
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ ok: false, error: "fields" }, 400);
    const when = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const ok = await appendRow(env, [when, name, mail, phone, clean(data.src || "matana", 40)]);
    return json({ ok }, ok ? 200 : 502);
  },
};
