# אייקון תהילים ישראל: ת' בזהב בגופן FrankRuehl על רקע כהה, עם טבעת זהב דקה.
# מצויר ב-4096 ומוקטן, כדי שהקצוות יהיו חלקים.
import sys
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1]
S = 4096
INK = (28, 26, 23)
GOLD = (190, 146, 64)
GOLD_LIGHT = (214, 176, 98)

def base(letter_frac, ring=True, bg=INK):
    im = Image.new("RGB", (S, S), bg)
    d = ImageDraw.Draw(im)
    c = S / 2
    if ring:
        r = S * letter_frac * 0.78
        w = int(S * 0.012)
        d.ellipse([c - r, c - r, c + r, c + r], outline=GOLD, width=w)
        r2 = r - w * 2.2
        d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=GOLD, width=max(2, w // 3))
    font = ImageFont.truetype(r"C:\Windows\Fonts\FRANKB.TTF", int(S * letter_frac * 1.45))
    ch = "\u05ea"
    bb = d.textbbox((0, 0), ch, font=font)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text((c - w / 2 - bb[0], c - h / 2 - bb[1]), ch, font=font, fill=GOLD_LIGHT)
    return im

def save(im, size, name):
    im.resize((size, size), Image.LANCZOS).save(OUT + "/" + name, optimize=True)

# רגיל: האות ממלאת כ-50% מהרוחב, הטבעת כ-78% (אנדרואיד מעגל בעצמו אייקון "any").
reg = base(0.50)
save(reg, 512, "icon-512.png")
save(reg, 192, "icon-192.png")
# אפל: אפל מעגלת פינות ואינה מקבלת שקיפות - רקע מלא, אותו עיצוב.
save(reg, 180, "apple-touch-icon.png")
# מסכה: הכל בתוך העיגול הבטוח (80% מהקוטר) - טבעת ב-~62%, האות ~40%.
mask = base(0.40)
save(mask, 512, "icon-maskable-512.png")
save(mask, 192, "icon-maskable-192.png")
print("ok")
