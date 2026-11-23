/* מסך הקריאה המשותף של תהילים ישראל - window.THReader
   אפיון: C:\AIOS\aios\outputs\documents\2026-11-23-tehillim-israel-redesign-spec.md (הכרעות ט1-ט4).
   סקריפט רגיל ולא מודול, כדי שגם book.html (סקריפט רגיל) וגם personal.html (מודול) יטענו אותו
   ב-<script src>. העיצוב ב-reader.css. ה-API מתועד ביומן הבנייה ובראש create() למטה.

   מה המסך עושה ומה לא:
   - פרקים ברצף בגלילה אחת, כל פרק פסקה אחת, אות עברית קטנה לפני כל פסוק.
   - פס עליון: חזרה, "פרק כ' · פסוק יח מתוך לב", א- / א+ (20-34, צעד 2, נשמר במכשיר).
   - "סיימתי" מתחת לשורה האחרונה של כל פרק. גלילה לפרק הבא = הקודם נקרא, אלא אם עבר על
     המסך מהר מקצב קריאה (8 מילים בשנייה), או שלא ראו את תחילתו (קפיצה), ואז רק המקום נשמר.
   - הסימון נשלח אחרי 4 שניות שבהן אפשר לבטל. המסך לא יודע כלום על השרת: הדף המארח
     מקבל onMark ומחליט מה לשלוח. */
