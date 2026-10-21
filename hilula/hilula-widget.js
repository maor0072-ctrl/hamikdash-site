/* בס"ד
 * חלונות „סגולת היום · הילולת צדיקים" - קובץ אחד לשלושת האתרים (המקדש, האמונה, רשימו).
 * הטמעה:
 *   <div data-hilula="names"></div>   גלילת שמות צדיקי היום
 *   <div data-hilula="day"></div>     סגולת היום ונתוני היום
 *   <script src="https://hamikdash.co.il/hilula/hilula-widget.js" data-feed="https://hamikdash.co.il/hilula/hilula-feed.json" defer></script>
 * היום נבחר לפי starts_at (שקיעה בירושלים בערב שלפני), כלומר החלון מתחלף בשקיעה ולא בחצות.
 */
(function () {
  var me = document.currentScript;
  var FEED = (me && me.getAttribute("data-feed")) || "hilula-feed.json";
  var PAGE = "https://hamikdash.co.il/hilula.html";

  var css = "" +
    ".hlw{direction:rtl;text-align:right;font-family:'Frank Ruhl Libre','David',serif;background:#f7f3e8;color:#13263f;" +
    "border:2px solid #9a6b2f;border-radius:10px;padding:12px 16px;box-sizing:border-box;max-width:100%;overflow:hidden}" +
    ".hlw h3{margin:0 0 6px;font-size:1.1em;color:#9a6b2f}.hlw .hlw-d{font-size:.85em;color:#5b6675;margin-bottom:8px}" +
    ".hlw-roll{overflow:hidden;white-space:nowrap;width:100%}" +
    ".hlw-track{display:inline-flex;width:max-content;animation:hlw-run var(--hlw-s,30s) linear infinite}" +
    ".hlw-roll:hover .hlw-track{animation-play-state:paused}" +
    ".hlw-track span{margin-left:2.5em;flex:none}.hlw-track b{color:#13263f}" +
    "@keyframes hlw-run{from{transform:translateX(0)}to{transform:translateX(50%)}}" +
    "@media (prefers-reduced-motion:reduce){.hlw-track{animation:none;flex-wrap:wrap;width:auto}.hlw-roll{white-space:normal}}" +
    ".hlw p{margin:4px 0;line-height:1.5}.hlw a{color:#9a6b2f}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function today(days) {
    var now = Date.now(), cur = null;
    for (var i = 0; i < days.length; i++) {
      if (Date.parse(days[i].starts_at) <= now) cur = days[i];
    }
    return cur;
  }

  function names(el, d) {
    var head = "<h3>" + esc(d.title) + "</h3><div class='hlw-d'>" + esc(d.hebrew_date) + " · יום " + esc(d.weekday) + "</div>";
    if (!d.tzadikim.length) {
      el.innerHTML = "<div class='hlw'>" + head + "<p>אין בלוח שלנו הילולה ביום הזה. <a href='" + PAGE + "'>ההילולות של השבוע</a></p></div>";
      return;
    }
    var items = d.tzadikim.map(function (z) {
      return "<span><b>" + esc(z.name) + "</b>" + (z.burial_place ? " - " + esc(z.burial_place) : "") + "</span>";
    }).join("");
    items += items; // שני עותקים - הגלילה רציפה בלי קפיצה
    el.innerHTML = "<div class='hlw'>" + head + "<a class='hlw-roll' href='" + PAGE + "' style='display:block;text-decoration:none'>" +
      "<div class='hlw-track' style='--hlw-s:" + Math.max(18, d.tzadikim.length * 9) + "s'>" + items + "</div></a></div>";
  }

  function day(el, d) {
    var h = "<div class='hlw'><h3>סגולה ליום הזה</h3><div class='hlw-d'>" + esc(d.hebrew_date) + "</div>";
    if (d.segula) h += "<p>" + esc(d.segula) + "</p>";
    if (d.wisdom) h += "<p>„" + esc(d.wisdom.text) + "\" (" + esc(d.wisdom.source) + ")" + (d.wisdom.explanation ? "<br>" + esc(d.wisdom.explanation) : "") + "</p>";
    var lines = (d.prayer || []).slice();
    for (var k in (d.learning || {})) lines.push(k + ": " + d.learning[k]);
    if (lines.length) h += "<p><b>נתוני היום:</b> " + lines.map(esc).join(" · ") + "</p>";
    h += "<p><a href='" + PAGE + "'>כל צדיקי היום וההילולות של השבוע</a></p></div>";
    el.innerHTML = h;
  }

  function render(data) {
    var d = today(data.days || []);
    if (!d) return;
    document.querySelectorAll("[data-hilula]").forEach(function (el) {
      (el.getAttribute("data-hilula") === "names" ? names : day)(el, d);
    });
  }

  fetch(FEED, { cache: "no-cache" }).then(function (r) { return r.json(); }).then(render).catch(function () {});
})();
