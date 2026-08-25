# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Build the new fastfetch braille logos.

Every logo comes from one of three kinds of source:
  glyph      - a Segoe UI Emoji / Symbol / DejaVu glyph outline (clean vectors)
  reference  - an image in tools/refs/, reduced by threshold, local mean or dither
  composite  - drawn here from primitives

Reductions are chosen by eye with tools/ref_lab.py, not guessed; see the notes
on individual subjects for what was tried and rejected.
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from braille import (DEJAVU, EMOJI, SYMBOL, house_style, prep,  # noqa: E402
                     render_glyph, to_braille)

ASCII_DIR = Path(__file__).resolve().parent.parent / "ascii"
REFS = Path(__file__).resolve().parent / "refs"
S = 1400  # composite canvas size


def canvas(w=S, h=S):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def place(base, glyph, box, anchor="center"):
    """Fit a glyph into box=(x0,y0,x1,y1) preserving aspect."""
    x0, y0, x1, y1 = box
    g = glyph.copy()
    g.thumbnail((max(1, x1 - x0), max(1, y1 - y0)), Image.LANCZOS)
    if anchor == "center":
        px = x0 + (x1 - x0 - g.width) // 2
        py = y0 + (y1 - y0 - g.height) // 2
    else:
        px, py = x0, y0
    base.alpha_composite(g, (px, py))


def outline(img, width=3):
    """Turn a solid silhouette into a line drawing."""
    a = img.split()[3]
    edge = a.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(width))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.putalpha(edge)
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white.putalpha(edge)
    return white


# ---------------------------------------------------------------- composites

# classic bat symbol, right half only (mirrored below); x from centre, y down
BAT_HALF = [(0.500, 0.245), (0.530, 0.120), (0.566, 0.290), (0.625, 0.288),
            (0.720, 0.210), (0.865, 0.195), (0.980, 0.300), (0.880, 0.420),
            (0.800, 0.352), (0.716, 0.500), (0.640, 0.420), (0.578, 0.575),
            (0.532, 0.492), (0.500, 0.640)]


