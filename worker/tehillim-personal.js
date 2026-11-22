// תהילים אישי - שמירת הרשימה בשרת (22.11.2026).
//
// איפה זה נשמר, ולמה:
//   טבלה plist בתוך מופע נפרד של CounterDO בשם "personal" (לא המופע "global" של
//   המונה). כך אין מחלקה חדשה ואין migration בפריסה - אותו נימוק שבגללו הקטלוג
//   יושב ב-CounterDO - ובכל זאת הרשימות אינן מעורבבות עם המונה הגלובלי.
//   Durable Object ולא KV: לוורקר אין binding ל-KV בכלל, וה-DO עקבי מיד. אחרי
//   "החלפת קישור" הקישור הישן מפסיק לעבוד ברגע שהתשובה חזרה, ולא אחרי עד דקה
//   של מטמון KV; ומי שערך בטלפון אחד רואה את העריכה מיד בטלפון של בן הזוג.
//
// פרטיות:
//   המזהה עובר רק בגוף הבקשה (POST), לעולם לא בכתובת - כתובות נרשמות ביומני
//   הבקשות של קלאודפלייר, בכותרת Referer ובכלי מעקב. אין כאן שום הדפסה ללוג,
//   והשגיאות שחוזרות אינן מכילות את המזהה. הרשימה אינה מופיעה בקטלוג ובמונה.
//
// הנתיבים (כולם POST, גוף JSON, תשובה JSON עם Cache-Control: no-store):
//   /api/personal/create  {list}                      -> {ok, id, list, createdAt, updatedAt}
//   /api/personal/get     {id}                        -> {ok, id, list, createdAt, updatedAt}
//   /api/personal/update  {id, list, baseUpdatedAt?}  -> {ok, id, list, createdAt, updatedAt}
//   /api/personal/delete  {id}                        -> {ok, deleted: true}
//   /api/personal/rotate  {id}                        -> {ok, id: <חדש>, list, createdAt, updatedAt}
// הצורה המלאה מתועדת ב-plans/2026-11-22-tehillim-personal-progress.md.

export const PERSONAL_DO_NAME = "personal";
export const MAX_BODY = 48 * 1024; // 100 אנשים בשדות מלאים הם כ-20KB
export const MAX_PEOPLE = 100;
export const MAX_RANGES = 150;
export const MAX_REQUESTS = 30;

const ID_BYTES = 18; // 144 ביט, 24 תווי base64url בלי ריפוד
const PID_RE = /^[A-Za-z0-9_-]{24}$/;
const PERSON_ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const REQ_RE = /^[a-z0-9_-]{1,32}$/;
// אותיות מכל שפה (גם מי שכותב שם בלועזית), סימני ניקוד, רווח וגרש/מרכאות/מקף/נקודה.
// אין < > & / ותווי בקרה, ולכן אין מה להזריק לדף.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} '"`.\-]{0,39}$/u;

// ===== מזהה =====

function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newPersonalId() {
  const b = new Uint8Array(ID_BYTES);
  crypto.getRandomValues(b);
  return b64url(b);
}

export function validId(id) {
  return typeof id === "string" && PID_RE.test(id);
}

// ===== אימות הרשימה =====
// מחזיר {list} נקייה או {error}. שדה לא מוכר נדחה בשמו, ולא נבלע בשקט -
// כדי שמי שמוסיף שדה בצד הלקוח יגלה מיד שהשרת לא שומר אותו.

function onlyKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (allowed.indexOf(k) === -1) return "unknown_field:" + where + k;
  }
  return null;
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function cleanText(v, required) {
  if (v === undefined || v === null || v === "") return required ? null : "";
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s) return required ? null : "";
  return NAME_RE.test(s) ? s : null;
}

function intIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

function cleanPerson(p, i) {
  const at = "people." + i + ".";
  if (!isObj(p)) return { error: "bad_person:" + i };
  const bad = onlyKeys(p, ["id", "name", "parent", "gender", "birth"], at);
  if (bad) return { error: bad };
  const out = {};
  if (p.id !== undefined) {
    if (typeof p.id !== "string" || !PERSON_ID_RE.test(p.id)) return { error: "bad_field:" + at + "id" };
    out.id = p.id;
  }
  const name = cleanText(p.name, true);
  if (name === null) return { error: "bad_field:" + at + "name" };
  out.name = name;
  const parent = cleanText(p.parent, false);
  if (parent === null) return { error: "bad_field:" + at + "parent" };
  out.parent = parent;
  const g = p.gender === undefined || p.gender === null ? "" : p.gender;
  if (g !== "m" && g !== "f" && g !== "") return { error: "bad_field:" + at + "gender" };
  out.gender = g;
  const b = p.birth;
  if (!isObj(b)) return { error: "bad_field:" + at + "birth" };
  const badB = onlyKeys(b, ["year", "month", "day"], at + "birth.");
  if (badB) return { error: badB };
  // חודשים במספור של Hebcal: 1 ניסן ... 7 תשרי ... 12 אדר (או אדר א'), 13 אדר ב'.
  // אותה צורה כמו ב-tehillim/personal-core.js. האם היום קיים באותה שנה נבדק שם
  // (validateBirth), לא כאן - השרת בודק רק טווחים.
  if (!intIn(b.day, 1, 30)) return { error: "bad_field:" + at + "birth.day" };
  if (!intIn(b.month, 1, 13)) return { error: "bad_field:" + at + "birth.month" };
  if (!intIn(b.year, 5600, 6200)) return { error: "bad_field:" + at + "birth.year" };
  out.birth = { year: b.year, month: b.month, day: b.day };
  return { person: out };
}

