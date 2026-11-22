// Service worker של תהילים ישראל (22.11.2026).
//
// יושב בשורש האתר כדי שיוכל לשלוט גם ב-/tehillim.html וגם ב-/tehillim/*,
// ונרשם עם scope "/tehillim" (התאמת קידומת - שאר האתר לא בשליטתו).
//
// אסטרטגיה צנועה, בכוונה:
//   דפי HTML (ניווט)      - רשת קודם. עדכון דף מגיע מיד; המטמון רק לגיבוי בלי רשת.
//   טקסטי הפרקים, units   - מהמטמון מיד, ומתעדכן ברקע (stale-while-revalidate).
//   /assets, אייקונים, גופנים - אותו דבר.
//   כל השאר (ה-API ב-t.hamikdash.co.il, POST, צד שלישי) - לא נוגעים, עובר ישר לרשת.
// להחלפת גרסה: להעלות את VERSION. מטמונים ישנים נמחקים ב-activate.

const VERSION = "v1";
const CACHE = "tehillim-" + VERSION;
const TEXT_COUNT = 171; // tehillim/text/0.json עד 170.json

const PRECACHE = [
  "/tehillim.html",
  "/tehillim/units.json",
  "/assets/style.css",
  "/assets/favicon.png",
  "/tehillim/manifest.webmanifest",
  "/tehillim/icons/icon-192.png",
  "/tehillim/icons/icon-512.png",
  "/tehillim/install.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // כל קובץ בנפרד: קובץ אחד שחסר לא מפיל את ההתקנה כולה.
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tehillim-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// הדף המותקן מבקש לחמם את כל טקסטי הפרקים (כ-800KB), כדי שכל פרק ייפתח גם בלי רשת.
// רק באפליקציה המותקנת - מבקר רגיל בדף לא מוריד את כל הספר בשביל זה.
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type !== "warm-texts") return;
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      for (let i = 0; i < TEXT_COUNT; i++) {
        const u = "/tehillim/text/" + i + ".json";
        if (await c.match(u)) continue;
        try {
          const r = await fetch(u);
          if (r.ok) await c.put(u, r);
        } catch (e) {
          return; // אין רשת - ננסה בפעם הבאה
        }
      }
    })
  );
});

function isStatic(url) {
  // הדפים מושכים את הטקסט בכתובת מלאה של hamikdash.co.il, גם כשנפתחו ב-www.
  if (url.origin === self.location.origin || url.hostname === "hamikdash.co.il") {
    return (
      url.pathname.startsWith("/tehillim/text/") ||
      url.pathname === "/tehillim/units.json" ||
      url.pathname.startsWith("/tehillim/icons/") ||
      url.pathname === "/tehillim/manifest.webmanifest" ||
      url.pathname.startsWith("/assets/") ||
      /^\/tehillim\/[^/]+\.js$/.test(url.pathname)
    );
  }
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

function staleWhileRevalidate(event, req) {
  return caches.open(CACHE).then((c) =>
    c.match(req).then((hit) => {
      const net = fetch(req)
        .then((r) => {
          if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone());
          return r;
        })
        .catch(() => hit);
      if (hit) {
        event.waitUntil(net.catch(() => null));
        return hit;
      }
      return net;
    })
  );
}

function networkFirst(req) {
  return fetch(req)
    .then((r) => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return r;
    })
    .catch(() =>
      caches
        .match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match("/tehillim.html"))
        .then(
          (hit) =>
            hit ||
            new Response("<!DOCTYPE html><html lang='he' dir='rtl'><meta charset='utf-8'><body style='font-family:Arial;padding:30px;font-size:18px'>אין חיבור לרשת כרגע. נסו שוב בעוד רגע.</body></html>", {
              status: 503,
              headers: { "content-type": "text/html; charset=utf-8" },
            })
        )
    );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    if (url.origin !== self.location.origin) return;
    event.respondWith(networkFirst(req));
    return;
  }
  if (isStatic(url)) {
    event.respondWith(staleWhileRevalidate(event, req));
  }
  // כל השאר - בלי respondWith, הדפדפן מטפל כרגיל.
});
