import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildPrintCss,
  defaultOutputPath,
  injectPrintCss,
  normalizeHeadingNumberSpacing,
  parseArgs,
  parseGoogleFontCss,
  resolveOptions,
  transformBookHtml,
} from "../scripts/print-me";

describe("CLI parsing", () => {
  test("parses documented options", () => {
    const options = parseArgs([
      "--input",
      "book.epub",
      "--output",
      "book.epub",
      "--to",
      "epub3",
      "--author",
      "A. Writer",
      "--edition",
      "Second Edition",
      "--isbn",
      "978-1-23456-789-0",
      "--toc",
      "on",
      "--keep-html",
      "--json",
    ]);
    expect(options.input).toBe("book.epub");
    expect(options.output).toBe("book.epub");
    expect(options.toc).toBe("on");
    expect(options.to).toBe("epub3");
    expect(options.author).toBe("A. Writer");
    expect(options.keepHtml).toBeTrue();
    expect(options.json).toBeTrue();
  });

  test("rejects missing values and invalid TOC modes", () => {
    expect(() => parseArgs([])).toThrow("--input is required");
    expect(() => parseArgs(["--input", "book.md", "--toc", "wide"])).toThrow(
      "--toc must be auto, on, or off",
    );
    expect(() => parseArgs(["--input", "book.md", "--unknown"])).toThrow(
      "Unknown option",
    );
  });
});

describe("path safety", () => {
  test("uses a distinct print suffix", () => {
    expect(defaultOutputPath(join("docs", "guide.md"))).toEndWith(
      join("docs", "guide.print.pdf"),
    );
    expect(defaultOutputPath(join("docs", "guide.md"), "epub3")).toEndWith(
      join("docs", "guide.print.epub"),
    );
  });

  test("accepts PDF input and rejects an existing output without overwrite", async () => {
    const root = join(tmpdir(), `print-me-unit-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    const pdf = join(root, "input.pdf");
    await writeFile(pdf, "pdf");
    const pdfOptions = await resolveOptions(parseArgs(["--input", pdf]));
    expect(pdfOptions.to).toBe("pdf");
    expect(pdfOptions.output).toEndWith("input.print.pdf");
    const markdown = join(root, "input.md");
    const output = join(root, "output.pdf");
    await writeFile(markdown, "# Test");
    await writeFile(output, "existing");
    await expect(
      resolveOptions(parseArgs(["--input", markdown, "--output", output])),
    ).rejects.toThrow("Output already exists");
  });

  test("requires --from for an ambiguous extension", async () => {
    const root = join(tmpdir(), `print-me-unit-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    const input = join(root, "book.custom");
    await writeFile(input, "# Test");
    await expect(resolveOptions(parseArgs(["--input", input]))).rejects.toThrow(
      "pass --from FORMAT",
    );
    const resolved = await resolveOptions(
      parseArgs(["--input", input, "--from", "markdown"]),
    );
    expect(resolved.from).toBe("markdown");
  });
});

describe("typography and font parsing", () => {
  test("encodes the typography, A4 page, image, and connected tree contracts", () => {
    const css = buildPrintCss();
    expect(css).toContain("size: A4");
    expect(css).toContain('font-family: "Source Serif 4"');
    expect(css).toContain("font-size: 11pt");
    expect(css).toContain("line-height: 14pt");
    expect(css).toContain('font-family: "Source Sans 3"');
    expect(css).toContain('font-family: "Source Code Pro"');
    expect(css).toContain('content: "├── "');
    expect(css).toContain('content: "└── "');
    expect(css).toContain("border-left: .6pt solid");
    expect(css).toContain("object-fit: contain");
  });

  test("parses Google Fonts face metadata", () => {
    const css = `@font-face { font-family: 'Source Serif 4'; font-style: italic; font-weight: 400; src: url(https://fonts.example/font.ttf) format('truetype'); }`;
    expect(
      parseGoogleFontCss(
        css,
        "https://fonts.google.com/specimen/Source+Serif+4",
      ),
    ).toEqual([
      expect.objectContaining({
        family: "Source Serif 4",
        style: "italic",
        weight: 400,
        format: "truetype",
      }),
    ]);
  });

  test("injects CSS into a standalone HTML head", () => {
    const html = injectPrintCss(
      "<html><head><title>T</title></head><body>Body</body></html>",
      "body { color: black; }",
    );
    expect(html).toContain('id="print-me-style"');
    expect(html.indexOf("print-me-style")).toBeLessThan(
      html.indexOf("</head>"),
    );
  });

  test("adds a missing space between section numbers and titles", () => {
    const html =
      '<nav id="TOC"><a href="#s">2.20Organizational Governance</a></nav><h2 id="s">2.20Organizational Governance</h2>';
    const normalized = normalizeHeadingNumberSpacing(html);
    expect(normalized).toContain(">2.20 Organizational Governance<");
    expect(normalized.match(/2\.20 Organizational Governance/g)?.length).toBe(
      2,
    );
  });

  test("creates minimal front matter, removes cover and Preface, and builds a TOC", () => {
    const html = `<!doctype html><html><head><title>Useful Book</title><meta name="author" content="A. Writer"></head><body><img alt="cover" src="cover.jpg"><h1>Preface</h1><p>Remove me.</p><h1>1Introduction</h1><p>Keep me.</p><h2>1.1Purpose</h2><p>Purpose text.</p><h2>1.2Audience</h2><p>Audience text.</p></body></html>`;
    const result = transformBookHtml(html, { input: "book.epub", toc: "auto" });
    expect(result.html).toContain("print-me-title-page");
    expect(result.html).toContain("Useful Book");
    expect(result.html).toContain("A. Writer");
    expect(result.html).toContain("Table of Contents");
    expect(result.html).toContain("1 Introduction");
    expect(result.html).not.toContain("Remove me.");
    expect(result.html).not.toContain("cover.jpg");
    expect(result.omissions).toEqual(
      expect.arrayContaining(["cover image", "Preface"]),
    );
  });
});