(function (g) {
  "use strict";

  var SIZE_KEY = "th_read_size";
  var MIN = 20, MAX = 34, STEP = 2, DEF = 26;
  var WPS = 8;          // מעל זה - דפדוף, לא קריאה (ט1)
  var UNDO_MS = 4000;
  var BAR = 52;

  // ---------- מספרים עבריים: טו/טז ולא יה/יו ----------
  var ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  var TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  var HUND = ["", "ק", "ר", "ש", "ת"];
  function heb(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return "";
    var s = "", h = Math.floor(n / 100);
    while (h > 4) { s += "ת"; h -= 4; }
    s += HUND[h];
    n %= 100;
    if (n === 15) return s + "טו";
    if (n === 16) return s + "טז";
    return s + TENS[Math.floor(n / 10)] + ONES[n % 10];
  }
  // שם פרק בפיסוק פשוט: כ' , כ"א , קי"ט
  function hebName(n) {
    var s = heb(n);
    return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1);
  }
  var LETTERS = "א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע פ צ ק ר ש ת".split(" ");

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function put(parent, x) {
    if (!x) return;
    if (typeof x === "string") parent.insertAdjacentHTML("beforeend", x);
    else parent.appendChild(x);
  }

  // ---------- גודל הטקסט: משתנה אחד לכל מסכי הקריאה ----------
  function getSize(key) {
    var v = 0;
    try { v = Number(localStorage.getItem(key || SIZE_KEY)); } catch (e) { /* פרטיות חסומה */ }
    return v >= MIN && v <= MAX ? v : DEF;
  }
  function saveSize(v, key) {
    try { localStorage.setItem(key || SIZE_KEY, String(v)); } catch (e) { /* בסדר */ }
  }

  // ---------- יחידות מתוך units.json של ספר משותף ----------
  // list: מערך units.json (171), idxs: אילו יחידות ובאיזה סדר, textUrl(i): כתובת text/<i>.json
  function bookUnits(list, idxs, textUrl) {
    var cache = {}, prevCh = null;
    return idxs.map(function (i) {
      var u = list[i];
      var sameCh = prevCh === u.ch;
      prevCh = u.ch;
      var ch = u.ch, part = u.part || 0;
      var name = hebName(ch), title = "פרק " + hebName(ch), subtitle = null, first = 1, of = u.v;
      if (part) {
        // קי"ט: 22 אותיות של 8 פסוקים. כותרת הפרק רק לפני האות הראשונה שמוצגת.
        subtitle = "אות " + LETTERS[part - 1];
        name = hebName(ch) + " אות " + LETTERS[part - 1];
        first = (part - 1) * 8 + 1;
        of = 176;
        if (sameCh) title = null;
      }
      return {
        key: i, ch: ch, part: part, name: name, title: title, subtitle: subtitle, barTitle: "פרק " + hebName(ch),
        first: first, of: of,
        load: function () {
          if (cache[i]) return Promise.resolve(cache[i]);
          return fetch(textUrl(i)).then(function (r) {
            if (!r.ok) throw new Error("text " + r.status);
            return r.json();
          }).then(function (d) { cache[i] = d.verses; return d.verses; });
        }
      };
    });
  }

  /* create(opts) -> reader
     opts.mount       Element שהמסך נבנה בתוכו (מתרוקן)
     opts.units       [{ key, name, title, subtitle?, sub?, barTitle?, first?, of?, verses? | load()->Promise<verses>,
                         read?, note? }]
                        name     - "כ'" / "קי"ט אות ב" (לכפתור ולהודעה)
                        title    - כותרת הפרק ("פרק כ'"); null = בלי כותרת (המשך של אותו פרק, כמו אותיות קי"ט)
                        subtitle - כותרת משנה קטנה ("אות ב")
                        sub      - HTML מתחת לכותרת (למשל "אברהם בן שרה לרפואה והצלחה" בתהילים האישי)
                        first/of - מספר הפסוק הראשון, ומספר הפסוקים בפרק כולו (לפס העליון)
                        read     - כבר נקרא על ידי הקורא הזה (מוצג "✓ נקרא", לא יסומן שוב)
                        note     - שורה קטנה ליד הכותרת ("נקרא כבר בסבב הזה")
     opts.start       { key, verse } - פתיחה באמצע: מהיחידה הזו, שני פסוקים לפני המקום
     opts.dedication  טקסט שורת ההקדשה
     opts.before / opts.after   HTML או Element - לפני היחידה הראשונה (רק כשמתחילים ממנה) ואחרי האחרונה
     opts.endText / opts.endLabel  שורה וכפתור בסוף הרצף (הכפתור קורא ל-onBack)
     opts.autoMark    ברירת מחדל true - גלילה לפרק הבא מסמנת (ט1)
     opts.doneButton  ברירת מחדל true - כפתור "סיימתי" מתחת לכל יחידה
     opts.backLabel   aria-label לחץ החזרה
     opts.sizeKey     מפתח localStorage לגודל (ברירת מחדל th_read_size, משותף לכל המסכים)
     opts.onBack()            החץ או כפתור הסוף. הסימונים הממתינים נשלחים קודם (flush).
     opts.onMark(unit, how)   how = "button" | "scroll". מחזיר Promise של {ok, already?}. נקרא אחרי חלון הביטול.
     opts.onCurrent(unit, prev)  היחידה שבראש המסך התחלפה (לתפיסה של הפרק הנוכחי בספר משותף, ט4)
     opts.onPlace({key, verse, unit})  המקום התעדכן (נקרא בכל גלילה, מוגבל לפעם בחצי שנייה)
     opts.onReachEnd()        סוף הרצף נראה על המסך (פעם אחת)
     מחזיר: { flush()->Promise, destroy(), setNote(key, text), setRead(key, bool), current(), place(), marked() } */
  function create(opts) {
    opts = opts || {};
    var mount = opts.mount;
    var sizeKey = opts.sizeKey || SIZE_KEY;
    var autoMark = opts.autoMark !== false;
    var doneButton = opts.doneButton !== false;
    var data = opts.units || [];
    var U = data.map(function (d, k) {
      return { d: d, k: k, sec: null, txt: null, btn: null, note: null, words: 0, read: !!d.read, pending: null,
               sawStart: false, visMs: 0, passed: false, rendered: false };
    });
    var byKey = {};
    U.forEach(function (u) { byKey[String(u.d.key)] = u; });

    var startIdx = 0, startVerse = 0;
    if (opts.start && byKey[String(opts.start.key)]) {
      startIdx = byKey[String(opts.start.key)].k;
      startVerse = Number(opts.start.verse) || 0;
    }

    mount.innerHTML = "";
    var root = el("div", "thr");
    root.setAttribute("dir", "rtl");
    var bar = el("header", "thr-bar");
    var back = el("button", "thr-back", "&#8594;");
    back.type = "button";
    back.setAttribute("aria-label", opts.backLabel || "חזרה");
    var where = el("div", "thr-where");
    where.setAttribute("aria-live", "off");
    var sm = el("button", "thr-sz s", "א-");
    sm.type = "button"; sm.setAttribute("aria-label", "הקטנת הטקסט");
    var lg = el("button", "thr-sz l", "א+");
    lg.type = "button"; lg.setAttribute("aria-label", "הגדלת הטקסט");
    var prog = el("div", "thr-prog", "<i></i>");
    bar.appendChild(back); bar.appendChild(where); bar.appendChild(sm); bar.appendChild(lg); bar.appendChild(prog);
    root.appendChild(bar);
    if (opts.dedication) root.appendChild(el("p", "thr-ded", esc(opts.dedication)));
    var main = el("main", "thr-main");
    root.appendChild(main);
    var toast = el("div", "thr-toast", "<span></span><button type='button'>ביטול</button>");
    toast.setAttribute("role", "status");
    root.appendChild(toast);
    mount.appendChild(root);
    var tmsg = toast.querySelector("span"), undoBtn = toast.querySelector("button");
    var progI = prog.querySelector("i");

    if (startIdx === 0 && opts.before) {
      var bf = el("div", "thr-before");
      put(bf, opts.before);
      main.appendChild(bf);
    }

    // ---------- גודל ----------
    function applySize(v, keepAnchor) {
      v = Math.max(MIN, Math.min(MAX, v));
      var anchor = null, off = 0;
      if (keepAnchor) {
        var vs = main.querySelectorAll(".thr-v");
        for (var i = 0; i < vs.length; i++) {
          var r = vs[i].getBoundingClientRect();
          if (r.bottom > BAR + 8) { anchor = vs[i]; off = r.top; break; }
        }
      }
      root.style.setProperty("--read-size", v + "px");
      if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - off, behavior: "instant" });
      sm.disabled = v <= MIN;
      lg.disabled = v >= MAX;
      return v;
    }
    var size = applySize(getSize(sizeKey), false);
    sm.addEventListener("click", function () { size = applySize(size - STEP, true); saveSize(size, sizeKey); tick(); });
    lg.addEventListener("click", function () { size = applySize(size + STEP, true); saveSize(size, sizeKey); tick(); });

    // ---------- בניית יחידה ----------
    function verseHtml(text, n) {
      var t = String(text).trim(), sp = t.indexOf(" ");
      var w1 = sp === -1 ? t : t.slice(0, sp), rest = sp === -1 ? "" : t.slice(sp);
      return "<span class='thr-v' data-v='" + n + "'><span class='thr-lead'><span class='thr-vn' aria-hidden='true'>" +
        heb(n) + "</span>" + esc(w1) + "</span>" + esc(rest) + "</span>";
    }
    function doneLabel(u) { return "סיימתי את פרק " + u.d.name; }
    function okLabel(u) { return "\u2713 " + u.d.name + " נקרא"; }
    function paintBtn(u) {
      if (!u.btn) return;
      u.btn.classList.toggle("ok", u.read);
      u.btn.textContent = u.read ? okLabel(u) : doneLabel(u);
      u.btn.setAttribute("aria-pressed", u.read ? "true" : "false");
    }

    function renderUnit(u, verses) {
      var d = u.d;
      var sec = el("section", "thr-unit" + (u.k === startIdx ? " first" : "") + (d.title ? "" : " cont"));
      sec.dataset.key = String(d.key);
      var head = el("div", "thr-head");
      if (d.title) head.appendChild(el("h2", null, esc(d.title)));
      if (d.subtitle) head.appendChild(el("h3", null, esc(d.subtitle)));
      if (d.sub) head.appendChild(el("p", "thr-sub", d.sub));
      u.note = el("p", "thr-note", esc(d.note || ""));
      head.appendChild(u.note);
      sec.appendChild(head);
      var first = d.first || 1;
      var html = verses.map(function (v, j) { return verseHtml(v, first + j); }).join(" ");
      u.txt = el("p", "thr-txt", html);
      sec.appendChild(u.txt);
      u.words = verses.join(" ").split(/\s+/).filter(Boolean).length;
      if (doneButton) {
        var seam = el("div", "thr-seam");
        u.btn = el("button", "thr-done");
        u.btn.type = "button";
        u.btn.addEventListener("click", function () { if (!u.read) mark(u, "button"); });
        seam.appendChild(u.btn);
        sec.appendChild(seam);
        paintBtn(u);
      }
      u.sec = sec;
      u.rendered = true;
      main.appendChild(sec);
    }

    function renderError(u, retry) {
      var box = el("div", "thr-wait", "לא הצלחנו לטעון את " + esc(d0(u)) + ". <button type='button' class='thr-done'>לנסות שוב</button>");
      box.querySelector("button").addEventListener("click", function () { box.remove(); retry(); });
      main.appendChild(box);
    }
    function d0(u) { return "פרק " + u.d.name; }

    // ---------- טעינה הדרגתית: מוסיפים יחידות כשמתקרבים לסוף ----------
    var next = startIdx, loading = false, ended = false, endEl = null, dead = false;
    function getVerses(u) {
      if (u.d.verses) return Promise.resolve(u.d.verses);
      return u.d.load();
    }
    function prefetch(k) {
      for (var j = k; j < Math.min(U.length, k + 2); j++) {
        if (!U[j].d.verses && U[j].d.load) U[j].d.load().catch(function () { /* יטען שוב בתורו */ });
      }
    }
    function ensureAhead() {
      if (loading || dead) return Promise.resolve();
      if (next >= U.length) { renderEnd(); return Promise.resolve(); }
      var room = main.getBoundingClientRect().bottom - window.innerHeight;
      if (room > window.innerHeight * 2.5) return Promise.resolve();
      loading = true;
      var u = U[next];
      return getVerses(u).then(function (verses) {
        loading = false;
        if (dead) return;
        renderUnit(u, verses);
        next++;
        prefetch(next);
        return ensureAhead();
      }, function () {
        loading = false;
        if (dead) return;
        renderError(u, ensureAhead);
      });
    }
    function renderEnd() {
      if (ended) return;
      ended = true;
      if (opts.after) {
        var af = el("div", "thr-after");
        put(af, opts.after);
        main.appendChild(af);
      }
      if (opts.endText || opts.endLabel) {
        endEl = el("div", "thr-end");
        if (opts.endText) endEl.appendChild(el("p", null, esc(opts.endText)));
        if (opts.endLabel) {
          var b = el("button", null, esc(opts.endLabel));
          b.type = "button";
          b.addEventListener("click", goBack);
          endEl.appendChild(b);
        }
        main.appendChild(endEl);
      } else {
        endEl = main.lastElementChild;
      }
    }

    // ---------- סימון, חלון ביטול, שליחה ----------
    var MARKED = [];
    var toastTimer = null, toastUnit = null;
    function showToast(text, u) {
      tmsg.textContent = text;
      undoBtn.hidden = !u;
      toastUnit = u || null;
      toast.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove("on"); toastUnit = null; }, UNDO_MS);
    }
    undoBtn.addEventListener("click", function () {
      var u = toastUnit;
      toast.classList.remove("on");
      toastUnit = null;
      if (!u || !u.pending) return;
      clearTimeout(u.pending);
      u.pending = null;
      u.read = false;
      paintBtn(u);
    });

    function mark(u, how) {
      if (u.read) return;
      u.read = true;
      paintBtn(u);
      showToast("פרק " + u.d.name + " סומן כנקרא", u);
      u.pending = setTimeout(function () { send(u, how); }, UNDO_MS);
    }
    function send(u, how) {
      u.pending = null;
      var p;
      try { p = opts.onMark ? Promise.resolve(opts.onMark(u.d, how)) : Promise.resolve({ ok: true }); }
      catch (e) { p = Promise.reject(e); }
      return p.then(function (r) {
        if (r && r.ok === false) throw new Error("rejected");
        if (MARKED.indexOf(u.d.key) === -1) MARKED.push(u.d.key);
      }).catch(function () {
        u.read = false;
        paintBtn(u);
        if (!dead) showToast("הסימון של פרק " + u.d.name + " לא נקלט. אפשר ללחוץ שוב על סיימתי.", null);
      });
    }
    function flush() {
      var ps = [];
      U.forEach(function (u) {
        if (u.pending) { clearTimeout(u.pending); ps.push(send(u, "flush")); }
      });
      return Promise.all(ps);
    }

    // ---------- מעקב גלילה: מקום, פס, "עבר בקצב קריאה" ----------
    var last = Date.now(), cur = null, lastPlaceAt = 0, placeNow = null, reachedEnd = false, raf = 0;
    function sample() {
      var now = Date.now();
      var dt = document.hidden ? 0 : Math.min(1500, now - last);
      last = now;
      var vh = window.innerHeight, third = vh / 3;
      var newCur = null;
      for (var k = 0; k < U.length; k++) {
        var u = U[k];
        if (!u.rendered) continue;
        var r = u.sec.getBoundingClientRect();
        if (r.bottom > BAR && r.top < vh) {
          u.visMs += dt;
          if (!u.sawStart) {
            var f = u.txt.firstElementChild;
            if (f) {
              var fr = f.getBoundingClientRect();
              if (fr.top >= BAR - 4 && fr.top < vh) u.sawStart = true;
            }
          }
        }
        if (r.top < 120) newCur = u;
        // גלילה לפרק הבא: סוף היחידה עלה לשליש העליון
        if (r.bottom < third) {
          if (!u.passed) {
            u.passed = true;
            if (autoMark && !u.read && u.sawStart && u.visMs >= (u.words / WPS) * 1000) mark(u, "scroll");
          }
        } else if (u.passed) {
          u.passed = false;
        }
      }
      if (!newCur) { for (var q = 0; q < U.length; q++) if (U[q].rendered) { newCur = U[q]; break; } }
      if (newCur && newCur !== cur) {
        var prev = cur;
        cur = newCur;
        if (opts.onCurrent) { try { opts.onCurrent(cur.d, prev ? prev.d : null); } catch (e) { /* לא קריטי */ } }
      }
      if (cur) {
        var vv = cur.txt.querySelectorAll(".thr-v"), top = vv[0];
        for (var j = 0; j < vv.length; j++) {
          if (vv[j].getBoundingClientRect().bottom > BAR + 18) { top = vv[j]; break; }
        }
        var vn = top ? Number(top.dataset.v) : (cur.d.first || 1);
        where.innerHTML = esc(cur.d.barTitle || cur.d.title || ("פרק " + cur.d.name)) +
          (cur.d.of ? "<small>פסוק " + heb(vn) + " מתוך " + heb(cur.d.of) + "</small>" : "");
        var cr = cur.sec.getBoundingClientRect();
        var p = (BAR + 60 - cr.top) / Math.max(1, cr.height - vh + BAR + 120);
        progI.style.width = Math.max(0, Math.min(1, p)) * 100 + "%";
        placeNow = { key: cur.d.key, verse: vn, unit: cur.d };
        if (opts.onPlace && now - lastPlaceAt > 500) {
          lastPlaceAt = now;
          try { opts.onPlace(placeNow); } catch (e) { /* לא קריטי */ }
        }
      }
      if (endEl && !reachedEnd) {
        var er = endEl.getBoundingClientRect();
        if (er.top < vh && er.bottom > 0) {
          reachedEnd = true;
          if (opts.onReachEnd) { try { opts.onReachEnd(); } catch (e) { /* לא קריטי */ } }
        }
      }
    }
    function tick() {
      if (raf || dead) return;
      raf = requestAnimationFrame(function () { raf = 0; sample(); ensureAhead(); });
    }
    function onHide() {
      if (document.visibilityState === "hidden") {
        flush();
        if (placeNow && opts.onPlace) { try { opts.onPlace(placeNow); } catch (e) { /* לא קריטי */ } }
      }
    }
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    var timer = setInterval(sample, 1000);

    function goBack() {
      flush().then(function () { if (opts.onBack) opts.onBack(); });
    }
    back.addEventListener("click", goBack);

    // ---------- פתיחה: בראש המסך, או שני פסוקים לפני המקום ----------
    function scrollToVerse(u, verse) {
      var y = 0;
      var target = Math.max(u.d.first || 1, verse - 2);
      var node = u.txt && u.txt.querySelector(".thr-v[data-v='" + target + "']");
      if (node && target > (u.d.first || 1)) y = node.getBoundingClientRect().top + window.pageYOffset - BAR - 10;
      else if (u.k !== 0) y = u.sec.getBoundingClientRect().top + window.pageYOffset - BAR - 4;
      var rootTop = root.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({ top: Math.max(rootTop, y), behavior: "instant" });
    }
    window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset, behavior: "instant" });
    var ready = ensureAhead().then(function () {
      if (startVerse && U[startIdx] && U[startIdx].rendered) {
        scrollToVerse(U[startIdx], startVerse);
        return ensureAhead();
      }
    }).then(function () { last = Date.now(); sample(); });

    return {
      el: root,
      ready: ready,
      flush: flush,
      current: function () { return cur ? cur.d : null; },
      place: function () { return placeNow; },
      marked: function () { return MARKED.slice(); },
      setNote: function (key, text) {
        var u = byKey[String(key)];
        if (!u) return;
        u.d.note = text || "";
        if (u.note) u.note.textContent = u.d.note;
      },
      setRead: function (key, on) {
        var u = byKey[String(key)];
        if (!u) return;
        if (u.pending && !on) { clearTimeout(u.pending); u.pending = null; }
        u.read = !!on;
        paintBtn(u);
      },
      destroy: function () {
        dead = true;
        flush();
        clearInterval(timer);
        window.removeEventListener("scroll", tick);
        window.removeEventListener("resize", tick);
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", flush);
        mount.innerHTML = "";
      }
    };
  }

  g.THReader = {
    create: create,
    bookUnits: bookUnits,
    heb: heb,
    hebName: hebName,
    LETTERS: LETTERS,
    getSize: getSize,
    SIZE_KEY: SIZE_KEY,
    MIN: MIN, MAX: MAX, DEFAULT: DEF
  };
})(typeof window !== "undefined" ? window : this);
