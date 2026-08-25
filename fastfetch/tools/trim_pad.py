# /// script
# requires-python = ">=3.10"
# ///
"""Trim dead left padding from logo files.

Every art row in a logo starts with some number of blank braille cells (U+2800).
Whatever number they all share is dead space: it pushes the art right and away
from the module list for no reason. Removing the shared minimum shifts the art
left without changing its shape at all.

    uv run tools/trim_pad.py                        # audit every logo
    uv run tools/trim_pad.py --apply peacock ...    # rewrite only these logos
"""
import sys
from pathlib import Path

ASCII_DIR = Path(__file__).resolve().parent.parent / "ascii"
BLANK = "⠀"


def split_prefix(line):
    """Return (colour prefix, rest) for a '$N...' logo line."""
    if len(line) > 1 and line[0] == "$" and line[1].isdigit():
        return line[:2], line[2:]
    return "", line


def analyse(text):
    """Shared leading-blank count across art rows, plus the parsed rows."""
    rows = [split_prefix(ln) for ln in text.split("\n")]
    pads = []
    for _, body in rows:
        stripped = body.lstrip(BLANK)
        if not stripped:
            continue                     # blank spacer row
        if not any(0x2800 <= ord(c) <= 0x28FF for c in stripped):
            continue                     # label row, handled separately
        pads.append(len(body) - len(stripped))
    return (min(pads) if pads else 0), rows


def retrim(text):
    pad, rows = analyse(text)
    if pad == 0:
        return None, 0
    out = []
    for prefix, body in rows:
        stripped = body.lstrip(BLANK)
        is_art = stripped and any(0x2800 <= ord(c) <= 0x28FF for c in stripped)
        out.append((prefix, body[pad:] if is_art else body))
    # recentre any label row against the new width
    width = max((len(b) for p, b in out
                 if b and any(0x2800 <= ord(c) <= 0x28FF for c in b)), default=0)
    final = []
    for prefix, body in out:
        label = body.strip()
        if label.startswith("⟪"):
            indent = max(0, (width - len(label)) // 2)
            body = " " * indent + label
        final.append(prefix + body)
    return "\n".join(final), pad


def main():
    args = [a for a in sys.argv[1:] if a != "--apply"]
    apply = "--apply" in sys.argv
    if apply and not args:
        sys.exit("name the logos to rewrite, e.g. --apply ravenclaw-eagle")
    only = {a.removesuffix(".txt") for a in args}
    changed = []
    for path in sorted(ASCII_DIR.glob("*.txt")):
        if only and path.stem not in only:
            continue
        text = path.read_text(encoding="utf-8")
        new, pad = retrim(text)
        if not new:
            continue
        changed.append((path.name, pad))
        if apply:
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(new)
    if not changed:
        print("no logo has shared left padding")
        return
    for name, pad in changed:
        print(f"{'trimmed' if apply else 'would trim'} {name:26} -{pad} cells")


if __name__ == "__main__":
    main()
