import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

export type SpreadTransition = "turn" | "same_spread";

export interface LayoutLine {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface LayoutPage {
  page: number;
  width: number;
  height: number;
  lines: LayoutLine[];
}

export interface HeadingFinding {
  page: number;
  transition: SpreadTransition;
  heading: string;
  yFraction: number;
  bodyLinesAfter: number;
}

export interface CaptionFinding {
  page: number;
  transition: SpreadTransition;
  caption: string;
  yFraction: number;
}

export interface LayoutAuditResult {
  file: string | null;
  pages: number;
  zeroContextTurnViolations: HeadingFinding[];
  sameSpreadHeadingWarnings: HeadingFinding[];
  limitedContextTurnWarnings: HeadingFinding[];
  captionAtTopWarnings: CaptionFinding[];
  passed: boolean;
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function numberAttribute(attributes: string, name: string): number {
  const match = attributes.match(
    new RegExp(`\\b${name}=["']([^"']+)["']`, "i"),
  );
  return Number(match?.[1] ?? "0");
}

export function parseBBoxLayout(xml: string): LayoutPage[] {
  const pages: LayoutPage[] = [];
  let pageNumber = 0;
  for (const pageMatch of xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/gi)) {
    pageNumber += 1;
    const attributes = pageMatch[1];
    const lines: LayoutLine[] = [];
    const seen = new Set<string>();
    for (const lineMatch of pageMatch[2].matchAll(
      /<line\b([^>]*)>([\s\S]*?)<\/line>/gi,
    )) {
      const text = decodeXml(lineMatch[2]);
      if (!text) continue;
      const line: LayoutLine = {
        text,
        xMin: numberAttribute(lineMatch[1], "xMin"),
        yMin: numberAttribute(lineMatch[1], "yMin"),
        xMax: numberAttribute(lineMatch[1], "xMax"),
        yMax: numberAttribute(lineMatch[1], "yMax"),
      };
      const key = `${line.xMin.toFixed(2)}:${line.yMin.toFixed(2)}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
    lines.sort(
      (left, right) => left.yMin - right.yMin || left.xMin - right.xMin,
    );
    pages.push({
      page: pageNumber,
      width: numberAttribute(attributes, "width"),
      height: numberAttribute(attributes, "height"),
      lines,
    });
  }
  return pages;
}

export function spreadTransition(page: number): SpreadTransition {
  return page % 2 === 1 ? "turn" : "same_spread";
}

function isHeading(text: string): boolean {
  if (text.length > 170 || /[.!?]$/.test(text)) return false;
  return /^(?:(?:chapter|appendix)\s+)?(?:[A-Z]\d+(?:\.\d+)*|\d+(?:\.\d+)*)\s+[\p{L}]/iu.test(
    text,
  );
}

function isCaption(text: string): boolean {
  return /^(?:Figure|Table)\s+[A-Z]?\d+(?:[-.]\d+)*[.:]\s+/i.test(text);
}

function isPageNumber(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

function isTocPage(page: LayoutPage): boolean {
  return page.lines
    .slice(0, 20)
    .some((line) => /^table of contents$/i.test(line.text));
}

export function auditLayoutPages(
  pages: LayoutPage[],
  file: string | null = null,
): LayoutAuditResult {
  const zeroContextTurnViolations: HeadingFinding[] = [];
  const sameSpreadHeadingWarnings: HeadingFinding[] = [];
  const limitedContextTurnWarnings: HeadingFinding[] = [];
  const captionAtTopWarnings: CaptionFinding[] = [];

  for (const page of pages) {
    if (!page.height || isTocPage(page)) continue;
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index];
      const yFraction = line.yMin / page.height;
      const transition = spreadTransition(page.page);
      if (isCaption(line.text) && yFraction < 0.12 && page.page > 1) {
        captionAtTopWarnings.push({
          page: page.page,
          transition,
          caption: line.text,
          yFraction,
        });
      }
      if (!isHeading(line.text) || isCaption(line.text)) continue;
      const bodyLinesAfter = page.lines.slice(index + 1).filter((candidate) => {
        if (candidate.yMin <= line.yMax + 0.25) return false;
        if (isPageNumber(candidate.text) || isHeading(candidate.text))
          return false;
        return true;
      }).length;
      const finding: HeadingFinding = {
        page: page.page,
        transition,
        heading: line.text,
        yFraction,
        bodyLinesAfter,
      };
      if (bodyLinesAfter === 0) {
        if (transition === "turn") zeroContextTurnViolations.push(finding);
        else sameSpreadHeadingWarnings.push(finding);
      } else if (
        transition === "turn" &&
        yFraction >= 0.78 &&
        bodyLinesAfter < 2
      ) {
        limitedContextTurnWarnings.push(finding);
      }
    }
  }

  return {
    file,
    pages: pages.length,
    zeroContextTurnViolations,
    sameSpreadHeadingWarnings,
    limitedContextTurnWarnings,
    captionAtTopWarnings,
    passed: zeroContextTurnViolations.length === 0,
  };
}

async function runProcess(
  command: string,
  args: string[],
): Promise<ProcessResult> {
  const child = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

function candidatePdftotextPaths(explicit?: string): string[] {
  const candidates: string[] = [];
  if (explicit) candidates.push(resolve(explicit));
  for (const sibling of [
    Bun.which("pdfinfo"),
    Bun.which("pdfimages"),
    Bun.which("pdffonts"),
  ]) {
    if (sibling)
      candidates.push(
        join(
          dirname(sibling),
          process.platform === "win32" ? "pdftotext.exe" : "pdftotext",
        ),
      );
  }
  const direct = Bun.which("pdftotext");
  if (direct) candidates.push(direct);
  return [...new Set(candidates)].filter((candidate) => existsSync(candidate));
}

export async function auditPdfLayout(
  pdfInput: string,
  explicitPdftotext?: string,
): Promise<LayoutAuditResult> {
  const pdf = resolve(pdfInput);
  if (!existsSync(pdf)) throw new Error(`PDF does not exist: ${pdf}`);
  if (extname(pdf).toLowerCase() !== ".pdf")
    throw new Error(`Expected a PDF input: ${pdf}`);
  const failures: string[] = [];
  for (const tool of candidatePdftotextPaths(explicitPdftotext)) {
    const result = await runProcess(tool, ["-bbox-layout", pdf, "-"]);
    if (result.code === 0 && /<page\b/i.test(result.stdout))
      return auditLayoutPages(parseBBoxLayout(result.stdout), pdf);
    failures.push(
      `${tool}: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}`,
    );
  }
  throw new Error(
    `A Poppler pdftotext with -bbox-layout support is required. ${failures.join(" | ")}`,
  );
}

function parseCli(args: string[]): {
  pdf: string;
  pdftotext?: string;
  json: boolean;
} {
  let pdf = "";
  let pdftotext: string | undefined;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--pdf") pdf = args[++index] ?? "";
    else if (arg === "--pdftotext") pdftotext = args[++index];
    else if (arg === "--json") json = true;
    else if (!arg.startsWith("--") && !pdf) pdf = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!pdf)
    throw new Error(
      "Usage: bun run scripts/audit-layout.ts --pdf PATH [--pdftotext PATH] [--json]",
    );
  return { pdf, pdftotext, json };
}

if (import.meta.main) {
  try {
    const options = parseCli(Bun.argv.slice(2));
    const result = await auditPdfLayout(options.pdf, options.pdftotext);
    console.log(
      options.json
        ? JSON.stringify(result, null, 2)
        : `Pages: ${result.pages}\nZero-context turn violations: ${result.zeroContextTurnViolations.length}\nPassed: ${result.passed}`,
    );
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
