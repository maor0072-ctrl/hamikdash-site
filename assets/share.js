/* share.js - כפתור "שתפו לחברים" לדפי מסירת השמות באתר המקדש.
 *
 * שימוש בדף: אלמנט ריק עם הטקסט בתוך תכונת data, ואז טעינת הקובץ הזה.
 *   <div class="shr" data-share-text="מצאתי אתר מדהים ..."></div>
 *   <script src="/assets/share.js" defer></script>
 *
 * שלוש הכרעות שקודדו כאן, ולא לשנות בלי לקרוא את הסיבה:
 *
 * 1. **הטקסט מגיע מתכונת HTML ולא ממחרוזת JavaScript.** גרשיים עבריות בתוך
 *    מחרוזת קוד כבר שברו באתר הזה סקריפט שלם, בשקט ובלי שום הודעת שגיאה.
 * 2. **מחלקות בתחילית `shr-` בלבד.** בכמה דפים יושב בלוק style פנימי שגובר על
 *    הגיליון החיצוני, ושם מחלקה כללי היה נתפס בו.
 * 3. **שיתוף המערכת מוצג רק כשהוא באמת קיים.** navigator.share אינו קיים
 *    בדפדפני מחשב, וכפתור שלא עושה כלום גרוע מכפתור חסר.
 */
(function () {
  "use strict";

  var CSS =
    // max-width + margin auto: הקופסה מוזרקת כילד אחרון של המסך, ולפעמים
    // מחוץ ל-wrap ולפעמים בתוכו. היישור הזה מחזיק אותה על אותו קו בשני המצבים.
    ".shr{margin:26px auto 0;max-width:760px;padding:18px 20px;" +
    "border:1px solid #e6dfd1;border-radius:12px;background:#fdfbf6}" +
    "@media(max-width:860px){.shr{margin-inline:18px}}" +
    ".shr-title{font-weight:700;color:#1c1a17;margin:0 0 4px;font-size:17px}" +
    ".shr-sub{color:#6b6459;margin:0 0 14px;font-size:15px;line-height:1.6}" +
    ".shr-row{display:flex;flex-wrap:wrap;gap:10px}" +
    ".shr-btn{display:inline-flex;align-items:center;gap:7px;cursor:pointer;" +
    "font:inherit;font-size:15px;font-weight:600;border-radius:9px;" +
    "padding:11px 18px;border:1px solid #d9d0bd;background:#fff;color:#1c1a17;" +
    "text-decoration:none;-webkit-tap-highlight-color:transparent}" +
    ".shr-btn:hover{border-color:#b08434}" +
    ".shr-btn-main{background:#1f3a5f;border-color:#1f3a5f;color:#fff}" +
    ".shr-btn-main:hover{border-color:#1f3a5f;opacity:.92}" +
    ".shr-btn-wa{background:#1d8c4a;border-color:#1d8c4a;color:#fff}" +
    ".shr-btn-wa:hover{border-color:#1d8c4a;opacity:.92}" +
    ".shr-said{color:#1d8c4a;font-weight:600;font-size:15px;margin:10px 0 0;" +
    "min-height:1em}";

  function css() {
    if (document.getElementById("shr-css")) return;
    var s = document.createElement("style");
    s.id = "shr-css";
    s.appendChild(document.createTextNode(CSS));
    document.head.appendChild(s);
  }

  // הכתובת לשיתוף: הדף עצמו בלי פרמטרים ובלי עוגן. פרמטר שנשאר בכתובת
  // עלול לשאת אסימון אישי של המוסר, ואסור שהוא יעבור הלאה לחבר.
  function pageUrl(box) {
    var given = box.getAttribute("data-share-url");
    if (given) return given;
    return location.origin + location.pathname;
  }

  function build(box) {
    var text = (box.getAttribute("data-share-text") || "").trim();
    var url = pageUrl(box);
    var full = text ? text + "\n" + url : url;

    var title = box.getAttribute("data-share-title") || "שתפו לחברים";
    var sub =
      box.getAttribute("data-share-sub") ||
      "כל אחד שמצרפים הוא עוד שם שעולה לתפילה.";

    var h = document.createElement("p");
    h.className = "shr-title";
    h.appendChild(document.createTextNode(title));

    var p = document.createElement("p");
    p.className = "shr-sub";
    p.appendChild(document.createTextNode(sub));

    var row = document.createElement("div");
    row.className = "shr-row";

    var said = document.createElement("p");
    said.className = "shr-said";

    // שיתוף מערכת - רק אם הדפדפן באמת תומך.
    if (navigator.share) {
      var nat = document.createElement("button");
      nat.type = "button";
      nat.className = "shr-btn shr-btn-main";
      nat.appendChild(document.createTextNode("שיתוף"));
      nat.addEventListener("click", function () {
        navigator.share({ text: full }).catch(function () {});
      });
      row.appendChild(nat);
    }

    var wa = document.createElement("a");
    wa.className = "shr-btn shr-btn-wa";
    wa.href = "https://wa.me/?text=" + encodeURIComponent(full);
    wa.target = "_blank";
    wa.rel = "noopener";
    wa.appendChild(document.createTextNode("וואטסאפ"));
    row.appendChild(wa);

    var cp = document.createElement("button");
    cp.type = "button";
    cp.className = "shr-btn";
    cp.appendChild(document.createTextNode("העתקת הקישור"));
    cp.addEventListener("click", function () {
      copy(full, said);
    });
    row.appendChild(cp);

    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(row);
    box.appendChild(said);
  }

  // clipboard.writeText אינו קיים בדפדפנים ישנים ונחסם מחוץ ל-https,
  // ולכן יש נפילה אחורה ל-textarea + execCommand. בלעדיה הכפתור שותק.
  function copy(value, said) {
    function done() {
      said.textContent = "הקישור הועתק";
      setTimeout(function () {
        said.textContent = "";
      }, 2500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done, function () {
        legacy(value, done);
      });
      return;
    }
    legacy(value, done);
  }

  function legacy(value, done) {
    var t = document.createElement("textarea");
    t.value = value;
    t.setAttribute("readonly", "");
    t.style.position = "fixed";
    t.style.top = "0";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      /* אין דרך נוספת; עדיף שקט מאשר הודעת שגיאה למבקר */
    }
    document.body.removeChild(t);
  }

  function init() {
    var boxes = document.querySelectorAll(".shr");
    if (!boxes.length) return;
    css();
    for (var i = 0; i < boxes.length; i++) build(boxes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
