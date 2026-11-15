# Images de l'installateur, aux couleurs de Playscreen (ui/src/theme.css).
import sys, math
from PIL import Image, ImageDraw, ImageFilter
logo_path, out = sys.argv[1], sys.argv[2]
logo = Image.open(logo_path).convert("RGBA")

def background(w, h):
    # --art-flat : linear-gradient(160deg, #141b2c 0%, #0b0f1a 60%) + halo bleu en haut à droite.
    small = Image.new("RGB", (160, 120))
    px = small.load()
    a, b = (0x14, 0x1b, 0x2c), (0x0b, 0x0f, 0x1a)
    ang = math.radians(160 - 90)
    for y in range(120):
        for x in range(160):
            t = ((x / 160) * math.cos(ang) + (y / 120) * math.sin(ang))
            t = max(0.0, min(1.0, (t + 0.2) / 0.9 / 0.6))
            base = [a[i] + (b[i] - a[i]) * t for i in range(3)]
            # halo bleu (#3d8bff) et violet discret (#8b5cff)
            d1 = math.hypot((x - 128) / 160, (y - 10) / 120)
            d2 = math.hypot((x - 10) / 160, (y - 118) / 120)
            g1 = max(0.0, 1 - d1 / 0.75) ** 2 * 0.30
            g2 = max(0.0, 1 - d2 / 0.6) ** 2 * 0.12
            col = [base[i] + ((0x3d, 0x8b, 0xff)[i] - base[i]) * g1 for i in range(3)]
            col = [col[i] + ((0x8b, 0x5c, 0xff)[i] - col[i]) * g2 for i in range(3)]
            px[x, y] = tuple(round(c) for c in col)
    return small.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))

background(1200, 900).save(f"{out}/fond.png")

# Petit logo (coin des pages) : 55 px à 100 %, plus les tailles pour les écrans agrandis.
for scale, name in ((1, "logo-55"), (1.25, "logo-69"), (1.5, "logo-83"), (2, "logo-110"), (2.5, "logo-138")):
    s = round(55 * scale)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    m = round(s * 0.1)
    canvas.alpha_composite(logo.resize((s - 2 * m, s - 2 * m), Image.LANCZOS), (m, m))
    canvas.save(f"{out}/{name}.png")

# Grand logo (page de fin, à gauche) avec un halo : 164 × 314 à 100 %, et ×2.
for scale, name in ((1, "cote-164"), (1.5, "cote-246"), (2, "cote-328")):
    w, h = round(164 * scale), round(314 * scale)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    s = round(w * 0.58)
    x, y = (w - s) // 2, round(h * 0.42) - s // 2
    ImageDraw.Draw(glow).ellipse((x - s * 0.35, y - s * 0.35, x + s * 1.35, y + s * 1.35), fill=(61, 139, 255, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.3))
    canvas.alpha_composite(glow)
    canvas.alpha_composite(logo.resize((s, s), Image.LANCZOS), (x, y))
    canvas.save(f"{out}/{name}.png")
print("ok")
