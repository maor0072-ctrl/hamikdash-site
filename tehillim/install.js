/* תהילים ישראל - התקנה כאפליקציה (22.11.2026).
 *
 * טוענים בכל דף של תהילים ישראל:  <script src="/tehillim/install.js" defer></script>
 * הקובץ לבדו:
 *   - רושם את ה-service worker (/tehillim-sw.js, scope "/tehillim").
 *   - תופס את beforeinstallprompt באנדרואיד ושומר אותו לכפתור התקנה אמיתי.
 *   - באפליקציה המותקנת מבקש מה-service worker לחמם את כל טקסטי הפרקים לקריאה בלי רשת.
 * הוא אינו מציג דבר מעצמו. הדף מחליט מתי (המפרט: מיד אחרי שמירת הרשימה הראשונה):
 *
 *   TehillimInstall.detect()          -> {platform, inApp, browser, standalone, canPrompt}
 *   TehillimInstall.show(el, opts)    -> מציג את ההנחיה המתאימה בתוך el (או ככרטיס צף
 *                                        בתחתית המסך אם el חסר). מחזיר Promise<מה הוצג>.
 *       opts.personalLink  - הקישור האישי. באייפון מועתק ללוח ומוסבר איך להעביר אותו לאפליקציה.
 *       opts.force         - להציג גם אם המשתמש לחץ "לא עכשיו" לאחרונה.
 *   TehillimInstall.prompt()          -> Promise<"accepted"|"dismissed"|"unavailable">
 *   TehillimInstall.copy(text)        -> Promise<boolean>
 *   TehillimInstall.dismissed()       -> האם נלחץ "לא עכשיו" ב-14 הימים האחרונים
 * אירועים על window: "tehillim-install-ready" (אפשר כפתור התקנה), "tehillim-installed".
 *
 * הנוסחים לפי סעיף ד במחקר (outputs/documents/2026-11-22-tehillim-personal-research.md).
 */
