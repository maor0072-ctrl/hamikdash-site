// תהילים אישי - ימים שאין בהם תחנון (לפרק כ' בימים שאין בהם תחנון). ES module, בלי תלויות מלבד personal-core.js.
// כל חישובי הלוח - מ-personal-core.js בלבד. תאריך עברי = { year, month, day } במספור של personal-core.js
// (1 ניסן ... 7 תשרי ... 12 אדר / אדר א', 13 אדר ב').
//
// המקור: שולחן ערוך אורח חיים סימן קלא סעיפים ו-ז והרמ"א שם (הרשימה של "נהגו שלא ליפול על פניהם"),
// ומשנה ברורה שם. הימים שנכללו:
//   שבת (אין נפילת אפים בשבת; כלול כדי שהפונקציה תענה נכון על כל יום) · ראש חודש (ל' בחודש הקודם וא' בחודש)
//   · כל חודש ניסן · פסח שני (י"ד אייר) · ל"ג בעומר (י"ח אייר) · מראש חודש סיון עד אחרי שבועות
//   · תשעה באב (וכשנדחה לי' באב - גם י' באב, יום התענית) · ט"ו באב · ערב ראש השנה (כ"ט אלול) · ראש השנה
//   · ערב יום הכיפורים ומיום הכיפורים עד אחרי סוכות · חנוכה (כ"ה כסלו ושמונה ימים) · ט"ו בשבט
//   · פורים ושושן פורים (י"ד-ט"ו אדר, ובשנה מעוברת אדר ב') · פורים קטן ושושן פורים קטן (י"ד-ט"ו אדר א').
// המנהג שנבחר במקום שהמנהגים חלוקים:
//   אחרי שבועות - עד י"ב סיון כולל (ימי התשלומין), כמנהג הרווח המובא במשנה ברורה שם. יש שאומרים מז' סיון.
//   אחרי סוכות - עד סוף חודש תשרי, כמנהג הרווח. יש שאומרים מאחרי אסרו חג.
//   בין ב' תשרי לערב יום הכיפורים - אומרים תחנון (מלבד שבת).
// לא נכללו (המנהגים חלוקים, ובמנהג הרווח אומרים בהם תחנון): ט"ו אייר, ז' אדר, ערב ראש חודש,
// יום העצמאות ויום ירושלים, וימי הילולא של צדיקים.

import { MONTH, isLeapYear, hebrewToAbs, hebrewToGregorian } from "./personal-core.js";

function weekday(hd) { // 0 ראשון ... 6 שבת
  const g = hebrewToGregorian(hd);
  return new Date(Date.UTC(g.year, g.month - 1, g.day)).getUTCDay();
}

// הסיבה שאין תחנון ביום הזה, או null אם אומרים תחנון
export function noTachanunReason(hd) {
  const { year, month, day } = hd;
  const leap = isLeapYear(year);
  const purimMonth = leap ? MONTH.ADAR_II : MONTH.ADAR;
  if (weekday(hd) === 6) return "שבת";
  if (month === MONTH.NISAN) return "חודש ניסן";
  if (day === 1 || day === 30) return "ראש חודש";
  if (month === MONTH.IYYAR && day === 14) return "פסח שני";
  if (month === MONTH.IYYAR && day === 18) return 'ל"ג בעומר';
  if (month === MONTH.SIVAN && day <= 12) return "ימי חג השבועות ותשלומיו";
  if (month === MONTH.AV && day === 9) return "תשעה באב";
  if (month === MONTH.AV && day === 10 && weekday({ year, month, day: 9 }) === 6) return "תשעה באב נדחה";
  if (month === MONTH.AV && day === 15) return 'ט"ו באב';
  if (month === MONTH.ELUL && day === 29) return "ערב ראש השנה";
  if (month === MONTH.TISHREI && day <= 2) return "ראש השנה";
  if (month === MONTH.TISHREI && day >= 9) return day === 9 ? "ערב יום הכיפורים" : "מיום הכיפורים עד סוף תשרי";
  {
    const start = { year, month: MONTH.KISLEV, day: 25 }; // כסלו וטבת באותה שנה עברית
    const diff = hebrewToAbs(hd) - hebrewToAbs(start);
    if (diff >= 0 && diff < 8) return "חנוכה";
  }
  if (month === MONTH.SHVAT && day === 15) return 'ט"ו בשבט';
  if (leap && month === MONTH.ADAR_I && (day === 14 || day === 15)) return day === 14 ? "פורים קטן" : "שושן פורים קטן";
  if (month === purimMonth && (day === 14 || day === 15)) return day === 14 ? "פורים" : "שושן פורים";
  return null;
}

export function isNoTachanunDay(hd) { return noTachanunReason(hd) !== null; }

