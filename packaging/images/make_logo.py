# Logo Playscreen (écran de démarrage, .brand-mark) : carré arrondi en dégradé 135° de
# #3d8bff à #8b5cff, triangle « lecture » blanc. Dessiné en 4096 px puis réduit (lissage).
import sys
from PIL import Image, ImageDraw, ImageFilter
S = 4096
out = sys.argv[1]
# Dégradé diagonal.
grad = Image.new("RGB", (S, S))
a, b = (0x3d, 0x8b, 0xff), (0x8b, 0x5c, 0xff)
small = Image.new("RGB", (256, 256))
px = small.load()
for y in range(256):
    for x in range(256):
        t = (x + y) / 510
        px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
grad = small.resize((S, S), Image.BICUBIC)
# Carré arrondi (rayon ~23 %, comme la marque de l'écran de démarrage).
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.23), fill=255)
logo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
logo.paste(grad, (0, 0), mask)
# Triangle blanc, coins légèrement arrondis, centré optiquement (un peu à droite).
tri = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(tri)
h = S * 0.40
cx, cy = S * 0.535, S * 0.5
w = h * 0.88
pts = [(cx - w / 2, cy - h / 2), (cx - w / 2, cy + h / 2), (cx + w / 2, cy)]
d.polygon(pts, fill=255)
tri = tri.filter(ImageFilter.MaxFilter(1))
# Arrondi des pointes : flou puis seuil.
tri = tri.filter(ImageFilter.GaussianBlur(S * 0.012)).point(lambda v: 255 if v > 140 else 0)
white = Image.new("RGBA", (S, S), (0xf4, 0xf6, 0xfb, 255))
logo.paste(white, (0, 0), tri)
logo.resize((1024, 1024), Image.LANCZOS).save(out)
print("ok", out)
