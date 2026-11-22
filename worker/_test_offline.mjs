// בדיקת בסיס המונה שמחוץ לאתר (22.11.2026): 2 ספרים על כל שבת שיצאה אחרי 5.11.2026.
// מריצים: node worker/_test_offline.mjs
import { offlineBase, shabbatotEndedSince, shabbatEndMs } from "./tehillim-offline.js";

let fails = 0, passes = 0;
function eq(got, want, name) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
  ok ? passes++ : fails++;
}
// שעון ישראל בחורף: UTC+2
const il = (s) => Date.parse(s + "+02:00");

eq(offlineBase(il("2026-11-05T12:00:00")), { books: 18, chapters: 2700, asOf: "2026-11-05", weeklyShabbatot: 0 }, "ביום asOf - הבסיס בלבד");
eq(offlineBase(il("2026-11-07T12:00:00")).books, 18, "שבת 7.11 בצהריים - עוד לא יצאה");
eq(offlineBase(il("2026-11-07T17:59:00")).books, 18, "7.11 17:59 - לפני צאת השבת המחמירה (18:01)");
eq(offlineBase(il("2026-11-07T18:05:00")).books, 20, "7.11 18:05 - אחרי צאת השבת: 20 ספרים");
eq(offlineBase(il("2026-11-07T18:05:00")).chapters, 3000, "ו-3000 פרקים");
eq(offlineBase(il("2026-11-21T17:50:00")).books, 22, "21.11 לפני היציאה - שתי שבתות");
eq(offlineBase(il("2026-11-22T23:36:00")), { books: 24, chapters: 3600, asOf: "2026-11-05", weeklyShabbatot: 3 }, "22.11.2026 23:36 - 24 ספרים ו-3600 פרקים (7.11, 14.11, 21.11)");
eq(offlineBase(il("2026-11-28T20:00:00")).books, 26, "28.11 אחרי היציאה - 26");
eq(shabbatotEndedSince("2026-11-05", il("2026-11-04T00:00:00")), 0, "לפני asOf - אפס, לא שלילי");
eq(shabbatotEndedSince("2026-11-07", il("2026-11-07T20:00:00")), 0, "שבת שחלה ביום asOf עצמו כבר בבסיס");
eq(shabbatotEndedSince("bad", Date.now()), 0, "asOf פגום - אפס");
// מחוץ לטבלת חלונות השקט (אחרי 2032): שבת 18:00 UTC = 20:00 בחורף בישראל
const sat = Date.parse("2033-01-01T00:00:00Z");
eq(new Date(shabbatEndMs(sat)).toISOString(), "2033-01-01T18:00:00.000Z", "בלי חלון - 18:00 UTC");
// שבת אקראית בטבלה: הסוף תמיד אחרי 15:00 UTC (17:00 בחורף בישראל)
const satYt = Date.parse("2027-10-02T00:00:00Z");
eq(shabbatEndMs(satYt) > satYt + 15 * 3600000, true, "סוף שבת תמיד אחרי 17:00 בישראל");

console.log("\n" + passes + " עברו, " + fails + " נכשלו");
process.exit(fails ? 1 : 0);
