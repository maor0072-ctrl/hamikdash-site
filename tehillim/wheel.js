// בוחר גלגל (wheel picker) לטלפון ולמחשב - בלי ספריות.
// הערך הנבחר במרכז, שורה לפניו ושורה אחריו. גלגל מעגלי מסתובב: לפני הראשון בא האחרון.
// גלילה באצבע או בגלגלת העכבר (scroll-snap), לחיצה על שורה, ומקלדת: חצים, PageUp/PageDown, Home/End.
// נגישות: role="spinbutton" עם aria-valuenow / aria-valuetext.
//
// const w = makeWheel(el, { items: [{ value, label, sub? }], value, cyclic: true, label: "חודש", onChange(value) {}, onPick(value) {} });
// onChange - רק כשהערך השתנה בידי המשתמש; onPick - בכל בחירה של המשתמש. set/setItems אינם יורים אף אחד מהם.
// w.set(value)  w.get()  w.setItems(items, value)

const ROW = 44;           // גובה שורה בפיקסלים - גם ב-CSS (.wh-row)
const COPIES = 7;         // עותקים של הרשימה בגלגל מעגלי; תמיד חוזרים לעותק האמצעי

export function makeWheel(el, opt) {
  let items = [], value = null, cyclic = !!opt.cyclic, settleT = 0, quiet = 0;
  el.classList.add("wh");
  el.setAttribute("role", "spinbutton");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", opt.label || "");
  const vp = document.createElement("div"); vp.className = "wh-vp";
  el.textContent = ""; el.appendChild(vp);

  const n = () => items.length;
  const copies = () => (cyclic ? COPIES : 1);
  const mid = () => (cyclic ? Math.floor(COPIES / 2) * n() : 0);
  const idxOf = (v) => items.findIndex((it) => String(it.value) === String(v));

  function render() {
    const h = [];
    h.push("<div class='wh-pad'></div>");
    for (let c = 0; c < copies(); c++) items.forEach((it, i) => {
      h.push("<div class='wh-row' data-i='" + i + "' aria-hidden='true'>" + esc(it.label) + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</div>");
    });
    h.push("<div class='wh-pad'></div>");
    vp.innerHTML = h.join("");
  }
  function aria() {
    const i = idxOf(value), it = items[i];
    el.setAttribute("aria-valuenow", i < 0 ? "" : String(i + 1));
    el.setAttribute("aria-valuemin", "1"); el.setAttribute("aria-valuemax", String(n()));
    el.setAttribute("aria-valuetext", it ? it.label + (it.sub ? " " + it.sub : "") : "");
    vp.querySelectorAll(".wh-row.on").forEach((r) => r.classList.remove("on"));
    if (i >= 0) vp.querySelectorAll(".wh-row[data-i='" + i + "']").forEach((r) => r.classList.add("on"));
  }
  // גלילה לשורה (מיקום מוחלט בתוך הגלגל), בלי לירות שינוי
  let lastRow = 0, recT = 0;
  function scrollToRow(row, smooth) {
    lastRow = row;
    if (!vp.clientHeight) return;            // מוסתר - ResizeObserver ימקם כשיוצג
    quiet = Date.now() + (smooth ? 600 : 120);
    vp.scrollTo({ top: row * ROW, behavior: smooth ? "smooth" : "instant" });
    // אחרי אנימציה בגלגל מעגלי - חוזרים בשקט לעותק האמצעי (אותה שורה בדיוק במרכז, אין קפיצה נראית)
    clearTimeout(recT);
    if (smooth && cyclic) recT = setTimeout(() => { if (Date.now() >= quiet) place(); }, 650);
  }
  function place() { const i = idxOf(value); if (i >= 0) scrollToRow(mid() + i, false); }
  // t - אינדקס יעד שעשוי לחרוג מהטווח (בגלגל מעגלי מסתובב); row - השורה שאליה גוללים בהנפשה
  function choose(t, row) {
    if (!n()) return;
    const cur = idxOf(value);
    if (row == null) row = cyclic ? lastRow + (t - cur) : t;
    const i = ((t % n()) + n()) % n();
    const changed = String(items[i].value) !== String(value);
    value = items[i].value; aria();
    scrollToRow(row, true);
    if (opt.onPick) opt.onPick(value);       // כל בחירה של המשתמש, גם בלי שינוי - לפני onChange
    if (changed && opt.onChange) opt.onChange(value);
  }
  function settle() {
    if (!n()) return;
    const row = Math.round(vp.scrollTop / ROW);
    const i = ((row % n()) + n()) % n();
    if (cyclic && (row < n() || row >= (COPIES - 1) * n())) { scrollToRow(mid() + i, false); }
    else if (Math.abs(vp.scrollTop - row * ROW) > 1) { scrollToRow(row, false); }
    else lastRow = row;
    const changed = String(items[i].value) !== String(value);
    value = items[i].value; aria();
    if (opt.onPick) opt.onPick(value);       // כל בחירה של המשתמש, גם בלי שינוי - לפני onChange
    if (changed && opt.onChange) opt.onChange(value);
  }
  vp.addEventListener("scroll", () => {
    clearTimeout(settleT);
    // תוך כדי גלילה - השורה שבמרכז מודגשת מיד
    const row = Math.round(vp.scrollTop / ROW);
    vp.querySelectorAll(".wh-row.mid").forEach((r) => r.classList.remove("mid"));
    const r = vp.children[row + 1]; if (r) r.classList.add("mid");
    if (Date.now() < quiet) return;
    settleT = setTimeout(settle, 140);
  }, { passive: true });
  vp.addEventListener("click", (e) => {
    const r = e.target.closest(".wh-row"); if (!r) return;
    const row = [...vp.children].indexOf(r) - 1;
    choose(+r.dataset.i, row);
    el.focus({ preventScroll: true });
  });
  el.addEventListener("keydown", (e) => {
    const i = idxOf(value); let t = null;
    if (e.key === "ArrowUp") t = i - 1; else if (e.key === "ArrowDown") t = i + 1;
    else if (e.key === "PageUp") t = i - 5; else if (e.key === "PageDown") t = i + 5;
    else if (e.key === "Home") t = 0; else if (e.key === "End") t = n() - 1;
    if (t == null) return;
    e.preventDefault();
    if (!cyclic) t = Math.max(0, Math.min(n() - 1, t));
    choose(t);
  });
  // גלגלת עכבר ומשטח מגע במחשב: שורה אחת לכל "נקישה", במקום קפיצה של כמה שורות
  let acc = 0;
  vp.addEventListener("wheel", (e) => {
    if (!n() || e.ctrlKey) return;
    e.preventDefault();
    acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (Math.abs(acc) < 30) return;
    const step = acc > 0 ? 1 : -1; acc = 0;
    const t = idxOf(value) + step;
    if (!cyclic && (t < 0 || t >= n())) return;
    choose(t);
  }, { passive: false });
  if (window.ResizeObserver) new ResizeObserver(() => { if (vp.clientHeight) place(); }).observe(vp);

  const api = {
    get: () => value,
    set(v) { if (idxOf(v) < 0) return; value = items[idxOf(v)].value; aria(); place(); },
    setItems(list, v) {
      items = list.slice(); render();
      const k = idxOf(v != null ? v : value);
      value = k >= 0 ? items[k].value : (items[0] ? items[0].value : null);
      aria(); place();
    },
  };
  api.setItems(opt.items || [], opt.value);
  return api;
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