(function () {
  "use strict";
  var DISMISS_KEY = "tehillim.install.dismissedAt";
  var DISMISS_MS = 14 * 24 * 3600 * 1000;
  var deferred = null;
  var installedNow = false;

  // ===== service worker =====
  function isStandalone() {
    try {
      return (
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        window.navigator.standalone === true
      );
    } catch (e) {
      return false;
    }
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("/tehillim-sw.js", { scope: "/tehillim" })
        .then(function (reg) {
          if (!isStandalone()) return;
          var send = function (w) {
            if (w) w.postMessage({ type: "warm-texts" });
          };
          if (reg.active) send(reg.active);
          else
            navigator.serviceWorker.ready.then(function (r) {
              send(r.active);
            });
        })
        .catch(function () {
          /* בלי service worker האתר עובד כרגיל, רק בלי קריאה בלי רשת */
        });
    });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    window.dispatchEvent(new Event("tehillim-install-ready"));
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    installedNow = true;
    window.dispatchEvent(new Event("tehillim-installed"));
  });

  // ===== זיהוי =====
  function detect() {
    var ua = navigator.userAgent || "";
    var ios =
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var android = /Android/i.test(ua);
    var inApp = null;
    if (/WhatsApp/i.test(ua)) inApp = "whatsapp";
    else if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) inApp = "facebook";
    else if (/Instagram/i.test(ua)) inApp = "instagram";
    else if (/Telegram/i.test(ua)) inApp = "telegram";
    else if (android && /; wv\)/.test(ua)) inApp = "webview";
    else if (ios && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) inApp = "webview";
    var browser = "other";
    if (ios) {
      if (/CriOS/.test(ua)) browser = "chrome";
      else if (/EdgiOS/.test(ua)) browser = "edge";
      else if (/FxiOS/.test(ua)) browser = "firefox";
      else if (!inApp) browser = "safari";
    } else if (/SamsungBrowser/i.test(ua)) browser = "samsung";
    else if (/Firefox\//.test(ua)) browser = "firefox";
    else if (/EdgA?\//.test(ua)) browser = "edge";
    else if (/Chrome\//.test(ua)) browser = "chrome";
    return {
      platform: ios ? "ios" : android ? "android" : "other",
      inApp: inApp,
      browser: browser,
      standalone: isStandalone() || installedNow,
      canPrompt: !!deferred,
    };
  }

  function dismissed() {
    try {
      var t = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return t > 0 && Date.now() - t < DISMISS_MS;
    } catch (e) {
      return false;
    }
  }

  function prompt() {
    if (!deferred) return Promise.resolve("unavailable");
    var e = deferred;
    deferred = null; // prompt() מותר פעם אחת בלבד על אותו אירוע
    e.prompt();
    return e.userChoice
      .then(function (c) {
        return c && c.outcome === "accepted" ? "accepted" : "dismissed";
      })
      .catch(function () {
        return "dismissed";
      });
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return fallbackCopy(text);
        }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ===== תצוגה =====
  var CSS =
    ".ti-card{direction:rtl;text-align:right;background:var(--white,#fff);border:1px solid var(--line,#e3d9c8);" +
    "border-radius:var(--radius,10px);box-shadow:var(--shadow,0 2px 16px rgba(28,26,23,.07));padding:18px 18px 14px;" +
    "font-size:17px;line-height:1.6;color:var(--ink,#1c1a17)}" +
    ".ti-card p{margin:0 0 10px}.ti-card .ti-note{font-size:15px;color:var(--ink-soft,#4a453e)}" +
    ".ti-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}" +
    ".ti-btn{font:inherit;font-weight:700;border-radius:8px;padding:10px 16px;cursor:pointer;" +
    "border:1px solid var(--gold,#b08434);background:var(--gold,#b08434);color:#fff}" +
    ".ti-btn.ti-sec{background:transparent;color:var(--gold-deep,#8a6524)}" +
    ".ti-float{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto}";

  function injectCss() {
    if (document.getElementById("ti-css")) return;
    var s = document.createElement("style");
    s.id = "ti-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function btn(label, secondary, onClick) {
    var b = el("button", "ti-btn" + (secondary ? " ti-sec" : ""), label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function chromeIntent() {
    var u = location.href.replace(/^https?:\/\//, "");
    return "intent://" + u + "#Intent;scheme=https;package=com.android.chrome;end";
  }

  function waitForPrompt(ms) {
    if (deferred) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var done = false;
      var h = function () {
        if (done) return;
        done = true;
        resolve(true);
      };
      window.addEventListener("tehillim-install-ready", h, { once: true });
      setTimeout(function () {
        if (done) return;
        done = true;
        window.removeEventListener("tehillim-install-ready", h);
        resolve(!!deferred);
      }, ms);
    });
  }

  // מחזיר את סוג ההנחיה שהוצגה: "installed" | "android-prompt" | "android-inapp" |
  // "android-menu" | "ios-safari" | "ios-other-browser" | "ios-inapp" | "desktop" | "dismissed"
  function show(container, opts) {
    opts = opts || {};
    var d = detect();
    if (d.standalone) return Promise.resolve("installed");
    if (!opts.force && dismissed()) return Promise.resolve("dismissed");
    var wait = d.platform === "android" && !d.inApp ? waitForPrompt(3000) : Promise.resolve(false);
    return wait.then(function () {
      d = detect();
      injectCss();
      var card = el("div", "ti-card");
      var row = el("div", "ti-row");
      var kind;
      var link = opts.personalLink || location.href;

      function close() {
        if (card.parentNode) card.parentNode.removeChild(card);
      }
      function later() {
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch (e) {}
        close();
      }
      function copyBtn() {
        var b = btn("העתקת הקישור", true, function () {
          copy(link).then(function (ok) {
            b.textContent = ok ? "הקישור הועתק" : "לא הצלחנו להעתיק";
          });
        });
        return b;
      }

      if (d.canPrompt) {
        kind = "android-prompt";
        card.appendChild(el("p", "", "רוצים שתהילים ישראל יהיה באייקון בטלפון, כמו אפליקציה? בלי חנות ובלי הרשמה."));
        row.appendChild(
          btn("התקנה", false, function () {
            prompt().then(function (r) {
              if (r === "accepted") close();
            });
          })
        );
      } else if (d.platform === "android" && d.inApp) {
        kind = "android-inapp";
        card.appendChild(el("p", "", "כדי להתקין, צריך לפתוח את הדף בכרום: לחצו על שלוש הנקודות למעלה ובחרו 'פתח ב-Chrome'."));
        row.appendChild(
          btn("פתיחה בכרום", false, function () {
            location.href = chromeIntent();
          })
        );
        row.appendChild(copyBtn());
      } else if (d.platform === "android") {
        kind = "android-menu";
        card.appendChild(
          el("p", "", "להוספה למסך הבית: לחצו על תפריט הדפדפן (שלוש הנקודות או שלושת הקווים) ובחרו 'הוספה למסך הבית' או 'התקנת אפליקציה'.")
        );
      } else if (d.platform === "ios" && d.inApp) {
        kind = "ios-inapp";
        card.appendChild(
          el("p", "", "הדף נפתח בתוך אפליקציה אחרת. לחצו על סמל המצפן או על 'פתח בספארי', או העתיקו את הקישור והדביקו בספארי.")
        );
        row.appendChild(copyBtn());
      } else if (d.platform === "ios" && d.browser !== "safari") {
        kind = "ios-other-browser";
        card.appendChild(el("p", "", "להוספה למסך הבית: לחצו על כפתור השיתוף שליד הכתובת, גללו ובחרו 'הוסף למסך הבית', ואז 'הוסף'."));
      } else if (d.platform === "ios") {
        kind = "ios-safari";
        card.appendChild(
          el(
            "p",
            "",
            "להוספה למסך הבית: לחצו על כפתור השיתוף (ריבוע עם חץ למעלה. בגרסאות החדשות הוא בתוך שלוש הנקודות שליד הכתובת), גללו ובחרו 'הוסף למסך הבית', ואז 'הוסף'."
          )
        );
      } else {
        kind = "desktop";
        card.appendChild(el("p", "", "תהילים ישראל נפתח הכי נוח מהטלפון, באייקון במסך הבית. פתחו את הקישור הזה בטלפון כדי להתקין."));
        row.appendChild(copyBtn());
      }

      // באייפון האפליקציה המותקנת לא רואה את מה שנשמר בספארי, ולכן מעתיקים את הקישור
      // האישי בלחיצה (ספארי מתיר כתיבה ללוח רק מתוך לחיצה), והאפליקציה תציע להדביק אותו.
      if (d.platform === "ios" && opts.personalLink) {
        card.appendChild(
          el(
            "p",
            "ti-note",
            "חשוב: האפליקציה באייפון לא רואה את מה שנשמר בדפדפן. לפני ההתקנה העתיקו את הקישור האישי, ואחרי ההתקנה פתחו את האפליקציה ולחצו 'הדבקת הקישור האישי'. ההתקנה עצמה אינה גיבוי, ולכן כדאי לשמור את הקישור גם אצלכם."
          )
        );
        var pb = btn("העתקת הקישור האישי", false, function () {
          copy(opts.personalLink).then(function (ok) {
            pb.textContent = ok ? "הקישור האישי הועתק" : "לא הצלחנו להעתיק";
          });
        });
        row.appendChild(pb);
      }

      row.appendChild(btn("לא עכשיו", true, later));
      card.appendChild(row);
      if (container) {
        container.innerHTML = "";
        container.appendChild(card);
      } else {
        card.className += " ti-float";
        document.body.appendChild(card);
      }
      return kind;
    });
  }

  window.TehillimInstall = {
    detect: detect,
    show: show,
    prompt: prompt,
    copy: copy,
    dismissed: dismissed,
    isStandalone: isStandalone,
  };
})();