export function cleanList(list) {
  if (!isObj(list)) return { error: "bad_list" };
  const bad = onlyKeys(list, ["people", "ranges", "settings"], "");
  if (bad) return { error: bad };

  const peopleIn = list.people === undefined ? [] : list.people;
  if (!Array.isArray(peopleIn)) return { error: "bad_field:people" };
  if (peopleIn.length > MAX_PEOPLE) return { error: "too_many_people" };
  const people = [];
  for (let i = 0; i < peopleIn.length; i++) {
    const r = cleanPerson(peopleIn[i], i);
    if (r.error) return r;
    people.push(r.person);
  }

  const rangesIn = list.ranges === undefined ? [] : list.ranges;
  if (!Array.isArray(rangesIn)) return { error: "bad_field:ranges" };
  if (rangesIn.length > MAX_RANGES) return { error: "too_many_ranges" };
  const ranges = [];
  for (let i = 0; i < rangesIn.length; i++) {
    const r = rangesIn[i];
    const at = "ranges." + i + ".";
    if (!isObj(r)) return { error: "bad_field:ranges." + i };
    const badR = onlyKeys(r, ["from", "to"], at);
    if (badR) return { error: badR };
    if (!intIn(r.from, 1, 150)) return { error: "bad_field:" + at + "from" };
    if (!intIn(r.to, 1, 150)) return { error: "bad_field:" + at + "to" };
    if (r.to < r.from) return { error: "bad_field:" + at + "to" };
    ranges.push({ from: r.from, to: r.to });
  }

  const sIn = list.settings === undefined ? {} : list.settings;
  if (!isObj(sIn)) return { error: "bad_field:settings" };
  const badS = onlyKeys(sIn, ["nameVerses", "noTachanunPerek20", "requestChapters", "requests"], "settings.");
  if (badS) return { error: badS };
  const settings = {};
  for (const k of ["nameVerses", "noTachanunPerek20", "requestChapters"]) {
    const v = sIn[k] === undefined ? false : sIn[k];
    if (typeof v !== "boolean") return { error: "bad_field:settings." + k };
    settings[k] = v;
  }
  const reqIn = sIn.requests === undefined ? [] : sIn.requests;
  if (!Array.isArray(reqIn) || reqIn.length > MAX_REQUESTS) return { error: "bad_field:settings.requests" };
  const requests = [];
  for (const x of reqIn) {
    if (typeof x !== "string" || !REQ_RE.test(x)) return { error: "bad_field:settings.requests" };
    if (requests.indexOf(x) === -1) requests.push(x);
  }
  settings.requests = requests;

  return { list: { people, ranges, settings } };
}

// ===== צד ה-Durable Object =====
// נקרא מתוך CounterDO.fetch כש-op מתחיל ב-"plist-". sql הוא ctx.storage.sql.
// ה-DO מריץ בקשה אחת בכל פעם ו-exec סינכרוני, ולכן החלפת מזהה (הכנסה + מחיקה)
// אינה נקטעת באמצע על ידי בקשה אחרת.

export function ensurePersonalTable(sql) {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS plist (" +
      "id TEXT PRIMARY KEY, data TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)"
  );
}

