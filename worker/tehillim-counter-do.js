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
    else out = this.stats();

    return new Response(JSON.stringify(out), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
