---
name: print-me
description: |
  Use this when user wants to make a copy for print or better reading asthetics. Convert a text-bearing PDF, EPUB, ebook, manuscript, webpage, or document to a print-friendly PDF by default, or to EPUB and another requested document format.
user-invocable: true
---

# Print Me

## Contract

Create a new, readable document without modifying the source. The default result is an A4 PDF using the typography and compact print layout below. When the user explicitly requests EPUB or another format, use that output instead and preserve the same semantic structure and reading aesthetics wherever the format supports them.

For print PDFs, preserve image aspect ratios, keep headings and figures understandable across physical page turns, omit the cover image and Preface, create a minimal metadata title page, begin the table of contents on page 2, and validate the actual rendered PDF before delivery.

## Typography

- Body: Source Serif 4 at 11 pt with 14 pt line spacing. Treat 11 pt as the recommended default.
- Headings: Source Sans 3 in semibold or bold weights.
- Code: Source Code Pro.
- Official font sources: [Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4), [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), and [Source Code Pro](https://fonts.google.com/specimen/Source+Code+Pro).
- Download the official Google Fonts files on first use, cache them locally, and embed them in PDF and styled ebook output. Do not silently substitute another font.

## Supported inputs and outputs

- Accept reflowable EPUB, Markdown, plain text, HTML/XHTML, DOCX, ODT, RTF, reStructuredText, Org, LaTeX, FB2, IPYNB, OPML, XML, and other text-bearing formats for which the user supplies a valid Pandoc reader.
- Accept text-bearing PDFs through Poppler extraction. PDF reconstruction is inherently less reliable than converting the editable source, so inspect reading order, multi-column pages, tables, equations, captions, and every image before delivery.
- Do not treat an image-only or scanned PDF as text. If fewer than 200 text characters can be extracted, stop and require OCR first.
- Emit PDF by default. If the user asks for EPUB, use EPUB3 unless they name EPUB2. For DOCX, ODT, Markdown, HTML, RTF, plain text, or another installed Pandoc writer, pass the requested writer with `--to FORMAT`.
- Typography, exact pagination, physical-spread checking, and A4 guarantees apply to PDF. EPUB and other reflowable formats preserve structure, images, metadata, and styles where their format and reader allow, but do not have fixed pages.

## Preconditions and authorization boundaries

- Require `bun`, `pandoc`, and, for PDF input or validation, Poppler tools. PDF output also requires Chrome, Edge, or Chromium.
- The first styled conversion requires network access to Google Fonts unless the font cache is already populated.
- Preserve the original file. Refuse to overwrite an existing output unless the user explicitly authorizes `--overwrite`.
- Omit only the cover image and a section titled exactly `Preface` under the default print profile. Report both omissions. Do not remove chapters, appendices, references, glossary, index, or substantive sections without explicit approval.
- If the user asks for a shorter copy, identify proposed substantive omissions first and wait for approval before applying them.

## Front matter and print defaults

- Page 1 is a minimal title page containing the book name and any available author, edition, and ISBN metadata. Use `--title`, `--author`, `--edition`, and `--isbn` when source metadata is missing or ambiguous. Do not invent metadata.
- Do not include the source cover image or Preface.
- Start the table of contents on page 2 when a useful heading hierarchy exists. Present nested entries as a connected Unicode branch tree using `├──`, `└──`, and `│`, with continuous vertical rails.
- Normalize missing separators in numbered headings and TOC entries, such as `2.20Organizational Governance` to `2.20 Organizational Governance`, without changing correctly spaced text.
- Use A4 with 12 mm top, 13 mm left/right, and 14 mm bottom margins.
- Preserve original image bytes and aspect ratios during normalization. Scale only to fit printable width or height; never crop, stretch, or deliberately recompress the source asset.
- Keep an image and its caption together when the source identifies them as a figure. Apply `break-after: avoid-page` to headings, but do not globally force large groups to remain together because that creates excessive white space and additional pages.
- Use two-line orphan and widow protection for paragraphs. Allow long lists and tables to flow naturally while protecting table rows and repeated headers where supported.

## Physical spread and layout audit

Treat PDF page 1 as a right-hand page. An odd-to-even transition crosses a physical sheet turn; an even-to-odd transition is the left/right pair visible in one open spread.

Run `scripts/audit-layout.ts` on every generated PDF. It uses Poppler bounding boxes to identify numbered headings and calculate their page position and following context.

- Hard failure: a numbered heading has zero explanatory lines after it on an odd page, so the reader must turn the sheet to discover the section content.
- Review warning: the same zero-context case occurs on an even page, because the next odd page is visible in the same spread and may be acceptable.
- Review warning: a heading near the bottom of an odd page has only one following line, or a figure/table caption appears unusually near the top of a page.
- Keep captions with their figures. For each warning, inspect the current page, the facing page, and the page after the turn. Accept it only when the title, image, caption, and explanation can be understood without unnecessary back-and-forth.
- Prefer the smallest targeted CSS correction. Do not globally bind every image, caption, and explanatory paragraph; previous testing showed that this increases blank space and page count.
- Compare page count and bottom whitespace before and after a corrective rerender. A fix should remove real turn-cost problems without materially inflating the document.

## Workflow

1. Inspect the source type, metadata, file size, headings, images, tables, columns, and whether its layout is reflowable, fixed, or scanned.
2. Select PDF unless the user names another output. Use EPUB3 for a generic EPUB request. For an unusual format, confirm the reader and writer using `pandoc --list-input-formats` and `pandoc --list-output-formats`.
3. For PDF input, prefer the editable source when available. Otherwise use the built-in Poppler reconstruction and treat its warning as requiring a full visual review.
4. Run a dry run and inspect the JSON plan.

```bash
bun run scripts/print-me.ts --input "/path/to/book.epub" --dry-run --json
```

5. Supply missing title-page metadata when known, then render the requested format.

```bash
bun run scripts/print-me.ts --input "/path/to/book.epub" --output "/path/to/book.print.pdf" --title "Book Name" --author "Author Name" --edition "Second Edition" --isbn "978-0-00000-000-0" --toc auto --json
```

```bash
bun run scripts/print-me.ts --input "/path/to/book.pdf" --output "/path/to/book.print.epub" --to epub3 --toc auto --json
```

6. For PDF, confirm the JSON layout audit and independently inspect the title page, TOC, a dense page, every unusual table, all large or unusually placed figures, every audit warning, chapter boundaries, and the final page.
7. For EPUB, run archive validation and inspect the package in at least one EPUB reader. For other formats, open the file in a native reader and verify headings, images, tables, and metadata.
8. Report the exact output path, format, page count when applicable, metadata, embedded fonts, images, TOC, omissions, warnings, and validation evidence.

## Options

- `--input PATH`: required source file.
- `--output PATH`: destination. Defaults to `<name>.print.pdf` beside the source.
- `--to FORMAT`: output writer. Defaults to `pdf`; common values include `epub3`, `docx`, `odt`, `html5`, `gfm`, `rtf`, and `plain`.
- `--from FORMAT`: explicit Pandoc reader for an unusual non-PDF extension.
- `--title TEXT`, `--author TEXT`, `--edition TEXT`, `--isbn TEXT`: title-page metadata overrides.
- `--toc auto|on|off`: TOC policy; defaults to `auto`.
- `--browser PATH`: explicit Chrome-family executable for PDF output.
- `--font-cache PATH`: reusable font cache.
- `--keep-html`: retain normalized styled HTML for debugging.
- `--overwrite`: replace an existing output only when authorized.
- `--dry-run`: validate and print the conversion plan without downloading fonts or writing output.
- `--json`: emit a stable JSON result.

## Generic scripts

- `scripts/print-me.ts`: inspect, normalize, apply front matter and typography, convert to PDF by default or another requested writer, and validate the result.
- `scripts/audit-layout.ts`: independently audit a rendered PDF for physical-spread heading problems using Poppler text bounding boxes.
- `scripts/audit-skill.ts`: verify the skill package contract, required files, font links, format support, and TypeScript-only automation.
- `scripts/run-integration.ts`: run opt-in real conversions through Pandoc, Chrome, Poppler, and EPUB archive validation.

## Failure and fallback behavior

- If Pandoc rejects an input or output format, report the exact reader or writer error. Never reinterpret arbitrary bytes as plain text.
- If PDF extraction finds too little text, stop and require OCR. Do not create a deceptive text-only book from page images.
- If PDF reconstruction has damaged reading order, columns, tables, equations, or figure placement, keep the result only as a diagnostic and request the editable source or manual remediation.
- If official fonts cannot be downloaded and the cache is empty, stop and provide the three Google Fonts links. Do not substitute system fonts.
- If images fail to embed, stop before delivery. Do not silently provide a text-only result.
- If PDF validation reports a structural error, non-A4 page, missing Source Serif 4, zero-context odd-page heading, or zero-byte result, treat conversion as failed.
- If warnings remain, report their exact pages and explain the visual review. Do not call warnings resolved without inspecting them.
- If the requested writer cannot represent CSS, page geometry, or embedded fonts, preserve content and structure, state the limitation, and do not claim PDF-equivalent typography.

## Output format

```text
Input: <absolute source path>
Output: <absolute output path>
Format: <PDF, EPUB3, DOCX, or other writer>
Pages and size: <count and A4, or not applicable for reflowable output>
Typography: <applied guarantees and format limitations>
Metadata: <title, author, edition, ISBN>
Images: <source and output counts with notes>
TOC: <auto/on/off, entry count, and tree status>
Layout audit: <zero-context turn failures and review warnings, or not applicable>
Validation: <qpdf, pdfinfo, fonts, archive, and reader checks>
Omissions: <cover image, Preface, or none>
Limitations: <none or exact pages/issues>
```
