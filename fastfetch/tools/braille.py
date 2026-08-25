# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Toolkit: glyph/image -> braille art in the fastfetch house style, plus a
PNG renderer so the result can be inspected the way a terminal shows it."""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

WIN_FONTS = Path("C:/Windows/Fonts")
EMOJI = WIN_FONTS / "seguiemj.ttf"
SYMBOL = WIN_FONTS / "seguisym.ttf"
DEJAVU = WIN_FONTS / "DejaVuSans.ttf"
MONO = WIN_FONTS / "DejaVuSansMono.ttf"
# DejaVu Sans is the only installed family with full braille + ⟪ ⟫ coverage
BRAILLE_FONT = WIN_FONTS / "DejaVuSans.ttf"

BLANK = "\u2800"
# dot bit order within a 2x4 braille cell: (col, row) -> bit
DOTS = {
    (0, 0): 0x01, (0, 1): 0x02, (0, 2): 0x04, (0, 3): 0x40,
    (1, 0): 0x08, (1, 1): 0x10, (1, 2): 0x20, (1, 3): 0x80,
}


def render_glyph(char, font_path=EMOJI, size=512, color=False):
    """Render one glyph to a tight-cropped RGBA image."""
    font = ImageFont.truetype(str(font_path), size)
    img = Image.new("RGBA", (int(size * 2.2), int(size * 2.2)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    kw = {"embedded_color": True} if color else {}
    d.text((size * 0.3, size * 0.3), char, font=font, fill=(255, 255, 255, 255), **kw)
    return img.crop(img.getbbox())


def prep(img, cols, rows=None, mode="silhouette", invert=False, gamma=1.0,
         edge=False, pad=0.0):
    """Resize to a cols*2 x rows*4 dot grid and reduce to 1-bit."""
    if img.mode == "RGBA":
        bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
        alpha = img.split()[3]
        if mode == "silhouette":
            g = alpha.convert("L")
        else:
            g = Image.alpha_composite(bg, img).convert("L")
    else:
        g = img.convert("L")

    if invert:
        g = ImageOps.invert(g)
    if gamma != 1.0:
        g = g.point(lambda v: int(255 * ((v / 255) ** gamma)))
    if edge:
        g = g.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))

    dw = cols * 2
    dh = rows * 4 if rows else max(4, round(dw * g.height / g.width / 4) * 4)
    if pad:
        m = int(min(g.size) * pad)
        g = ImageOps.expand(g, m, fill=0)
    g = g.resize((dw, dh), Image.LANCZOS)
    g = ImageOps.autocontrast(g)
    return g


def to_braille(g, dither=True, threshold=128):
    """1-bit reduce then map 2x4 blocks to braille chars."""
    bw = g.convert("1", dither=Image.FLOYDSTEINBERG if dither else Image.NONE) \
        if dither else g.point(lambda v: 255 if v >= threshold else 0).convert("1")
    px = bw.load()
    w, h = bw.size
    lines = []
    for by in range(0, h, 4):
        row = ""
        for bx in range(0, w, 2):
            bits = 0
            for (cx, cy), bit in DOTS.items():
                x, y = bx + cx, by + cy
                if x < w and y < h and px[x, y]:
                    bits |= bit
            row += chr(0x2800 + bits)
        lines.append(row.rstrip(BLANK) or BLANK)
    while lines and lines[0] == BLANK:
        lines.pop(0)
    while lines and lines[-1] == BLANK:
        lines.pop()
    # drop any left padding every row shares - it only pushes the logo away
    # from the module list (see tools/trim_pad.py, which does this to files)
    pads = [len(l) - len(l.lstrip(BLANK)) for l in lines if l.strip(BLANK)]
    if pads and min(pads):
        lines = [l[min(pads):] for l in lines]
    return lines


def house_style(lines, label, bands=9):
    """Add the $1-$9 gradient row prefixes and the centred footer label."""
    out = []
    n = max(1, len(lines))
    for i, ln in enumerate(lines):
        band = min(bands, 1 + i * bands // n)
        out.append(f"${band}{ln}")
    width = max((len(l) for l in lines), default=20)
    tag = f"\u27ea {label} \u27eb"
    pad = max(0, (width - len(tag)) // 2)
    out.append(f"${bands}")
    out.append(f"${bands}{' ' * pad}{tag}")
    return "\n".join(out) + "\n"


PALETTE = {"1": "#F5E0DC", "2": "#F2CDCD", "3": "#F5C2E7", "4": "#FAB387",
           "5": "#F9E2AF", "6": "#A6E3A1", "7": "#94E2D5", "8": "#89DCEB",
           "9": "#74C7EC"}


def simulate(path, out_png, cell_w=12, style="dot"):
    """Draw a .txt logo the way a terminal shows it: decode each braille cell
    back to its 2x4 dots and paint them, with the config's Catppuccin gradient
    applied per $N row.

    style="dot"   round dots with gaps, like a terminal braille font
    style="pixel" solid blocks, showing the underlying picture at full fidelity
    """
    rows = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        color = PALETTE["9"]
        if raw.startswith("$") and len(raw) > 1 and raw[1] in PALETTE:
            color, raw = PALETTE[raw[1]], raw[2:]
        rows.append((color, raw))

    cell_h = cell_w * 2
    dw, dh = cell_w / 2, cell_h / 4          # one dot's slot
    width = max((len(t) for _, t in rows), default=1)
    pad = 14
    img = Image.new("RGB", (round(width * cell_w) + 2 * pad,
                            round(len(rows) * cell_h) + 2 * pad), "#11111B")
    d = ImageDraw.Draw(img)
    label_font = ImageFont.truetype(str(BRAILLE_FONT), round(cell_h * 0.62))

    for i, (color, text) in enumerate(rows):
        y0 = pad + i * cell_h
        for j, ch in enumerate(text):
            x0 = pad + j * cell_w
            o = ord(ch)
            if 0x2800 <= o <= 0x28FF:
                bits = o - 0x2800
                for (cx, cy), bit in DOTS.items():
                    if not bits & bit:
                        continue
                    x, y = x0 + cx * dw, y0 + cy * dh
                    if style == "pixel":
                        d.rectangle([x, y, x + dw - 0.5, y + dh - 0.5], fill=color)
                    else:
                        r = min(dw, dh) * 0.40
                        mx, my = x + dw / 2, y + dh / 2
                        d.ellipse([mx - r, my - r, mx + r, my + r], fill=color)
            elif ch.strip():
                d.text((x0, y0 + cell_h * 0.15), ch, font=label_font, fill=color)
    img.save(out_png)
    return img.size


if __name__ == "__main__":
    if sys.argv[1] == "simulate":
        style = sys.argv[4] if len(sys.argv) > 4 else "dot"
        print(simulate(sys.argv[2], sys.argv[3], style=style))
