# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Try a reference image through several crops and reductions side by side, so
the best combination is chosen by eye rather than guessed.

    uv run tools/ref_lab.py tagore 0.10,0.02,0.95,0.75 28 18
    uv run tools/ref_lab.py tagore 0.10,0.02,0.95,0.75 28 18 --dot

Writes <temp>/reflab/<name>_<variant>.txt plus a PNG of each, ready to montage.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from braille import house_style, simulate, to_braille  # noqa: E402

from PIL import Image, ImageFilter, ImageOps  # noqa: E402

REFS = Path(__file__).resolve().parent / "refs"
OUT = Path(tempfile.gettempdir()) / "ffart" / "reflab"


def load(name, crop, on_black=False):
    img = Image.open(REFS / f"{name}.png").convert("RGBA")
    back = (0, 0, 0, 255) if on_black else (255, 255, 255, 255)
    g = Image.alpha_composite(Image.new("RGBA", img.size, back), img).convert("L")
    w, h = g.size
    l, t, r, b = crop
    return g.crop((int(w * l), int(h * t), int(w * r), int(h * b)))


def grid(g, cols, rows):
    dh = rows * 4 if rows else max(4, round(cols * 2 * g.height / g.width / 4) * 4)
    return ImageOps.autocontrast(g, 2).resize((cols * 2, dh), Image.LANCZOS)


def local_mean(g, radius, offset, bright=False):
    blur = g.filter(ImageFilter.GaussianBlur(radius))
    gp, bp = g.load(), blur.load()
    out = Image.new("L", g.size, 0)
    op = out.load()
    for y in range(g.height):
        for x in range(g.width):
            hit = gp[x, y] > bp[x, y] + offset if bright else gp[x, y] + offset < bp[x, y]
            op[x, y] = 255 if hit else 0
    return out


def variants(g, thresholds=(95, 125, 155, 185)):
    """name -> 1-bit image. 'ink' = dots follow dark; 'lit' = dots follow bright."""
    v = {}
    for t in thresholds:
        v[f"ink{t}"] = ImageOps.invert(g).point(lambda p, t=t: 255 if p >= 255 - t else 0)
        v[f"lit{t}"] = g.point(lambda p, t=t: 255 if p >= t else 0)
    # local-mean variants: the only thing that separates a subject from an
    # uneven background, where a global threshold cannot
    for r, o in ((5, 5), (6, 12), (8, 20), (10, 28)):
        v[f"sten{r}-{o}"] = local_mean(g, r, o)
    v["stencil-lit"] = local_mean(g, 5, 5, bright=True)
    v["edge"] = ImageOps.autocontrast(
        g.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    ).point(lambda p: 255 if p > 70 else 0)
    return v


def main():
    name = sys.argv[1]
    crop = tuple(float(x) for x in sys.argv[2].split(","))
    cols = int(sys.argv[3])
    rows = int(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith("--") else None
    style = "dot" if "--dot" in sys.argv else "pixel"
    on_black = "--black" in sys.argv
    only = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--only=")), None)

    # --tag lets several crops of one reference (e.g. the four house crests in
    # houses.png) be laid out without overwriting each other
    tag = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--tag=")), name)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob(f"{tag}_*"):
        old.unlink()
    tspec = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--t=")), None)
    thresholds = tuple(int(x) for x in tspec.split(",")) if tspec else (95, 125, 155, 185)
    sharpen = "--sharpen" in sys.argv

    src = load(name, crop, on_black)
    if sharpen:
        src = src.filter(ImageFilter.UnsharpMask(radius=6, percent=180, threshold=2))
    g = grid(src, cols, rows)
    vs = variants(g, thresholds)

    # contours found at full resolution, then reduced: keeps major boundaries
    # (profile, hairline) that edge-detection on the tiny grid turns into noise
    dh = g.height
    for blur, cut in ((3, 45), (6, 30)):
        e = src.filter(ImageFilter.GaussianBlur(blur)).filter(ImageFilter.FIND_EDGES)
        e = ImageOps.autocontrast(e).resize((cols * 2, dh), Image.LANCZOS)
        vs[f"contour{blur}"] = e.point(lambda p, c=cut: 255 if p > c else 0)

    for vname, bits in vs.items():
        if only and only != vname:
            continue
        lines = to_braille(bits, dither=False, threshold=128)
        if not lines:
            print(f"{vname}: empty")
            continue
        p = OUT / f"{tag}_{vname}.txt"
        p.write_text(house_style(lines, tag), encoding="utf-8", newline="")
        simulate(p, OUT / f"{tag}_{vname}.png", cell_w=14, style=style)
        print(f"{vname:12} {len(lines):>2} rows x {max(len(x) for x in lines):>2} cols")


if __name__ == "__main__":
    main()