function rowOut(id, r) {
  return {
    ok: true,
    id: id,
    list: JSON.parse(r.data),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

function getRow(sql, id) {
  return sql.exec("SELECT data, createdAt, updatedAt FROM plist WHERE id = ?", id).toArray()[0] || null;
}

// updatedAt עולה תמיד, גם בשתי כתיבות באותה מילישנייה - הוא משמש לבדיקת baseUpdatedAt.
function stamp(prev) {
  const now = Date.now();
  return prev && now <= prev ? prev + 1 : now;
}

export function personalOp(sql, op, body) {
  ensurePersonalTable(sql);
  const b = body || {};
  if (op === "plist-create") {
    if (!validId(b.id) || typeof b.data !== "string") return { ok: false, error: "bad_request" };
    if (getRow(sql, b.id)) return { ok: false, error: "id_taken" };
    const now = Date.now();
    sql.exec("INSERT INTO plist (id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?)", b.id, b.data, now, now);
    return rowOut(b.id, getRow(sql, b.id));
  }
  if (!validId(b.id)) return { ok: false, error: "bad_request" };
  const r = getRow(sql, b.id);
  if (!r) return { ok: false, error: "not_found" };
  if (op === "plist-get") return rowOut(b.id, r);
  if (op === "plist-update") {
    if (typeof b.data !== "string") return { ok: false, error: "bad_request" };
    if (b.baseUpdatedAt !== undefined && b.baseUpdatedAt !== null && Number(b.baseUpdatedAt) !== Number(r.updatedAt)) {
      const cur = rowOut(b.id, r);
      cur.ok = false;
      cur.error = "conflict";
      return cur;
    }
    sql.exec("UPDATE plist SET data = ?, updatedAt = ? WHERE id = ?", b.data, stamp(Number(r.updatedAt)), b.id);
    return rowOut(b.id, getRow(sql, b.id));
  }
  if (op === "plist-delete") {
    sql.exec("DELETE FROM plist WHERE id = ?", b.id);
    return { ok: true, deleted: true };
  }
  if (op === "plist-rotate") {
    if (!validId(b.newId) || getRow(sql, b.newId)) return { ok: false, error: "id_taken" };
    sql.exec(
      "INSERT INTO plist (id, data, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
      b.newId,
      r.data,
      Number(r.createdAt),
      stamp(Number(r.updatedAt))
    );
    sql.exec("DELETE FROM plist WHERE id = ?", b.id);
    return rowOut(b.newId, getRow(sql, b.newId));
  }
  return { ok: false, error: "bad_op" };
}

// ===== צד ה-Worker =====

const STATUS = {
  bad_request: 400,
  bad_json: 400,
  bad_list: 400,
  too_large: 413,
  not_found: 404,
  conflict: 409,
  method_not_allowed: 405,
  unknown_action: 404,
  id_taken: 503,
};

function statusFor(err) {
  if (!err) return 200;
  if (STATUS[err]) return STATUS[err];
  if (/^(bad_|unknown_field|too_many)/.test(err)) return 400;
  return 502;
}

async function readBody(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return { error: "too_large" };
  let text;
  try {
    text = await request.text();
  } catch (e) {
    return { error: "bad_request" };
  }
  if (text.length > MAX_BODY) return { error: "too_large" };
  try {
    const v = JSON.parse(text || "{}");
    if (!isObj(v)) return { error: "bad_json" };
    return { body: v };
  } catch (e) {
    return { error: "bad_json" };
  }
}

async function call(env, op, payload) {
  const stub = env.COUNTER.get(env.COUNTER.idFromName(PERSONAL_DO_NAME));
  const r = await stub.fetch("https://do/" + op, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

// reply(data, status) - בונה תשובת JSON עם ה-CORS של הקובץ הראשי.
export async function handlePersonal(request, action, env, reply) {
  const send = (data) => reply(data, statusFor(data.ok ? null : data.error));
  if (request.method !== "POST") return send({ ok: false, error: "method_not_allowed" });
  const rb = await readBody(request);
  if (rb.error) return send({ ok: false, error: rb.error });
  const body = rb.body;

  if (action === "create" || action === "update") {
    const c = cleanList(body.list);
    if (c.error) return send({ ok: false, error: c.error });
    const data = JSON.stringify(c.list);
    if (action === "create") {
      // התנגשות של 144 ביט אקראיים אינה צפויה; ניסיון שני רק ליתר ביטחון.
      for (let i = 0; i < 2; i++) {
        const out = await call(env, "plist-create", { id: newPersonalId(), data });
        if (out.ok || out.error !== "id_taken") return send(out);
      }
      return send({ ok: false, error: "id_taken" });
    }
    if (!validId(body.id)) return send({ ok: false, error: "bad_request" });
    const payload = { id: body.id, data };
    if (body.baseUpdatedAt !== undefined && body.baseUpdatedAt !== null) {
      if (!Number.isInteger(body.baseUpdatedAt)) return send({ ok: false, error: "bad_request" });
      payload.baseUpdatedAt = body.baseUpdatedAt;
    }
    return send(await call(env, "plist-update", payload));
  }

  if (action === "get" || action === "delete" || action === "rotate") {
    if (!validId(body.id)) return send({ ok: false, error: "bad_request" });
    if (action === "rotate") {
      for (let i = 0; i < 2; i++) {
        const out = await call(env, "plist-rotate", { id: body.id, newId: newPersonalId() });
        if (out.ok || out.error !== "id_taken") return send(out);
      }
      return send({ ok: false, error: "id_taken" });
    }
    return send(await call(env, "plist-" + action, { id: body.id }));
  }

  return send({ ok: false, error: "unknown_action" });
}
