# Logo build tools

The braille logos in `../ascii/` are generated, not hand-typed. These scripts rebuild them, so a logo can be re-tuned instead of edited dot by dot.

## Use

```bash
uv run tools/make_art.py                 # rebuild every generated logo
uv run tools/make_art.py peacock feluda  # rebuild only these
uv run tools/braille.py simulate ascii/peacock.txt out.png pixel   # see it as an image
uv run tools/ref_lab.py feluda 0.40,0.11,0.97,0.60 30 18 --dot     # compare reductions
uv run tools/trim_pad.py                 # audit left padding across all logos
```

`simulate` exists because a terminal is the only place these files look like anything. `pixel` style shows the underlying picture; `dot` style approximates what a terminal braille font draws. Check a logo with it before keeping it — and judge it at the size it will actually be seen, since noise hides at 3x.

To switch the active logo without editing `config.jsonc`:

```bash
fastfetch --file ~/.config/fastfetch/ascii/peacock.txt
```

fastfetch is a native Windows binary, so give it Windows or relative paths — it cannot read Git Bash `/c/...` paths.

## Files

| File | Purpose |
| --- | --- |
| `braille.py` | glyph/image → 2x4 braille, house style (`$1`–`$9` gradient + `⟪ label ⟫`), and the PNG simulator |
| `make_art.py` | one entry per logo: its source and reduction settings |
| `ref_lab.py` | runs a reference through ~15 crops/reductions so the best is picked by eye |
| `trim_pad.py` | audits/removes dead left padding shared by every art row in a logo |

## Reductions

A 1-bit medium at 30 columns is unforgiving, and which reduction works depends entirely on the source:

- **threshold** (`flat`) — clean line art and flat vector work. `invert=False` when the subject is the _bright_ part of the reference (e.g. Durga on black).
- **local mean** (`sten`) — line work over coloured fields, where a flat threshold just fills each field solid. No logo uses it at present; it is kept because it is the only thing that worked on coloured crest artwork.
- **dither** — continuous-tone photographs. Rarely survives; usually noise.
- **silhouette** — alpha channel of glyphs and drawn composites.

## Sources and licensing

References live in `refs/`. Public domain, CC0, system font glyphs, or images supplied by the user for personal use; the braille reductions are new work.

| Logo | Source |
| --- | --- |
| `feluda`, `professor-shonku` | Satyajit Ray illustrations, user-supplied |
| `durga-face` | user-supplied Durga pratima photograph |
| `tagore` | [Rabindranath Tagore.svg](https://commons.wikimedia.org/wiki/File:Rabindranath_Tagore.svg), Wikimedia Commons |
| `ferris-crab` | [rustacean.net](https://rustacean.net/) — Ferris, CC0 |
| `peacock`, `kolkata-tram`, `cherry-blossom`, `christmas-tree`, `marauders-map` | Segoe UI Emoji glyph outlines |
| `joker-card` | Segoe UI Symbol, U+1F0CF |
| `yin-yang` | DejaVu Sans, U+262F |
| `bat-signal`, `diwali-diya` | drawn in `make_art.py` from primitives |

One subject resisted its reference, and the reason is worth keeping: **`tagore`** uses the Wikimedia line portrait, not the supplied photograph. The photo was tried at many crops, thresholds, local-mean settings and as a halftone — its background gradient overlaps the hair tones, so no 1-bit reduction separates them. `TAGORE_SOURCE` in `make_art.py` switches to the photo if wanted.
