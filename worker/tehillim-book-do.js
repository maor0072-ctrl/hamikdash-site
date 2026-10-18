// BookDO - Durable Object אחד לכל ספר תהילים.
// כל המצב של 171 היחידות יושב כאן, על אחסון SQLite של ה-DO.
// הסיבה שזה לא KV: KV הוא eventually consistent וכתיבות מקבילות לאותו מפתח
// דורסות זו את זו. שלושה אנשים שלוחצים על אותו פרק באותה שנייה חייבים לקבל
// תשובה אחת בלבד, וזה מה שה-DO נותן: חד-חוטי, טרנזקציוני, עקבי לחלוטין.

import { expiryFor } from "./tehillim-quiet.js";

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
        "lastMarkAt INTEGER DEFAULT 0, marked INTEGER DEFAULT 0)"
    );
    // הכרעה 17 (10.10.2026): שום פרק אינו נעול. כמה אנשים יכולים להחזיק את
    // אותו פרק, וכל אחד רואה אותו כ"שלי". units נשארת עם מצב אחד לפרק -
    // הראשון שסימן הוא שנספר, ואין ספירה כפולה.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS holds (" +
        "idx INTEGER NOT NULL, rkey TEXT NOT NULL, name TEXT, takenAt INTEGER NOT NULL, " +
        "budgetMs INTEGER NOT NULL, PRIMARY KEY (idx, rkey))"
    );
    // ספרים שנפתחו לפני הטבלה: ההחזקה היחידה ישבה על units עצמה
    if (!this.getMeta("holdsMigrated")) {
      this.sql.exec(
        "INSERT OR IGNORE INTO holds (idx, rkey, name, takenAt, budgetMs) " +
          "SELECT idx, readerKey, COALESCE(readerName, ''), takenAt, budgetMs FROM units " +
          "WHERE state = 'taken' AND readerKey IS NOT NULL AND takenAt IS NOT NULL"
      );
      this.setMeta("holdsMigrated", Date.now());
    }
  }

  // מעדכן את שורת הפרק לפי ההחזקות החיות שלו. פרק שנקרא אינו זז.
  // הנושא שמוצג ("נלקח על ידי") הוא ההחזקה הוותיקה ביותר שעוד בתוקף.
  syncUnit(idx, now) {
    const u = this.sql.exec("SELECT state FROM units WHERE idx = ?", idx).toArray()[0];
    if (!u || u.state === "read") return;
    const hs = this.sql
      .exec("SELECT rkey, name, takenAt, budgetMs FROM holds WHERE idx = ? ORDER BY takenAt", idx)
      .toArray()
      .filter((h) => expiryFor(h.takenAt, h.budgetMs) > now);
    if (!hs.length) {
      this.sql.exec(
        "UPDATE units SET state='free', readerKey=NULL, readerName=NULL, takenAt=NULL, budgetMs=NULL WHERE idx = ?",
        idx
      );
      return;
    }
    const h = hs[0];
    this.sql.exec(
      "UPDATE units SET state='taken', readerKey=?, readerName=?, takenAt=?, budgetMs=? WHERE idx = ?",
      h.rkey,
      h.name || "",
      h.takenAt,
      h.budgetMs,
      idx
    );
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
    const myHolds = {};
    const holders = {};
    this.sql
      .exec("SELECT idx, rkey, takenAt, budgetMs FROM holds")
      .toArray()
      .forEach(function (h) {
        const e = expiryFor(h.takenAt, h.budgetMs);
        if (e <= now) return;
        holders[h.idx] = (holders[h.idx] || 0) + 1;
        if (readerKey && h.rkey === readerKey) myHolds[h.idx] = e;
      });
    const units = rows.map(function (r) {
      const myExp = myHolds[r.idx];
      return {
        i: r.idx,
        s: r.state,
        mine: (myExp && r.state !== "read") || (r.state === "read" && readerKey && r.readerKey === readerKey) ? 1 : 0,
        exp: r.state === "taken" ? (myExp || expiryFor(r.takenAt, r.budgetMs)) : null,
        by: r.state !== "free" ? r.readerName || "" : "",
        n: holders[r.idx] || 0,
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
      intentOther: this.getMeta("intentOther") || "",
      targetDate: this.getMeta("targetDate") || "",
      openerName: this.getMeta("openerName") || "",
      groupUrl: this.getMeta("groupUrl") || "",
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

  // תמונת מצב קלה לקטלוג הציבורי: קריאה בלבד, בלי שחרור ובלי כתיבה.
  // מחרוזת אחת באורך מספר היחידות, תו לכל יחידה (f/t/r), כדי שבניית
  // הקטלוג מ-60 ספרים לא תעביר 60 פעמים 171 אובייקטים.
  counts() {
    const now = Date.now();
    const rows = this.sql.exec("SELECT idx, state, takenAt, budgetMs FROM units ORDER BY idx").toArray();
    let states = "";
    for (const r of rows) {
      if (r.state === "taken" && expiryFor(r.takenAt, r.budgetMs) <= now) states += "f";
      else states += r.state === "read" ? "r" : r.state === "taken" ? "t" : "f";
    }
    const last = this.sql.exec("SELECT MAX(lastMarkAt) AS m FROM readers").toArray()[0];
    return {
      ok: true,
      exists: !!this.getMeta("createdAt"),
      status: this.getMeta("status") || "open",
      kind: this.getMeta("kind") || "private",
      patientName: this.getMeta("patientName") || "",
      motherName: this.getMeta("motherName") || "",
      gender: this.getMeta("gender") || "",
      intent: this.getMeta("intent") || "",
      intentOther: this.getMeta("intentOther") || "",
      title: this.getMeta("title") || "",
      targetDate: this.getMeta("targetDate") || "",
      createdAt: Number(this.getMeta("createdAt") || 0),
      lastMarkAt: Number((last && last.m) || 0),
      states: states,
    };
  }

  // משחרר כל יחידה תפוסה שעבר זמנה. זו הפעולה שמחזירה פרקים למחזור
  // בלי שאף אדם יצטרך לעשות משהו.
  sweep(now) {
    const dead = this.sql
      .exec("SELECT idx, rkey, takenAt, budgetMs FROM holds")
      .toArray()
      .filter((h) => expiryFor(h.takenAt, h.budgetMs) <= now);
    const touched = {};
    for (const h of dead) {
      this.sql.exec("DELETE FROM holds WHERE idx = ? AND rkey = ?", h.idx, h.rkey);
      touched[h.idx] = 1;
    }
    // וגם פרק שסומן תפוס בלי שום החזקה (למשל אחרי שחרור)
    this.sql
      .exec("SELECT idx FROM units WHERE state = 'taken'")
      .toArray()
      .forEach((r) => {
        touched[r.idx] = 1;
      });
    for (const k of Object.keys(touched)) this.syncUnit(Number(k), now);
    return dead.length;
  }

  // ---- take ------------------------------------------------------------

  // הכרעות 6 ו-17: שום פרק אינו נעול. מי שבוחר פרק שמישהו אחר כבר לקח
  // מקבל אותו בכל זאת, יחד עם הודעה גלויה. פרק שכבר נקרא אינו נלקח -
  // הוא מוחזר ב-alreadyRead והמסך מציע לקרוא שוב או לדלג (הכרעה 8).
  // אין עוד הכל-או-כלום: בחירה של רצף ארוך לא נכשלת בגלל פרק אחד.
  take(readerKey, readerName, idxs, budgetMs) {
    const now = Date.now();
    this.sweep(now);
    if ((this.getMeta("status") || "open") !== "open") return { ok: false, error: "closed" };
    if (!readerKey || !idxs || !idxs.length) return { ok: false, error: "bad_request" };

    const taken = [];
    const shared = [];
    const alreadyRead = [];
    for (const i of idxs) {
      const rows = this.sql.exec("SELECT state FROM units WHERE idx = ?", i).toArray();
      if (!rows.length) continue;
      if (rows[0].state === "read") {
        alreadyRead.push(i);
        continue;
      }
      const others = this.sql
        .exec("SELECT COUNT(*) AS c FROM holds WHERE idx = ? AND rkey != ?", i, readerKey)
        .toArray()[0].c;
      if (others > 0) shared.push(i);
      this.sql.exec(
        "INSERT INTO holds (idx, rkey, name, takenAt, budgetMs) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(idx, rkey) DO UPDATE SET name = excluded.name, takenAt = excluded.takenAt, budgetMs = excluded.budgetMs",
        i,
        readerKey,
        readerName || "",
        now,
        budgetMs
      );
      this.syncUnit(i, now);
      taken.push(i);
    }
    this.sql.exec(
      "INSERT INTO readers (rkey, name) VALUES (?, ?) ON CONFLICT(rkey) DO UPDATE SET name = excluded.name",
      readerKey,
      readerName || ""
    );
    this.scheduleAlarm();
    return { ok: true, taken: taken, shared: shared, alreadyRead: alreadyRead, takenAt: now, budgetMs: budgetMs };
  }

  // ---- read ------------------------------------------------------------

  // החסד המובנה: סימון שמגיע אחרי הפקיעה מתקבל, כל עוד איש אחר לא לקח
  // את היחידה בינתיים. אדם שקרא באמת לא מאבד את מה שקרא בגלל שעון.
  markRead(readerKey, idxs, readerName) {
    const now = Date.now();
    if (!readerKey || !idxs || !idxs.length) return { ok: false, error: "bad_request" };

    // אין הגבלת קצב על הסימון. הכרעת יעקב 24.9: יש פרקים של כמה שניות
    // (קי"ז הוא שני פסוקים), וכל מגבלה חוסמת קודם כל את מי שקורא באמת.
    // הוא אינו חושש מרמאים, והתגמול כאן הוא תפילה ולא כסף.

    const done = [];
    const already = [];
    for (const i of idxs) {
      const rows = this.sql.exec("SELECT state, readerKey FROM units WHERE idx = ?", i).toArray();
      if (!rows.length) continue;
      const u = rows[0];
      // הראשון שסימן נספר; השני מקבל את ההרגשה שקרא, בלי ספירה כפולה (הכרעה 17)
      if (u.state === "read") {
        already.push(i);
        continue;
      }
      // אין בדיקת בעלות: גם פרק שאחר מחזיק נסגר על ידי מי שקרא אותו ראשון (הכרעה 6),
      // וגם סימון דיווחי של מי שקרא מספר מודפס בלי לקחת קודם (הכרעות 2, 3)
      this.sql.exec(
        "UPDATE units SET state='read', readerKey=?, readerName=COALESCE(?, readerName), readAt=?, takenAt=NULL, budgetMs=NULL WHERE idx = ?",
        readerKey,
        readerName || null,
        now,
        i
      );
      this.sql.exec("DELETE FROM holds WHERE idx = ?", i);
      done.push(i);
    }
    if (done.length) {
      this.sql.exec(
        "INSERT INTO readers (rkey, lastMarkAt, marked) VALUES (?, ?, ?) " +
          "ON CONFLICT(rkey) DO UPDATE SET lastMarkAt = excluded.lastMarkAt, " +
          "marked = marked + excluded.marked",
        readerKey,
        now,
        done.length
      );
    }

    const left = this.sql.exec("SELECT COUNT(*) AS c FROM units WHERE state != 'read'").toArray()[0].c;
    if (left === 0) this.setMeta("status", "closed");

    return { ok: true, read: done, already: already, left: left, closed: left === 0 };
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
    this.sql.exec("DELETE FROM holds");
    this.setMeta("status", "open");
    this.setMeta("cycle", cycle + 1);
    this.setMeta("cycleStartedAt", Date.now());
    return { ok: true, cycle: cycle + 1, created: false, reopened: true };
  }

  // מי שנרשם עם טלפון מקבל מפתח קבוע. מה שהחזיק תחת המפתח המקומי עובר אליו,
  // כדי שלא יאבד את מה שלקח לפני שנרשם.
  rekey(oldKey, newKey, name, phoneTail, email) {
    if (!oldKey || !newKey) return { ok: false, error: "bad_request" };
    if (oldKey !== newKey) {
      this.sql.exec("UPDATE OR IGNORE holds SET rkey = ? WHERE rkey = ?", newKey, oldKey);
      this.sql.exec("DELETE FROM holds WHERE rkey = ?", oldKey);
      this.sql.exec("UPDATE units SET readerKey = ? WHERE readerKey = ?", newKey, oldKey);
      const old = this.sql.exec("SELECT marked, lastMarkAt FROM readers WHERE rkey = ?", oldKey).toArray()[0];
      this.sql.exec("DELETE FROM readers WHERE rkey = ?", oldKey);
      this.sql.exec(
        "INSERT INTO readers (rkey, name, marked, lastMarkAt) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(rkey) DO UPDATE SET marked = marked + excluded.marked, " +
          "lastMarkAt = MAX(lastMarkAt, excluded.lastMarkAt)",
        newKey,
        name || "",
        old ? Number(old.marked || 0) : 0,
        old ? Number(old.lastMarkAt || 0) : 0
      );
    }
    this.sql.exec(
      "INSERT INTO readers (rkey, name, phone, email) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(rkey) DO UPDATE SET " +
        "name = CASE WHEN excluded.name != '' THEN excluded.name ELSE name END, " +
        "phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE phone END, " +
        "email = CASE WHEN excluded.email != '' THEN excluded.email ELSE email END",
      newKey,
      name || "",
      phoneTail || "",
      email || ""
    );
    return { ok: true };
  }

  release(readerKey, idxs) {
    const now = Date.now();
    for (const i of idxs || []) {
      this.sql.exec("DELETE FROM holds WHERE idx = ? AND rkey = ?", i, readerKey);
      this.syncUnit(i, now);
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
        "INSERT INTO holds (idx, rkey, name, takenAt, budgetMs) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(idx, rkey) DO UPDATE SET takenAt = excluded.takenAt, budgetMs = excluded.budgetMs",
        idx,
        r.rkey,
        r.name || "",
        now,
        budget
      );
      this.syncUnit(idx, now);
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
      .exec("SELECT rkey, COUNT(*) AS c FROM holds GROUP BY rkey")
      .toArray()
      .forEach((r) => {
        holding[r.rkey] = Number(r.c);
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
    const rows = this.sql.exec("SELECT takenAt, budgetMs FROM holds").toArray();
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
    else if (op === "rekey") out = this.rekey(body.oldKey, body.newKey, body.name, body.phoneTail, body.email);
    else if (op === "read") out = this.markRead(body.readerKey, body.idxs, body.readerName);
    else if (op === "release") out = this.release(body.readerKey, body.idxs);
    else if (op === "reopen") out = this.reopen(body.meta);
    else if (op === "distribute") out = this.distribute();
    else if (op === "extend") out = this.extend(body.targetDate);
    else if (op === "roster") out = this.roster();
    else if (op === "counts") out = this.counts();
    else out = { ok: false, error: "unknown_op", op: op };

    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
