// BookDO - Durable Object אחד לכל ספר תהילים.
// כל המצב של 171 היחידות יושב כאן, על אחסון SQLite של ה-DO.
// הסיבה שזה לא KV: KV הוא eventually consistent וכתיבות מקבילות לאותו מפתח
// דורסות זו את זו. שלושה אנשים שלוחצים על אותו פרק באותה שנייה חייבים לקבל
// תשובה אחת בלבד, וזה מה שה-DO נותן: חד-חוטי, טרנזקציוני, עקבי לחלוטין.

import { expiryFor } from "./tehillim-quiet.js";

const MARK_BURST = 3;
const MARK_REFILL_MS = 60000;

export class BookDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.init();
  }

  init() {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS units (" +
        "idx INTEGER PRIMARY KEY, state TEXT NOT NULL DEFAULT 'free', " +
        "readerKey TEXT, readerName TEXT, takenAt INTEGER, budgetMs INTEGER, readAt INTEGER)"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS readers (" +
        "rkey TEXT PRIMARY KEY, name TEXT, phone TEXT, email TEXT, " +
        "lastMarkAt INTEGER DEFAULT 0, marked INTEGER DEFAULT 0, " +
        "tokens REAL DEFAULT 3)"
    );
    // טבלאות שנוצרו לפני שהעמודה נוספה - תוספת חד-פעמית, שקטה אם כבר קיימת.
    try {
      this.sql.exec("ALTER TABLE readers ADD COLUMN tokens REAL DEFAULT 3");
    } catch (e) {
      /* כבר קיימת */
    }
  }

  getMeta(k) {
    const rows = this.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray();
    return rows.length ? rows[0].v : null;
  }

  setMeta(k, v) {
    this.sql.exec(
      "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      k,
      String(v)
    );
  }

  // ---- create ----------------------------------------------------------

  create(meta, unitCount) {
    if (this.getMeta("createdAt")) return { ok: false, error: "exists" };
    const now = Date.now();
    for (const k of Object.keys(meta || {})) this.setMeta(k, meta[k] == null ? "" : meta[k]);
    this.setMeta("createdAt", now);
    this.setMeta("status", "open");
    this.setMeta("unitCount", unitCount);
    for (let i = 0; i < unitCount; i++) {
      this.sql.exec("INSERT OR IGNORE INTO units (idx, state) VALUES (?, 'free')", i);
    }
    return { ok: true, createdAt: now };
  }

  // ---- state -----------------------------------------------------------

  // מצב חי של הספר. הפקיעה מחושבת בכל קריאה ולא נשענת על ה-alarm בלבד,
  // כי ה-alarm יכול להתעכב, ואדם לא אמור לראות משבצת נעולה שכבר פגה.
  snapshot(readerKey) {
    const now = Date.now();
    this.sweep(now);
    const rows = this.sql
      .exec(
        "SELECT idx, state, readerKey, readerName, takenAt, budgetMs, readAt FROM units ORDER BY idx"
      )
      .toArray();
    const units = rows.map(function (r) {
      return {
        i: r.idx,
        s: r.state,
        mine: r.state !== "free" && readerKey && r.readerKey === readerKey ? 1 : 0,
        exp: r.state === "taken" ? expiryFor(r.takenAt, r.budgetMs) : null,
        by: r.state !== "free" ? r.readerName || "" : "",
      };
    });
    let taken = 0;
    let read = 0;
    for (const u of units) {
      if (u.s === "taken") taken++;
      else if (u.s === "read") read++;
    }
    return {
      ok: true,
      status: this.getMeta("status") || "open",
      patientName: this.getMeta("patientName") || "",
      motherName: this.getMeta("motherName") || "",
      gender: this.getMeta("gender") || "",
      intent: this.getMeta("intent") || "",
      targetDate: this.getMeta("targetDate") || "",
      openerName: this.getMeta("openerName") || "",
      kind: this.getMeta("kind") || "private",
      title: this.getMeta("title") || "",
      cycle: Number(this.getMeta("cycle") || 0),
      createdAt: Number(this.getMeta("createdAt") || 0),
      budgetMs: Number(this.getMeta("budgetMs") || 3600000),
      counts: { total: units.length, taken: taken, read: read, free: units.length - taken - read },
      units: units,
      now: now,
    };
  }

  // משחרר כל יחידה תפוסה שעבר זמנה. זו הפעולה שמחזירה פרקים למחזור
  // בלי שאף אדם יצטרך לעשות משהו.
  sweep(now) {
    const rows = this.sql
      .exec("SELECT idx, takenAt, budgetMs FROM units WHERE state = 'taken'")
      .toArray();
    let n = 0;
    for (const r of rows) {
      if (expiryFor(r.takenAt, r.budgetMs) > now) continue;
      this.sql.exec(
        "UPDATE units SET state='free', readerKey=NULL, readerName=NULL, takenAt=NULL, budgetMs=NULL WHERE idx = ?",
        r.idx
      );
      n++;
    }
    return n;
  }

  // ---- take ------------------------------------------------------------

  // הכל-או-כלום בכוונה: אם מתוך חמישה פרקים אחד נחטף, לא נותנים ארבעה בשקט.
  // האדם בוחר שוב ויודע מה קרה, במקום לגלות אחר כך שקיבל פחות.
  take(readerKey, readerName, idxs, budgetMs) {
    const now = Date.now();
    this.sweep(now);
    if ((this.getMeta("status") || "open") !== "open") return { ok: false, error: "closed" };
    if (!readerKey || !idxs || !idxs.length) return { ok: false, error: "bad_request" };

    const want = [];
    const lost = [];
    for (const i of idxs) {
      const rows = this.sql.exec("SELECT state FROM units WHERE idx = ?", i).toArray();
      if (!rows.length) lost.push(i);
      else if (rows[0].state === "free") want.push(i);
      else lost.push(i);
    }
    if (lost.length) return { ok: false, error: "lost", lost: lost, taken: [] };

    for (const i of want) {
      this.sql.exec(
        "UPDATE units SET state='taken', readerKey=?, readerName=?, takenAt=?, budgetMs=? WHERE idx = ? AND state='free'",
        readerKey,
        readerName || "",
        now,
        budgetMs,
        i
      );
    }
    this.sql.exec(
      "INSERT INTO readers (rkey, name) VALUES (?, ?) ON CONFLICT(rkey) DO UPDATE SET name = excluded.name",
      readerKey,
      readerName || ""
    );
    this.scheduleAlarm();
    return { ok: true, taken: want, takenAt: now, budgetMs: budgetMs };
  }

  // ---- read ------------------------------------------------------------

  // החסד המובנה: סימון שמגיע אחרי הפקיעה מתקבל, כל עוד איש אחר לא לקח
  // את היחידה בינתיים. אדם שקרא באמת לא מאבד את מה שקרא בגלל שעון.
  markRead(readerKey, idxs) {
    const now = Date.now();
    if (!readerKey || !idxs || !idxs.length) return { ok: false, error: "bad_request" };

    // הגבלת קצב כדלי אסימונים, ולא "סימון אחד לדקה" קשיח.
    // המטרה היא שלא ינפחו את המונה בלחיצות רצופות, לא לחסום אדם שקרא באמת
    // שני פרקים קצרים ברצף - פרק קי"ז הוא שני פסוקים, וחסימה שם היא עוול.
    // מותר פרץ של שלושה, ומתמלא אסימון אחד לדקה.
    const rr = this.sql
      .exec("SELECT lastMarkAt, tokens FROM readers WHERE rkey = ?", readerKey)
      .toArray();
    let tokens = MARK_BURST;
    let last = 0;
    if (rr.length) {
      last = Number(rr[0].lastMarkAt || 0);
      tokens = rr[0].tokens == null ? MARK_BURST : Number(rr[0].tokens);
      if (last) tokens = Math.min(MARK_BURST, tokens + (now - last) / MARK_REFILL_MS);
    }
    if (tokens < 1) {
      return {
        ok: false,
        error: "too_fast",
        retryInMs: Math.ceil((1 - tokens) * MARK_REFILL_MS),
      };
    }

    const done = [];
    for (const i of idxs) {
      const rows = this.sql.exec("SELECT state, readerKey FROM units WHERE idx = ?", i).toArray();
      if (!rows.length) continue;
      const u = rows[0];
      if (u.state === "read") continue;
      const mine = u.readerKey === readerKey;
      const free = u.state === "free";
      if (!mine && !free) continue;
      this.sql.exec("UPDATE units SET state='read', readerKey=?, readAt=? WHERE idx = ?", readerKey, now, i);
      done.push(i);
    }
    if (done.length) {
      this.sql.exec(
        "INSERT INTO readers (rkey, lastMarkAt, marked, tokens) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(rkey) DO UPDATE SET lastMarkAt = excluded.lastMarkAt, " +
          "marked = marked + excluded.marked, tokens = excluded.tokens",
        readerKey,
        now,
        done.length,
        Math.max(0, tokens - done.length)
      );
    }

    const left = this.sql.exec("SELECT COUNT(*) AS c FROM units WHERE state != 'read'").toArray()[0].c;
    if (left === 0) this.setMeta("status", "closed");

    return { ok: true, read: done, left: left, closed: left === 0 };
  }

  // ---- הקריאה הכללית ------------------------------------------------
  // הבריכה התמידית להצלחת תורמי העמותה, חברי שמע ישראל והפועלים למען עם
  // ישראל. זו אותה מכונה בדיוק, ספר קבוע שפשוט נפתח מחדש כשהוא נסגר -
  // וזה מה שהופך את הקישור למשהו שנשלח כל יום ולא רק בשעת משבר.
  reopen(meta) {
    const cycle = Number(this.getMeta("cycle") || 0);
    if (!this.getMeta("createdAt")) {
      const r = this.create(meta || {}, 171);
      this.setMeta("cycle", 1);
      return { ok: true, cycle: 1, created: true, closedAt: r.createdAt };
    }
    if ((this.getMeta("status") || "open") === "open") {
      return { ok: true, cycle: cycle, created: false, reopened: false };
    }
    this.sql.exec(
      "UPDATE units SET state='free', readerKey=NULL, readerName=NULL, takenAt=NULL, budgetMs=NULL, readAt=NULL"
    );
    this.setMeta("status", "open");
    this.setMeta("cycle", cycle + 1);
    this.setMeta("cycleStartedAt", Date.now());
    return { ok: true, cycle: cycle + 1, created: false, reopened: true };
  }

  release(readerKey, idxs) {
    for (const i of idxs || []) {
      this.sql.exec(
        "UPDATE units SET state='free', readerKey=NULL, readerName=NULL, takenAt=NULL, budgetMs=NULL " +
          "WHERE idx = ? AND state='taken' AND readerKey = ?",
        i,
        readerKey
      );
    }
    return { ok: true };
  }

  // ---- ניהול (פותח הספר בלבד) -----------------------------------------

  // "לחלק את הנותרים" - זה הכפתור שסוגר ספר שנתקע. מחלק את כל הפרקים
  // הפנויים בין הקוראים שכבר נמצאים בספר, במנות שוות, ומאריך להם את הזמן.
  distribute() {
    const now = Date.now();
    this.sweep(now);
    const free = this.sql
      .exec("SELECT idx FROM units WHERE state = 'free' ORDER BY idx")
      .toArray()
      .map((r) => r.idx);
    const readers = this.sql
      .exec("SELECT rkey, name FROM readers ORDER BY marked DESC")
      .toArray();
    if (!free.length) return { ok: true, assigned: 0, readers: readers.length, error: "nothing_free" };
    if (!readers.length) return { ok: false, error: "no_readers" };

    // חלון ארוך בכוונה: חלוקה היא בקשה לסיים ספר, לא מרוץ של שעה.
    const budget = 24 * 60 * 60 * 1000;
    let n = 0;
    free.forEach((idx, k) => {
      const r = readers[k % readers.length];
      this.sql.exec(
        "UPDATE units SET state='taken', readerKey=?, readerName=?, takenAt=?, budgetMs=? WHERE idx = ? AND state='free'",
        r.rkey,
        r.name || "",
        now,
        budget,
        idx
      );
      n++;
    });
    this.scheduleAlarm();
    return { ok: true, assigned: n, readers: readers.length };
  }

  extend(targetDate) {
    if (targetDate) this.setMeta("targetDate", String(targetDate).slice(0, 20));
    return { ok: true, targetDate: this.getMeta("targetDate") || "" };
  }

  // הרשימה למסך הניהול: מי לקח מה, וכמה סימן.
  roster() {
    const rows = this.sql
      .exec("SELECT rkey, name, marked, lastMarkAt FROM readers ORDER BY marked DESC, name")
      .toArray();
    const holding = {};
    this.sql
      .exec("SELECT readerKey, COUNT(*) AS c FROM units WHERE state = 'taken' GROUP BY readerKey")
      .toArray()
      .forEach((r) => {
        holding[r.readerKey] = Number(r.c);
      });
    return {
      ok: true,
      readers: rows.map((r) => ({
        name: r.name || "",
        marked: Number(r.marked || 0),
        holding: holding[r.rkey] || 0,
        lastMarkAt: Number(r.lastMarkAt || 0),
      })),
    };
  }

  // ---- alarm -----------------------------------------------------------

  scheduleAlarm() {
    const rows = this.sql.exec("SELECT takenAt, budgetMs FROM units WHERE state = 'taken'").toArray();
    let next = Infinity;
    for (const r of rows) next = Math.min(next, expiryFor(r.takenAt, r.budgetMs));
    if (next < Infinity) this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    this.sweep(Date.now());
    this.scheduleAlarm();
  }

  // ---- fetch -----------------------------------------------------------

  async fetch(request) {
    const url = new URL(request.url);
    const op = url.pathname.replace(/^\//, "");
    let body = {};
    if (request.method === "POST") {
      try {
        body = await request.json();
      } catch (e) {
        body = {};
      }
    }
    let out;
    if (op === "create") out = this.create(body.meta || {}, body.unitCount || 171);
    else if (op === "state") out = this.snapshot(body.readerKey || url.searchParams.get("rk"));
    else if (op === "take") out = this.take(body.readerKey, body.readerName, body.idxs, body.budgetMs || 3600000);
    else if (op === "read") out = this.markRead(body.readerKey, body.idxs);
    else if (op === "release") out = this.release(body.readerKey, body.idxs);
    else if (op === "reopen") out = this.reopen(body.meta);
    else if (op === "distribute") out = this.distribute();
    else if (op === "extend") out = this.extend(body.targetDate);
    else if (op === "roster") out = this.roster();
    else out = { ok: false, error: "unknown_op", op: op };

    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