def bat_symbol(img, box):
    """Draw the wide-winged bat symbol inside box=(x0,y0,x1,y1)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    right = [(x0 + fx * w, y0 + fy * h) for fx, fy in BAT_HALF]
    left = [(x0 + (1 - fx) * w, y0 + fy * h) for fx, fy in reversed(BAT_HALF)]
    ImageDraw.Draw(img).polygon(right + left, fill=(255, 255, 255, 255))
    return img


def bat_signal():
    """Spotlight disc with the bat symbol across it."""
    img, d = canvas()
    c, r = S // 2, int(S * 0.46)
    d.ellipse([c - r, c - r, c + r, c + r], outline=(255, 255, 255, 255), width=24)
    bat_symbol(img, (int(S * 0.06), int(S * 0.10), int(S * 0.94), int(S * 0.98)))
    return img


def marauders_footprints():
    """A trail of footprints tracking across the map, as the charm reveals it."""
    img, d = canvas()
    feet = render_glyph("\U0001F463", EMOJI, 512)
    steps = [(0.00, 0.56, -12), (0.32, 0.30, -4), (0.62, 0.02, 4)]
    size = int(S * 0.40)
    for fx, fy, rot in steps:
        g = feet.rotate(rot, resample=Image.BICUBIC, expand=True)
        place(img, g, (int(S * fx), int(S * fy),
                       int(S * fx) + size, int(S * fy) + size))
    return img


def cherry_blossom():
    """Blossoms along a branch."""
    img, d = canvas()
    d.line([(int(S * 0.02), int(S * 0.88)), (int(S * 0.40), int(S * 0.66)),
            (int(S * 0.72), int(S * 0.56)), (int(S * 0.98), int(S * 0.40))],
           fill=(255, 255, 255, 255), width=26, joint="curve")
    for a, b, w in [((0.30, 0.70), (0.24, 0.44), 16),
                    ((0.58, 0.60), (0.66, 0.34), 14),
                    ((0.82, 0.48), (0.90, 0.24), 12)]:
        d.line([(int(S * a[0]), int(S * a[1])), (int(S * b[0]), int(S * b[1]))],
               fill=(255, 255, 255, 255), width=w)
    blossom = render_glyph("\U0001F338", EMOJI, 400)
    for bx, by, bs in [(0.10, 0.60, 0.24), (0.34, 0.26, 0.30), (0.60, 0.14, 0.26),
                       (0.72, 0.44, 0.22), (0.86, 0.06, 0.22), (0.46, 0.52, 0.20)]:
        size = int(S * bs)
        place(img, blossom, (int(S * bx), int(S * by),
                             int(S * bx) + size, int(S * by) + size))
    return img


def diya():
    """Clay lamp with a lit flame - drawn rather than borrowed, so the bowl and
    flame stay legible at 30 columns."""
    img, d = canvas()
    W = (255, 255, 255, 255)
    cx, ry = S // 2, int(S * 0.66)
    rw = int(S * 0.34)
    # rim
    d.arc([cx - rw, ry - 70, cx + rw, ry + 70], 0, 360, fill=W, width=20)
    # bowl body
    bowl = [(cx - rw, ry)]
    for i in range(1, 33):
        t = i / 32
        bowl.append((cx - rw + 2 * rw * t,
                     ry + int(S * 0.20 * (1 - (2 * t - 1) ** 2) ** 0.6)))
    bowl.append((cx + rw, ry))
    d.line(bowl, fill=W, width=22, joint="curve")
    # pinched spout on the right, holding the wick
    d.polygon([(cx + rw - 30, ry - 40), (cx + rw + 130, ry - 96),
               (cx + rw - 10, ry + 40)], outline=W, width=18)
    # base
    d.line([(cx - 110, ry + int(S * 0.205)), (cx + 110, ry + int(S * 0.205))],
           fill=W, width=18)
    # wick, so the flame is attached to the lamp rather than floating
    wx, wy = cx + rw + 60, ry - 80
    d.line([(wx, wy), (wx, wy - 60)], fill=W, width=16)
    # flame
    fx, fy = wx, wy - 55
    flame = []
    for i in range(21):
        t = i / 20
        flame.append((fx + int(S * 0.085 * (1 - (2 * t - 1) ** 2) ** 0.9 * (1 - t * 0.35)),
                      fy - int(S * 0.34 * t)))
    for i in range(20, -1, -1):
        t = i / 20
        flame.append((fx - int(S * 0.085 * (1 - (2 * t - 1) ** 2) ** 0.9 * (1 - t * 0.35)),
                      fy - int(S * 0.34 * t)))
    d.polygon(flame, fill=W)          # solid, so it reads as flame not outline
    # glow rays around the flame
    for ang in (-58, -30, 0, 30, 58):
        a = math.radians(ang - 90)
        gx, gy = fx + math.cos(a) * 210, fy - int(S * 0.17) + math.sin(a) * 210
        d.line([(gx, gy), (gx + math.cos(a) * 120, gy + math.sin(a) * 120)],
               fill=W, width=16)
    return img


def durga_face():
    """Traditional Durga pratima: tiered mukut with the teardrop gem, three eyes,
    the big circular ear discs and the pearl necklace. Reduced from the reference
    in tools/refs/, which is bright-subject-on-black - so dots follow the subject
    and its dark detail is punched out, which is what keeps the ornament legible.
    """
    img = Image.open(REFS / "durga-face.png").convert("RGBA")
    flat = Image.alpha_composite(Image.new("RGBA", img.size, (0, 0, 0, 255)), img)
    g = flat.convert("L")
    box = g.point(lambda v: 255 if v > 25 else 0).getbbox()
    return g.crop(box) if box else g


def ferris():
    """Ferris the crab (CC0 from rustacean.net), with both eyes punched out so
    the face survives the reduction to a silhouette."""
    img = Image.open(REFS / "ferris-crab.png").convert("RGBA")
    # At eight braille rows, the source eyes look low and merge toward the
    # centre. Smaller, slightly raised holes preserve cuddly Ferris's spacing.
    d = ImageDraw.Draw(img)
    d.ellipse((192, 141, 222, 179), fill=(0, 0, 0, 0))
    d.ellipse((263, 141, 293, 179), fill=(0, 0, 0, 0))
    return img


def ref(name, crop=(0, 0, 1, 1), on_black=False):
    """Load a reference from tools/refs/, cropped by fractions (l,t,r,b).

    on_black matters: a reference drawn light-on-dark must be flattened onto
    black or its background turns white and the reduction inverts.
    """
    img = Image.open(REFS / f"{name}.png").convert("RGBA")
    back = (0, 0, 0, 255) if on_black else (255, 255, 255, 255)
    g = Image.alpha_composite(Image.new("RGBA", img.size, back), img).convert("L")
    w, h = g.size
    return g.crop((int(w * crop[0]), int(h * crop[1]),
                   int(w * crop[2]), int(h * crop[3])))


def flatten(g, cols, rows=None, threshold=128, invert=True, cutoff=3, recontrast=2):
    """Photo/line-art path: resize to the dot grid first, then a flat threshold.
    Picked over dithering after comparing both in tools/photo_lab.py - dithering
    turns into noise at this size.

    invert=True suits dark-subject-on-light sources (dots follow the ink);
    invert=False suits bright-subject-on-black, where dots follow the subject.
    """
    dw = cols * 2
    dh = rows * 4 if rows else max(4, round(dw * g.height / g.width / 4) * 4)
    g = ImageOps.autocontrast(g.convert("L"), cutoff).resize((dw, dh), Image.LANCZOS)
    if recontrast is not None:
        g = ImageOps.autocontrast(g, recontrast)
    if invert:
        g = ImageOps.invert(g)
    return g.point(lambda v: 255 if v >= threshold else 0)


def to_grid(g, cols, rows=None, cutoff=2):
    dh = rows * 4 if rows else max(4, round(cols * 2 * g.height / g.width / 4) * 4)
    return ImageOps.autocontrast(g, cutoff).resize((cols * 2, dh), Image.LANCZOS)


def stencil(g, cols, rows=None, radius=6, offset=12):
    """Local-mean threshold: marks pixels darker than their neighbourhood, so it
    pulls the line work out of a drawing whatever colour the fields behind it
    are. This is what makes the four house crests legible - a flat threshold
    just fills their red and blue fields solid."""
    g = to_grid(g, cols, rows)
    blur = g.filter(ImageFilter.GaussianBlur(radius))
    gp, bp = g.load(), blur.load()
    out = Image.new("L", g.size, 0)
    op = out.load()
    for y in range(g.height):
        for x in range(g.width):
            op[x, y] = 255 if gp[x, y] + offset < bp[x, y] else 0
    return out


FLAT = {"cutoff": 2, "recontrast": None}   # matches tools/ref_lab.py's pipeline

# Two Tagore sources exist. "lineart" is a Wikimedia line portrait and is
# unmistakably him at 30 columns. "photo" is the supplied photograph; it was
# tried at many crops, thresholds, local-mean settings and as a halftone, and
# every result reads as noise, because its background gradient overlaps the
# hair tones and no 1-bit reduction can separate them. Switch if you disagree.
TAGORE_SOURCE = "lineart"


def tagore_lineart():
    """Line portrait, trimmed to the drawn area so the reduction is not spent
    on white margin."""
    g = ref("tagore-lineart")
    ink = ImageOps.invert(g).point(lambda v: 255 if v > 80 else 0)
    box = ink.getbbox()
    if not box:
        return g
    m = 8
    return g.crop((max(0, box[0] - m), max(0, box[1] - m),
                   min(g.width, box[2] + m), min(g.height, box[3] + m)))


TAGORE = {
    "lineart": (tagore_lineart, 32, {"flat": {"threshold": 140}}),
    "photo": (lambda: ref("tagore", (0.10, 0.04, 0.86, 0.74)), 30,
              {"dither": {"rows": 19, "contrast": 1.8}}),
}[TAGORE_SOURCE]

SUBJECTS = [
    # name, label, builder, cols, opts
    #   {}         -> alpha silhouette (glyphs and drawn composites)
    #   {"flat"}   -> global threshold; invert=False when the subject is the
    #                 bright part of the reference
    #   {"sten"}   -> local-mean line extraction
    #   {"dither"} -> halftone, for continuous-tone photographs
    ("durga-face", "Durga", lambda: ref("durga-face"), 30,
     {"flat": {"rows": 21, "threshold": 155, "invert": False, **FLAT}}),
    ("feluda", "Feluda", lambda: ref("feluda", (0.40, 0.11, 0.97, 0.60)), 30,
     {"flat": {"rows": 18, "threshold": 145, **FLAT}}),
    ("professor-shonku", "Professor Shonku",
     lambda: ref("professor-shonku", (0.355, 0.02, 0.575, 0.40), on_black=True), 30,
     {"flat": {"rows": 20, "threshold": 140, "invert": False, **FLAT}}),
    ("tagore", "Tagore", TAGORE[0], TAGORE[1], TAGORE[2]),
    ("kolkata-tram", "Kolkata Tram",
     lambda: render_glyph("\U0001F68B", EMOJI, 512), 32, {}),
    ("peacock", "Peacock", lambda: render_glyph("\U0001F99A", EMOJI, 512), 30, {}),
    ("bat-signal", "Bat-Signal", bat_signal, 28, {}),
    ("joker-card", "Joker", lambda: render_glyph("\U0001F0CF", SYMBOL, 512), 24, {}),
    ("marauders-map", "Marauder's Map", marauders_footprints, 32, {}),
    ("ferris-crab", "Rust", ferris, 32, {}),
    ("yin-yang", "Yin Yang", lambda: render_glyph("\u262f", DEJAVU, 512), 26, {}),
    ("cherry-blossom", "Cherry Blossom", cherry_blossom, 32, {}),
    ("diwali-diya", "Diwali", diya, 30, {}),
    ("christmas-tree", "Christmas", lambda: render_glyph("\U0001F384", EMOJI, 512), 26, {}),
]


def build(only=None, write=True):
    made = []
    for name, label, builder, cols, opts in SUBJECTS:
        if only and name not in only:
            continue
        img = builder()
        dither = False
        if "flat" in opts:
            g = flatten(img, cols, **opts["flat"])
        elif "sten" in opts:
            g = stencil(img, cols, **opts["sten"])
        elif "dither" in opts:
            o = dict(opts["dither"])
            g = to_grid(img, cols, o.pop("rows", None))
            g = ImageEnhance.Contrast(g).enhance(o.pop("contrast", 1.0))
            dither = True
        else:
            # trim to the drawn area, or the art ends up inset with dead
            # columns either side once it is reduced
            if img.mode == "RGBA" and img.getbbox():
                img = img.crop(img.getbbox())
            g = prep(img, cols, mode="silhouette")
        lines = to_braille(g, dither=dither, threshold=110)
        text = house_style(lines, label)
        if write:
            # newline="" keeps LF, matching the logos already in ascii/
            with open(ASCII_DIR / f"{name}.txt", "w", encoding="utf-8",
                      newline="") as fh:
                fh.write(text)
        made.append((name, len(lines), max(len(l) for l in lines)))
    return made


if __name__ == "__main__":
    only = sys.argv[1:] or None
    for name, rows, width in build(only):
        print(f"{name:22} {rows:>3} rows x {width:>3} cols")
