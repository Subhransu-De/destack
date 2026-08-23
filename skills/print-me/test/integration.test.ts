import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runProcess } from "../scripts/print-me";

test("converts a representative Markdown document through Pandoc and Chrome", async () => {
  if (process.env.PRINT_ME_INTEGRATION !== "1") return;
  const root = join(import.meta.dir, "..");
  const outputDirectory = join(
    tmpdir(),
    `print-me-integration-${crypto.randomUUID()}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  const output = join(outputDirectory, "sample.pdf");
  const result = await runProcess(
    Bun.which("bun")!,
    [
      "run",
      join(root, "scripts", "print-me.ts"),
      "--input",
      join(root, "test", "fixtures", "sample.md"),
      "--output",
      output,
      "--toc",
      "on",
      "--json",
    ],
    root,
  );
  expect(result.code, result.stderr || result.stdout).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.status).toBe("created");
  expect(parsed.validation.pageSize).toContain("A4");
  expect(parsed.validation.pages).toBeGreaterThan(0);
  expect(
    parsed.validation.fonts.some((font: string) => /SourceSerif4/i.test(font)),
  ).toBeTrue();
  expect(parsed.source_images).toBeGreaterThan(0);
  expect(parsed.validation.imageCount).toBeGreaterThanOrEqual(0);
  expect((await readFile(output)).length).toBeGreaterThan(1000);
}, 120_000);

test("converts a reflowable EPUB with its image intact", async () => {
  if (process.env.PRINT_ME_INTEGRATION !== "1") return;
  const root = join(import.meta.dir, "..");
  const outputDirectory = join(
    tmpdir(),
    `print-me-epub-${crypto.randomUUID()}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  const epub = join(outputDirectory, "sample.epub");
  const output = join(outputDirectory, "sample.print.pdf");
  const pandoc = Bun.which("pandoc")!;
  const packaged = await runProcess(
    pandoc,
    [join(root, "test", "fixtures", "sample.md"), "--output", epub],
    join(root, "test", "fixtures"),
  );
  expect(packaged.code, packaged.stderr || packaged.stdout).toBe(0);
  const converted = await runProcess(
    Bun.which("bun")!,
    [
      "run",
      join(root, "scripts", "print-me.ts"),
      "--input",
      epub,
      "--output",
      output,
      "--toc",
      "on",
      "--json",
    ],
    root,
  );
  expect(converted.code, converted.stderr || converted.stdout).toBe(0);
  const parsed = JSON.parse(converted.stdout);
  expect(parsed.validation.pageSize).toContain("A4");
  expect(parsed.validation.qpdf).toBe("passed");
  expect(
    parsed.validation.fonts.some((font: string) => /SourceSerif4/i.test(font)),
  ).toBeTrue();
  expect(parsed.source_images).toBeGreaterThan(0);
}, 120_000);

test("emits EPUB when explicitly requested", async () => {
  if (process.env.PRINT_ME_INTEGRATION !== "1") return;
  const root = join(import.meta.dir, "..");
  const outputDirectory = join(
    tmpdir(),
    `print-me-output-epub-${crypto.randomUUID()}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  const output = join(outputDirectory, "sample.print.epub");
  const result = await runProcess(
    Bun.which("bun")!,
    [
      "run",
      join(root, "scripts", "print-me.ts"),
      "--input",
      join(root, "test", "fixtures", "sample.md"),
      "--output",
      output,
      "--to",
      "epub3",
      "--toc",
      "on",
      "--json",
    ],
    root,
  );
  expect(result.code, result.stderr || result.stdout).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.output_format).toBe("epub3");
  expect(parsed.validation.archive).toBe("passed");
  expect((await readFile(output)).length).toBeGreaterThan(1000);
}, 120_000);

test("reconstructs a text-bearing PDF and emits EPUB", async () => {
  if (process.env.PRINT_ME_INTEGRATION !== "1") return;
  const root = join(import.meta.dir, "..");
  const outputDirectory = join(
    tmpdir(),
    `print-me-pdf-input-${crypto.randomUUID()}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  const pdf = join(outputDirectory, "source.print.pdf");
  const epub = join(outputDirectory, "from-pdf.print.epub");
  const created = await runProcess(
    Bun.which("bun")!,
    [
      "run",
      join(root, "scripts", "print-me.ts"),
      "--input",
      join(root, "test", "fixtures", "sample.md"),
      "--output",
      pdf,
      "--toc",
      "on",
      "--json",
    ],
    root,
  );
  expect(created.code, created.stderr || created.stdout).toBe(0);
  const converted = await runProcess(
    Bun.which("bun")!,
    [
      "run",
      join(root, "scripts", "print-me.ts"),
      "--input",
      pdf,
      "--output",
      epub,
      "--to",
      "epub3",
      "--toc",
      "on",
      "--json",
    ],
    root,
  );
  expect(converted.code, converted.stderr || converted.stdout).toBe(0);
  const parsed = JSON.parse(converted.stdout);
  expect(parsed.source_kind).toBe("pdf");
  expect(parsed.output_format).toBe("epub3");
  expect(parsed.validation.archive).toBe("passed");
  expect(parsed.warnings).toHaveLength(1);
  expect((await readFile(epub)).length).toBeGreaterThan(1000);
}, 180_000);
