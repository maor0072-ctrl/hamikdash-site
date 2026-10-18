// CounterDO - אובייקט יחיד לכל המערכת, מחזיק את המונה הגלובלי.
// שלושה מונים: היום, החודש, ומאז ההתחלה. הגלגול לפי שעון ישראל.
//
// אובייקט יחיד הוא צוואר בקבוק תיאורטי, אבל בקצב של אלפי סימונים ביום הוא
// אינו מתקרב לגבול, והתשובה החוצה ממילא מוגשת ממטמון של 30 שניות.
// אם אי פעם יגיע עומס אמיתי - מפצלים לעשרה מונים וסוכמים. לא עכשיו.

export class CounterDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS c (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0)");
    // אינדקס הספרים שהפותח הסכים לפרסם בקטלוג הציבורי. אין אינדקס אחר:
    // כל BookDO נמצא לפי שמו בלבד ואי אפשר למנות אותם. הטבלה כאן ולא ב-DO
    // חדש כדי שלא תידרש מחלקה חדשה ו-migration בפריסה. מונים ומצב אינם
    // נשמרים כאן - הם נשלפים חי מכל ספר, כדי שלא תהיה סטייה.
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS catalog (" +
        "bookId TEXT PRIMARY KEY, listed INTEGER NOT NULL DEFAULT 1, addedAt INTEGER NOT NULL)"
    );
    // קוראים שנרשמו מרצונם (הכרעות 5, 9). המפתח נגזר מהטלפון או מהמייל ב-HMAC
    // בצד השרת, כך שאותו אדם הוא אותו קורא בכל מכשיר בלי קוד אימות (ג3).
    // הטלפון עצמו אינו נשמר - רק המפתח. המייל נשמר, כי אליו נשלח המייל החודשי (הכרעה 10).
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS people (" +
        "pkey TEXT PRIMARY KEY, first TEXT, last TEXT, email TEXT, " +
        "marked INTEGER NOT NULL DEFAULT 0, firstAt INTEGER NOT NULL, lastAt INTEGER NOT NULL)"
    );
  }

  personUpsert(b) {
    if (!b || !b.pkey) return { ok: false, error: "bad_request" };
    const now = Date.now();
    this.sql.exec(
      "INSERT INTO people (pkey, first, last, email, firstAt, lastAt) VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(pkey) DO UPDATE SET " +
        "first = CASE WHEN excluded.first != '' THEN excluded.first ELSE first END, " +
        "last = CASE WHEN excluded.last != '' THEN excluded.last ELSE last END, " +
        "email = CASE WHEN excluded.email != '' THEN excluded.email ELSE email END, " +
        "lastAt = excluded.lastAt",
      b.pkey,
      b.first || "",
      b.last || "",
      b.email || "",
      now,
      now
    );
    return this.personGet(b.pkey);
  }

  personBump(pkey, n) {
    const amount = Math.max(0, Math.min(200, Number(n) || 0));
    if (!pkey || !amount) return { ok: true };
    this.sql.exec("UPDATE people SET marked = marked + ?, lastAt = ? WHERE pkey = ?", amount, Date.now(), pkey);
    return { ok: true };
  }

  personGet(pkey) {
    const r = this.sql.exec("SELECT first, marked FROM people WHERE pkey = ?", pkey || "").toArray()[0];
    return r ? { ok: true, known: 1, first: r.first || "", marked: Number(r.marked || 0) } : { ok: true, known: 0, marked: 0 };
  }

  // למייל החודשי בלבד. אותו נוסח לכולם ובלי מספרים אישיים (הכרעה 10).
  mailList() {
    const rows = this.sql.exec("SELECT first, email FROM people WHERE email != '' ORDER BY firstAt").toArray();
    return { ok: true, people: rows.map((r) => ({ first: r.first || "", email: r.email })) };
  }

  // הסרה מהמייל החודשי: המייל נמחק, הקורא והספירה שלו נשארים.
  personUnsub(email) {
    const e = String(email || "").toLowerCase();
    if (!e) return { ok: false, error: "bad_request" };
    this.sql.exec("UPDATE people SET email = '' WHERE email = ?", e);
    return { ok: true };
  }

  get(k) {
    const rows = this.sql.exec("SELECT v FROM c WHERE k = ?", k).toArray();
    return rows.length ? Number(rows[0].v) : 0;
  }

  add(k, n) {
    this.sql.exec(
      "INSERT INTO c (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = v + excluded.v",
      k,
      n
    );
  }

  // מפתחות היום והחודש לפי שעון ישראל, כדי שהגלגול יקרה בחצות שלנו
  // ולא בחצות UTC.
  keys(now) {
    const d = new Date(now);
    const il = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return { day: "d:" + il, month: "m:" + il.slice(0, 7) };
  }

  bump(n) {
    const now = Date.now();
    const k = this.keys(now);
    const amount = Math.max(0, Math.min(200, Number(n) || 0));
    if (!amount) return this.stats();
    this.add(k.day, amount);
    this.add(k.month, amount);
    this.add("total", amount);
    return this.stats();
  }

  bumpBooks() {
    this.add("books", 1);
    return this.stats();
  }

  // ---- הקטלוג הציבורי ----
  catalogSet(bookId, listed) {
    if (!bookId) return { ok: false, error: "bad_request" };
    this.sql.exec(
      "INSERT INTO catalog (bookId, listed, addedAt) VALUES (?, ?, ?) " +
        "ON CONFLICT(bookId) DO UPDATE SET listed = excluded.listed",
      bookId,
      listed ? 1 : 0,
      Date.now()
    );
    return { ok: true, listed: listed ? 1 : 0 };
  }

  catalogGet(bookId) {
    const rows = this.sql.exec("SELECT listed FROM catalog WHERE bookId = ?", bookId).toArray();
    return { ok: true, listed: rows.length ? Number(rows[0].listed) : 0 };
  }

  // הרשומים, החדשים קודם. התקרה מגנה על העמוד: כל ספר הוא קריאה ל-DO.
  catalogList(limit) {
    const n = Math.max(1, Math.min(100, Number(limit) || 60));
    const rows = this.sql
      .exec("SELECT bookId, addedAt FROM catalog WHERE listed = 1 ORDER BY addedAt DESC LIMIT ?", n)
      .toArray();
    return { ok: true, books: rows.map((r) => ({ id: r.bookId, addedAt: Number(r.addedAt) })) };
  }

  stats() {
    const k = this.keys(Date.now());
    return {
      ok: true,
      today: this.get(k.day),
      month: this.get(k.month),
      total: this.get("total"),
      books: this.get("books"),
    };
  }

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
    if (op === "bump") out = this.bump(body.n);
    else if (op === "book") out = this.bumpBooks();
    else if (op === "catalog-set") out = this.catalogSet(body.bookId, body.listed);
    else if (op === "catalog-get") out = this.catalogGet(body.bookId);
    else if (op === "catalog-list") out = this.catalogList(body.limit);
    else if (op === "person-upsert") out = this.personUpsert(body);
    else if (op === "person-bump") out = this.personBump(body.pkey, body.n);
    else if (op === "person-get") out = this.personGet(body.pkey);
    else if (op === "mail-list") out = this.mailList();
    else if (op === "person-unsub") out = this.personUnsub(body.email);
    else out = this.stats();

    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
