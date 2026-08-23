import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditPdfLayout, type LayoutAuditResult } from "./audit-layout";

export type TocMode = "auto" | "on" | "off";

export interface CliOptions {
  input: string;
  output?: string;
  from?: string;
  to?: string;
  title?: string;
  author?: string;
  edition?: string;
  isbn?: string;
  toc: TocMode;
  browser?: string;
  fontCache?: string;
  keepHtml: boolean;
  overwrite: boolean;
  dryRun: boolean;
  json: boolean;
}

export interface ResolvedOptions extends Omit<
  CliOptions,
  "input" | "output" | "to"
> {
  input: string;
  output: string;
  to: string;
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}
interface FontFace {
  family: string;
  style: string;
  weight: number;
  format: string;
  path: string;
  specimen: string;
}
interface RemoteFontFace extends Omit<FontFace, "path"> {
  url: string;
}
interface NormalizedInput {
  html: string;
  sourceImageCount: number;
  sourceKind: "pdf" | "pandoc";
  warnings: string[];
}

export interface PdfValidation {
  pages: number | null;
  pageSize: string | null;
  fonts: string[];
  imageCount: number | null;
  qpdf: "passed" | "unavailable";
  layout: LayoutAuditResult;
}

export const FONT_SOURCES = [
  {
    family: "Source Serif 4",
    query: "Source Serif 4:ital,wght@0,400;0,600;0,700;1,400;1,700",
    specimen: "https://fonts.google.com/specimen/Source+Serif+4",
  },
  {
    family: "Source Sans 3",
    query: "Source Sans 3:wght@600;700",
    specimen: "https://fonts.google.com/specimen/Source+Sans+3",
  },
  {
    family: "Source Code Pro",
    query: "Source Code Pro:wght@400;600",
    specimen: "https://fonts.google.com/specimen/Source+Code+Pro",
  },
] as const;

const INPUT_EXTENSIONS = new Set([
  ".pdf",
  ".epub",
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
  ".xhtml",
  ".docx",
  ".odt",
  ".rtf",
  ".rst",
  ".org",
  ".tex",
  ".latex",
  ".textile",
  ".docbook",
  ".mediawiki",
  ".fb2",
  ".ipynb",
  ".opml",
  ".xml",
]);
const OUTPUT_ALIASES: Record<string, string> = {
  pdf: "pdf",
  epub: "epub3",
  epub3: "epub3",
  epub2: "epub2",
  html: "html5",
  htm: "html5",
  html5: "html5",
  md: "gfm",
  markdown: "markdown",
  txt: "plain",
  text: "plain",
};
const OUTPUT_EXTENSIONS: Record<string, string> = {
  pdf: ".pdf",
  epub3: ".epub",
  epub2: ".epub",
  html5: ".html",
  html4: ".html",
  gfm: ".md",
  markdown: ".md",
  commonmark: ".md",
  commonmark_x: ".md",
  plain: ".txt",
};

const HELP = `Usage: bun run scripts/print-me.ts --input PATH [options]

  --output PATH       Destination (default: <name>.print.pdf)
  --to FORMAT         PDF by default; EPUB or any installed Pandoc writer
  --from FORMAT       Explicit Pandoc input reader
  --title TEXT        Override title-page title
  --author TEXT       Override title-page author or authors
  --edition TEXT      Override title-page edition
  --isbn TEXT         Override title-page ISBN
  --toc MODE          auto, on, or off (default: auto)
  --browser PATH      Chrome-family browser for PDF output
  --font-cache PATH   Font cache directory
  --keep-html         Keep normalized HTML beside the output
  --overwrite         Replace an existing output
  --dry-run           Print the plan without writing output
  --json              Emit JSON`;

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    toc: "auto",
    keepHtml: false,
    overwrite: false,
    dryRun: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      console.log(HELP);
      process.exit(0);
    }
    if (arg === "--input") options.input = requireValue(args, index++, arg);
    else if (arg === "--output")
      options.output = requireValue(args, index++, arg);
    else if (arg === "--from") options.from = requireValue(args, index++, arg);
    else if (arg === "--to") options.to = requireValue(args, index++, arg);
    else if (arg === "--title")
      options.title = requireValue(args, index++, arg);
    else if (arg === "--author")
      options.author = requireValue(args, index++, arg);
    else if (arg === "--edition")
      options.edition = requireValue(args, index++, arg);
    else if (arg === "--isbn") options.isbn = requireValue(args, index++, arg);
    else if (arg === "--toc") {
      const value = requireValue(args, index++, arg);
      if (!["auto", "on", "off"].includes(value))
        throw new Error("--toc must be auto, on, or off");
      options.toc = value as TocMode;
    } else if (arg === "--browser")
      options.browser = requireValue(args, index++, arg);
    else if (arg === "--font-cache")
      options.fontCache = requireValue(args, index++, arg);
    else if (arg === "--keep-html") options.keepHtml = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.input) throw new Error("--input is required");
  return options;
}

function normalizeWriter(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\./, "");
  return OUTPUT_ALIASES[normalized] ?? normalized;
}

function inferWriter(output?: string, explicit?: string): string {
  if (explicit) return normalizeWriter(explicit);
  if (!output) return "pdf";
  const extension = extname(output).slice(1);
  if (!extension)
    throw new Error("Cannot infer output format; pass --to FORMAT");
  return normalizeWriter(extension);
}

export function defaultOutputPath(input: string, writer = "pdf"): string {
  const parsed = parse(input);
  const normalized = normalizeWriter(writer);
  return join(
    parsed.dir,
    `${parsed.name}.print${OUTPUT_EXTENSIONS[normalized] ?? `.${normalized}`}`,
  );
}

export async function resolveOptions(
  options: CliOptions,
): Promise<ResolvedOptions> {
  const input = resolve(options.input);
  if (!existsSync(input)) throw new Error(`Input does not exist: ${input}`);
  if (!(await stat(input)).isFile())
    throw new Error(`Input is not a file: ${input}`);
  const extension = extname(input).toLowerCase();
  if (!INPUT_EXTENSIONS.has(extension) && !options.from)
    throw new Error(
      `Unsupported or ambiguous extension ${extension || "<none>"}; pass --from FORMAT`,
    );
  if (extension === ".pdf" && options.from)
    throw new Error(
      "Do not pass --from for PDF input; Poppler extraction is automatic",
    );
  const to = inferWriter(options.output, options.to);
  const output = resolve(options.output ?? defaultOutputPath(input, to));
  if (output.toLowerCase() === input.toLowerCase())
    throw new Error("Output must be different from input");
  if (existsSync(output) && !options.overwrite)
    throw new Error(
      `Output already exists: ${output}; pass --overwrite only when authorized`,
    );
  return { ...options, input, output, to };
}

export function parseGoogleFontCss(
  css: string,
  specimen = "",
): RemoteFontFace[] {
  const faces: RemoteFontFace[] = [];
  for (const match of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const block = match[1];
    const family = block.match(/font-family:\s*['"]([^'"]+)['"]/i)?.[1];
    const style = block.match(/font-style:\s*([^;]+)/i)?.[1].trim() ?? "normal";
    const weight = Number(block.match(/font-weight:\s*(\d+)/i)?.[1] ?? "400");
    const url = block.match(/src:\s*url\(([^)]+)\)/i)?.[1].replace(/["']/g, "");
    const format =
      block.match(/format\(['"]([^'"]+)['"]\)/i)?.[1] ?? "truetype";
    if (family && url)
      faces.push({ family, style, weight, format, specimen, url });
  }
  return faces;
}

function fontFilename(face: RemoteFontFace): string {
  const family = face.family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const remote = basename(new URL(face.url).pathname).replace(
    /[^a-zA-Z0-9.-]+/g,
    "-",
  );
  return `${family}-${face.style}-${face.weight}-${remote || "font.ttf"}`;
}

export async function getFontFaces(
  cacheDirectory: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FontFace[]> {
  await mkdir(cacheDirectory, { recursive: true });
  const faces: FontFace[] = [];
  for (const source of FONT_SOURCES) {
    const url = new URL("https://fonts.googleapis.com/css2");
    url.searchParams.set("family", source.query);
    url.searchParams.set("display", "swap");
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok)
      throw new Error(
        `Google Fonts request failed for ${source.family}: HTTP ${response.status}; ${source.specimen}`,
      );
    const parsed = parseGoogleFontCss(await response.text(), source.specimen);
    if (!parsed.length)
      throw new Error(
        `Google Fonts returned no usable faces for ${source.family}: ${source.specimen}`,
      );
    for (const remoteFace of parsed) {
      const path = join(cacheDirectory, fontFilename(remoteFace));
      if (!existsSync(path) || (await stat(path)).size === 0) {
        const fontResponse = await fetchImpl(remoteFace.url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!fontResponse.ok)
          throw new Error(
            `Font download failed for ${remoteFace.family}: HTTP ${fontResponse.status}`,
          );
        await writeFile(path, Buffer.from(await fontResponse.arrayBuffer()));
      }
      const { url: _url, ...face } = remoteFace;
      faces.push({ ...face, path });
    }
  }
  for (const family of ["Source Serif 4", "Source Sans 3", "Source Code Pro"])
    if (!faces.some((face) => face.family === family))
      throw new Error(`Required font unavailable: ${family}`);
  return faces;
}

async function fontFaceCss(faces: FontFace[]): Promise<string> {
  const rules: string[] = [];
  for (const face of faces) {
    const bytes = await readFile(face.path);
    const mime = face.path.endsWith(".woff2") ? "font/woff2" : "font/ttf";
    rules.push(
      `@font-face { font-family: "${face.family}"; font-style: ${face.style}; font-weight: ${face.weight}; font-display: block; src: url(data:${mime};base64,${bytes.toString("base64")}) format("${face.format}"); }`,
    );
  }
  return rules.join("\n");
}

export function buildPrintCss(fontCss = ""): string {
  return `${fontCss}
@page { size: A4; margin: 12mm 13mm 14mm; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: "Source Serif 4", serif; font-size: 11pt; line-height: 14pt; color: #111; text-align: justify; hyphens: auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
p { margin: .35em 0; orphans: 2; widows: 2; }
h1, h2, h3, h4, h5, h6, p.subhead, p.subhead1, p.subhead2 { font-family: "Source Sans 3", sans-serif; line-height: 1.12; break-after: avoid-page; page-break-after: avoid; }
h1 { font-size: 21pt; margin: .8em 0 .5em; } h2 { font-size: 17pt; margin: .75em 0 .4em; } h3 { font-size: 14pt; margin: .65em 0 .35em; } h4 { font-size: 12pt; margin: .6em 0 .3em; }
code, pre, kbd, samp { font-family: "Source Code Pro", monospace; } code { font-size: .9em; }
pre { font-size: 9pt; line-height: 12pt; white-space: pre-wrap; overflow-wrap: anywhere; padding: .55em .7em; background: #f4f4f4; border: .5pt solid #d7d7d7; break-inside: avoid; }
img, svg { display: block; width: auto; height: auto; max-width: 100% !important; max-height: 245mm !important; margin: .45em auto; object-fit: contain; }
figure { margin: .55em auto; break-inside: avoid-page; page-break-inside: avoid; }
figcaption, .figure-caption { font-size: 9pt; line-height: 11pt; text-align: center; margin-top: .2em; break-before: avoid-page; page-break-before: avoid; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; line-height: 12pt; } thead { break-after: avoid; } tr { break-inside: avoid; }
th, td { padding: .25em .35em; vertical-align: top; border: .5pt solid #bbb; } th { font-family: "Source Sans 3", sans-serif; font-weight: 600; }
a { color: inherit; text-decoration: none; }
.print-me-title-page { min-height: 260mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-after: page; page-break-after: always; }
.print-me-title-page h1 { font-size: 28pt; margin: 0 0 1.1em; } .print-me-title-page p { text-align: center; margin: .25em 0; }
.source-pdf-page { display: contents; }
nav#TOC { margin: 0 0 1.5em; text-align: left; } nav#TOC > h2 { margin-bottom: .45em; }
nav#TOC ul { list-style: none; margin: 0; padding-left: 0; } nav#TOC > ul > li { padding-left: 3em; }
nav#TOC ul ul { position: relative; margin-left: .36em; padding-left: 3em; border-left: .6pt solid currentColor; }
nav#TOC li { position: relative; margin: 0; line-height: 1.05; break-inside: avoid; }
nav#TOC li::before { content: "├── "; position: absolute; left: -3em; top: 0; width: 3em; font-family: "Source Code Pro", monospace; white-space: pre; }
nav#TOC > ul > li::before { left: 0; } nav#TOC li:last-child::before { content: "└── "; }
`;
}

export function normalizeHeadingNumberSpacing(html: string): string {
  const normalize = (content: string) =>
    content.replace(/^(\s*)(\d+(?:\.\d+)*)(?=[\p{L}])/u, "$1$2 ");
  let result = html.replace(
    /(<h([1-6])\b[^>]*>)([\s\S]*?)(<\/h\2>)/gi,
    (_m, open, _level, content, close) =>
      `${open}${normalize(content)}${close}`,
  );
  result = result.replace(
    /(<nav\b[^>]*\bid=["']TOC["'][^>]*>)([\s\S]*?)(<\/nav>)/gi,
    (_m, open, content, close) =>
      `${open}${content.replace(/(<a\b[^>]*>)([^<]*)(<\/a>)/gi, (_a: string, ao: string, text: string, ac: string) => `${ao}${normalize(text)}${ac}`)}${close}`,
  );
  return result;
}

export function injectPrintCss(html: string, css: string): string {
  const style = `<style id="print-me-style">\n${css}\n</style>`;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${style}\n</head>`)
    : `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${html}</body></html>`;
}

export async function runProcess(
  command: string,
  args: string[],
  cwd?: string,
): Promise<ProcessResult> {
  const child = Bun.spawn([command, ...args], {
    cwd,
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

export function findBrowser(explicit?: string): string {
  if (explicit) {
    const found = resolve(explicit);
    if (!existsSync(found)) throw new Error(`Browser does not exist: ${found}`);
    return found;
  }
  const candidates = [
    "google-chrome",
    "google-chrome-stable",
    "chrome",
    "chromium",
    "chromium-browser",
    "msedge",
  ]
    .map((name) => Bun.which(name))
    .filter(Boolean) as string[];
  if (platform() === "win32") {
    const local = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const x86 = process.env["ProgramFiles(x86)"];
    if (local)
      candidates.push(
        join(local, "Google", "Chrome", "Application", "chrome.exe"),
      );
    if (programFiles)
      candidates.push(
        join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
    if (x86)
      candidates.push(
        join(x86, "Microsoft", "Edge", "Application", "msedge.exe"),
      );
  } else if (platform() === "darwin")
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  const found = candidates.find(existsSync);
  if (!found)
    throw new Error(
      "No Chrome-family browser found; install one or pass --browser PATH",
    );
  return found;
}

function decodeXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 16)),
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function attribute(attributes: string, name: string): string | null {
  return (
    attributes.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] ??
    null
  );
}
function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `section-${crypto.randomUUID()}`
  );
}
function isHeading(text: string): boolean {
  return (
    /^(?:(?:chapter|appendix)\s+)?(?:[A-Z]\d+(?:\.\d+)*|\d+(?:\.\d+)*)\s+[\p{L}]/iu.test(
      text,
    ) &&
    text.length < 180 &&
    !/[.!?]$/.test(text)
  );
}

export function pdfXmlToReflowHtml(
  xml: string,
  xmlPath: string,
  fallbackTitle: string,
): NormalizedInput {
  const title =
    decodeXml(xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    fallbackTitle;
  const pages: string[] = [];
  let sourceImageCount = 0;
  let textCharacters = 0;
  for (const pageMatch of xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/gi)) {
    const pageNumber =
      attribute(pageMatch[1], "number") ?? String(pages.length + 1);
    const fontSizes = new Map<string, number>();
    for (const match of pageMatch[2].matchAll(/<fontspec\b([^>]*)\/>/gi))
      fontSizes.set(
        attribute(match[1], "id") ?? "",
        Number(attribute(match[1], "size") ?? "0"),
      );
    const sizes = [...fontSizes.values()].filter(Boolean).sort((a, b) => a - b);
    const bodySize = sizes[Math.floor(sizes.length / 2)] ?? 12;
    const fragments: string[] = [];
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length)
        fragments.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    for (const element of pageMatch[2].matchAll(
      /<image\b([^>]*)\/>|<text\b([^>]*)>([\s\S]*?)<\/text>/gi,
    )) {
      if (element[1] !== undefined) {
        flush();
        const source = attribute(element[1], "src");
        if (source) {
          fragments.push(
            `<figure class="pdf-figure"><img src="${pathToFileURL(resolve(dirname(xmlPath), source)).href}" alt="Extracted figure from source PDF page ${pageNumber}"></figure>`,
          );
          sourceImageCount += 1;
        }
        continue;
      }
      const attributes = element[2] ?? "";
      const text = decodeXml(element[3] ?? "");
      if (!text) continue;
      textCharacters += text.length;
      const size =
        fontSizes.get(attribute(attributes, "font") ?? "") ?? bodySize;
      const heading =
        isHeading(text) ||
        ((/^(?:preface|references|glossary|index)$/i.test(text) ||
          size >= bodySize * 1.35) &&
          text.length < 180);
      const caption = /^(?:Figure|Table)\s+[A-Z]?\d+(?:[-.]\d+)*[.:]\s+/i.test(
        text,
      );
      const bullet = /^[•●▪‣*-]\s*/.test(text);
      if (heading || caption || bullet) flush();
      if (heading)
        fragments.push(`<h2 id="${slug(text)}">${escapeHtml(text)}</h2>`);
      else if (caption) {
        const prior = fragments.at(-1);
        if (prior?.startsWith('<figure class="pdf-figure">'))
          fragments[fragments.length - 1] = prior.replace(
            "</figure>",
            `<figcaption>${escapeHtml(text)}</figcaption></figure>`,
          );
        else
          fragments.push(`<p class="figure-caption">${escapeHtml(text)}</p>`);
      } else if (bullet)
        fragments.push(
          `<ul><li>${escapeHtml(text.replace(/^[•●▪‣*-]\s*/, ""))}</li></ul>`,
        );
      else {
        paragraph.push(text);
        if (/[.!?;:]$/.test(text) && paragraph.join(" ").length >= 90) flush();
      }
    }
    flush();
    pages.push(
      `<section class="source-pdf-page" data-page="${pageNumber}">${fragments.join("\n")}</section>`,
    );
  }
  if (textCharacters < 200)
    throw new Error(
      "The PDF appears scanned or image-only; run OCR first, then use print-me on the searchable result",
    );
  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${pages.join("\n")}</body></html>`,
    sourceImageCount,
    sourceKind: "pdf",
    warnings: [
      "PDF reflow is reconstructed; verify reading order, tables, columns, and every figure.",
    ],
  };
}

function findSiblingTool(name: string): string | null {
  const executable = platform() === "win32" ? `${name}.exe` : name;
  for (const sibling of [
    Bun.which(name),
    Bun.which("pdfinfo"),
    Bun.which("pdfimages"),
    Bun.which("pdffonts"),
  ]) {
    if (!sibling) continue;
    const candidate = basename(sibling).toLowerCase().startsWith(name)
      ? sibling
      : join(dirname(sibling), executable);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function normalizeInput(
  options: ResolvedOptions,
  work: string,
): Promise<NormalizedInput> {
  if (extname(options.input).toLowerCase() === ".pdf") {
    const tool = findSiblingTool("pdftohtml");
    if (!tool)
      throw new Error("pdftohtml from Poppler is required for PDF input");
    const xmlPath = join(work, "source.xml");
    const result = await runProcess(
      tool,
      [
        "-q",
        "-xml",
        "-noroundcoord",
        "-hidden",
        "-enc",
        "UTF-8",
        options.input,
        xmlPath,
      ],
      work,
    );
    if (result.code !== 0 || !existsSync(xmlPath))
      throw new Error(
        `PDF extraction failed: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    return pdfXmlToReflowHtml(
      await readFile(xmlPath, "utf8"),
      xmlPath,
      parse(options.input).name,
    );
  }
  const pandoc = Bun.which("pandoc");
  if (!pandoc) throw new Error("pandoc is required but was not found");
  const htmlPath = join(work, "normalized.html");
  const args = [
    options.input,
    "--to",
    "html5",
    "--standalone",
    "--embed-resources",
    "--section-divs",
    "--output",
    htmlPath,
    "--resource-path",
    dirname(options.input),
  ];
  const reader =
    options.from ??
    ([".html", ".htm", ".xhtml"].includes(extname(options.input).toLowerCase())
      ? "html"
      : extname(options.input).toLowerCase() === ".txt"
        ? "markdown"
        : undefined);
  if (reader) args.push("--from", reader);
  if (options.title) args.push("--metadata", `title=${options.title}`);
  const result = await runProcess(pandoc, args, dirname(options.input));
  if (result.code !== 0)
    throw new Error(
      `Pandoc failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  const html = await readFile(htmlPath, "utf8");
  if (/\bsrc=["']["']/i.test(html))
    throw new Error("Normalized HTML contains an empty image source");
  return {
    html,
    sourceImageCount: [...html.matchAll(/<(?:img|svg)\b/gi)].length,
    sourceKind: "pandoc",
    warnings: [],
  };
}

function ensureHeadingIds(html: string): string {
  const used = new Set<string>();
  return html.replace(
    /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_m, level, attributes, content) => {
      const existing = attribute(attributes, "id");
      let id = existing ?? slug(decodeXml(content));
      let suffix = 2;
      const base = id;
      while (used.has(id)) id = `${base}-${suffix++}`;
      used.add(id);
      return `<h${level}${existing ? attributes : `${attributes} id="${id}"`}>${content}</h${level}>`;
    },
  );
}

function removePreface(html: string): { html: string; removed: boolean } {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const index = headings.findIndex((heading) =>
    /^preface$/i.test(decodeXml(heading[2])),
  );
  if (index < 0) return { html, removed: false };
  const target = headings[index];
  const level = Number(target[1]);
  const next = headings
    .slice(index + 1)
    .find((heading) => Number(heading[1]) <= level);
  const start = target.index ?? 0;
  const bodyEnd = html.search(/<\/body>/i);
  const end = next?.index ?? (bodyEnd < 0 ? html.length : bodyEnd);
  return { html: html.slice(0, start) + html.slice(end), removed: true };
}

function meta(html: string, name: string): string | null {
  const direct = html.match(
    new RegExp(
      `<meta\\b[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
  )?.[1];
  const reverse = html.match(
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`,
      "i",
    ),
  )?.[1];
  return decodeXml(direct ?? reverse ?? "") || null;
}

function buildToc(
  html: string,
  mode: TocMode,
): { html: string; entries: number } {
  const headings = [...html.matchAll(/<h([1-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({
      level: Number(match[1]),
      id: attribute(match[2], "id"),
      text: decodeXml(match[3]),
    }))
    .filter(
      (heading) => heading.id && !/^table of contents$/i.test(heading.text),
    );
  if (mode === "off" || (mode === "auto" && headings.length < 3))
    return { html: "", entries: 0 };
  const base = headings[0]?.level ?? 1;
  let level = base;
  let list = "";
  for (const heading of headings) {
    while (heading.level > level) {
      list += "<ul>";
      level += 1;
    }
    while (heading.level < level) {
      list += "</li></ul>";
      level -= 1;
    }
    if (list && !list.endsWith("<ul>")) list += "</li>";
    list += `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a>`;
  }
  while (level > base) {
    list += "</li></ul>";
    level -= 1;
  }
  if (list) list += "</li>";
  return {
    html: `<nav id="TOC"><h2>Table of Contents</h2><ul>${list}</ul></nav>`,
    entries: headings.length,
  };
}

export function transformBookHtml(
  source: string,
  options: Pick<
    ResolvedOptions,
    "title" | "author" | "edition" | "isbn" | "toc" | "input"
  >,
) {
  let html = source
    .replace(
      /<header\b[^>]*id=["']title-block-header["'][^>]*>[\s\S]*?<\/header>/i,
      "",
    )
    .replace(/<nav\b[^>]*\bid=["']TOC["'][^>]*>[\s\S]*?<\/nav>/gi, "");
  const omissions: string[] = [];
  html = html
    .replace(
      /<figure\b[^>]*(?:class|id)=["'][^"']*cover[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi,
      () => {
        omissions.push("cover image");
        return "";
      },
    )
    .replace(
      /<img\b[^>]*(?:alt|class|id|src)=["'][^"']*cover[^"']*["'][^>]*>/gi,
      () => {
        if (!omissions.includes("cover image")) omissions.push("cover image");
        return "";
      },
    );
  const preface = removePreface(html);
  html = preface.html;
  if (preface.removed) omissions.push("Preface");
  html = ensureHeadingIds(html);
  const visible = decodeXml(html);
  const title =
    options.title ??
    meta(source, "title") ??
    (decodeXml(source.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
      parse(options.input).name);
  const metadata = {
    title,
    author: options.author ?? meta(source, "author"),
    edition:
      options.edition ??
      visible.match(
        /\b(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|\d+(?:st|nd|rd|th))\s+Edition\b/i,
      )?.[0] ??
      null,
    isbn:
      options.isbn ??
      visible.match(
        /\b(?:ISBN(?:-1[03])?\s*:?[\s-]*)?(97[89][\d\s-]{10,20}|\d[\d\s-]{8,18}[\dX])\b/i,
      )?.[0] ??
      null,
  };
  const toc = buildToc(html, options.toc);
  const isbn = metadata.isbn?.replace(/^ISBN(?:-1[03])?\s*:?[\s-]*/i, "");
  const front = `<section class="print-me-title-page"><h1>${escapeHtml(metadata.title)}</h1>${metadata.author ? `<p>${escapeHtml(metadata.author)}</p>` : ""}${metadata.edition ? `<p>${escapeHtml(metadata.edition)}</p>` : ""}${isbn ? `<p>ISBN: ${escapeHtml(isbn)}</p>` : ""}</section>${toc.html}`;
  html = /<body\b[^>]*>/i.test(html)
    ? html.replace(/<body\b([^>]*)>/i, `<body$1>${front}`)
    : `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${front}${html}</body></html>`;
  return {
    html: normalizeHeadingNumberSpacing(html),
    metadata,
    omissions,
    tocEntries: toc.entries,
  };
}

async function renderPdf(
  browser: string,
  html: string,
  output: string,
  profile: string,
): Promise<void> {
  const result = await runProcess(browser, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=3000",
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${output}`,
    pathToFileURL(html).href,
  ]);
  if (
    result.code !== 0 ||
    !existsSync(output) ||
    (await stat(output)).size === 0
  )
    throw new Error(
      `Browser PDF render failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
}

export async function validatePdf(output: string): Promise<PdfValidation> {
  let qpdf: PdfValidation["qpdf"] = "unavailable";
  const qpdfPath = Bun.which("qpdf");
  if (qpdfPath) {
    const result = await runProcess(qpdfPath, ["--check", output]);
    if (result.code)
      throw new Error(
        `qpdf failed: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    qpdf = "passed";
  }
  let pages: number | null = null;
  let pageSize: string | null = null;
  const pdfinfo = Bun.which("pdfinfo");
  if (pdfinfo) {
    const result = await runProcess(pdfinfo, [output]);
    if (result.code) throw new Error(`pdfinfo failed: ${result.stderr.trim()}`);
    pages = Number(result.stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? "") || null;
    pageSize = result.stdout.match(/^Page size:\s+(.+)$/m)?.[1].trim() ?? null;
    if (!pageSize?.includes("A4"))
      throw new Error(`Expected A4 output, received ${pageSize ?? "unknown"}`);
  }
  let fonts: string[] = [];
  const pdffonts = Bun.which("pdffonts");
  if (pdffonts) {
    const result = await runProcess(pdffonts, [output]);
    if (result.code)
      throw new Error(`pdffonts failed: ${result.stderr.trim()}`);
    fonts = result.stdout
      .split(/\r?\n/)
      .slice(2)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
    if (!fonts.some((font) => /SourceSerif4/i.test(font)))
      throw new Error("Source Serif 4 is not embedded");
  }
  let imageCount: number | null = null;
  const pdfimages = Bun.which("pdfimages");
  if (pdfimages) {
    const result = await runProcess(pdfimages, ["-list", output]);
    if (result.code)
      throw new Error(`pdfimages failed: ${result.stderr.trim()}`);
    imageCount = result.stdout
      .split(/\r?\n/)
      .slice(2)
      .filter((line) => line.trim()).length;
  }
  const layout = await auditPdfLayout(output);
  if (!layout.passed)
    throw new Error(
      `Layout audit found ${layout.zeroContextTurnViolations.length} heading(s) stranded before a physical page turn`,
    );
  return {
    pages,
    pageSize,
    fonts: [...new Set(fonts)],
    imageCount,
    qpdf,
    layout,
  };
}

async function ensureWriter(writer: string): Promise<string> {
  const pandoc = Bun.which("pandoc");
  if (!pandoc) throw new Error("pandoc is required but was not found");
  if (writer === "pdf") return pandoc;
  const result = await runProcess(pandoc, ["--list-output-formats"]);
  if (result.code || !result.stdout.split(/\r?\n/).includes(writer))
    throw new Error(`Pandoc output writer is unavailable: ${writer}`);
  return pandoc;
}

async function renderOther(
  pandoc: string,
  html: string,
  output: string,
  writer: string,
): Promise<Record<string, unknown>> {
  const args = [
    html,
    "--from",
    "html",
    "--to",
    writer,
    "--standalone",
    "--output",
    output,
    "--resource-path",
    dirname(html),
  ];
  if (["epub2", "epub3"].includes(writer)) args.push("--embed-resources");
  const result = await runProcess(pandoc, args, dirname(html));
  if (result.code || !existsSync(output) || (await stat(output)).size === 0)
    throw new Error(
      `Pandoc output failed: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  let archive: "passed" | "unavailable" | "not_applicable" = "not_applicable";
  if (["epub2", "epub3"].includes(writer)) {
    const sevenZip = Bun.which("7z");
    if (sevenZip) {
      const check = await runProcess(sevenZip, ["t", "-bd", "-bso0", output]);
      if (check.code)
        throw new Error(
          `EPUB archive validation failed: ${check.stderr.trim()}`,
        );
      archive = "passed";
    } else archive = "unavailable";
  }
  return { writer, bytes: (await stat(output)).size, archive };
}

export async function convertDocument(
  options: ResolvedOptions,
): Promise<Record<string, unknown>> {
  const pandoc = await ensureWriter(options.to);
  const browser = options.to === "pdf" ? findBrowser(options.browser) : null;
  const fontCache = resolve(
    options.fontCache ?? join(homedir(), ".cache", "print-me", "fonts"),
  );
  const plan = {
    status: options.dryRun ? "planned" : "created",
    input: options.input,
    output: options.output,
    output_format: options.to,
    page_size: options.to === "pdf" ? "A4" : null,
    typography: {
      body: "Source Serif 4 11 pt",
      line_spacing: "14 pt",
      headings: "Source Sans 3",
      code: "Source Code Pro",
    },
    toc: options.toc,
    browser,
    pandoc,
    font_cache: fontCache,
  };
  if (options.dryRun) return plan;
  const work = await mkdtemp(join(tmpdir(), "print-me-"));
  const htmlPath = join(work, "print.html");
  const candidate = join(
    work,
    `candidate${extname(options.output) || (OUTPUT_EXTENSIONS[options.to] ?? `.${options.to}`)}`,
  );
  const keptHtml = options.keepHtml
    ? options.output.slice(0, -extname(options.output).length) + ".html"
    : null;
  if (keptHtml && existsSync(keptHtml) && !options.overwrite)
    throw new Error(`HTML output already exists: ${keptHtml}`);
  try {
    const normalized = await normalizeInput(options, work);
    const transformed = transformBookHtml(normalized.html, options);
    const styled =
      options.to === "pdf" ||
      ["epub2", "epub3", "html4", "html5"].includes(options.to);
    const faces = styled ? await getFontFaces(fontCache) : [];
    await writeFile(
      htmlPath,
      injectPrintCss(
        transformed.html,
        buildPrintCss(styled ? await fontFaceCss(faces) : ""),
      ),
      "utf8",
    );
    let validation: Record<string, unknown> | PdfValidation;
    if (options.to === "pdf") {
      await renderPdf(
        browser!,
        htmlPath,
        candidate,
        join(work, "browser-profile"),
      );
      validation = await validatePdf(candidate);
    } else if (["html4", "html5"].includes(options.to)) {
      await copyFile(htmlPath, candidate);
      validation = {
        writer: options.to,
        bytes: (await stat(candidate)).size,
        archive: "not_applicable",
      };
    } else
      validation = await renderOther(pandoc, htmlPath, candidate, options.to);
    await mkdir(dirname(options.output), { recursive: true });
    await copyFile(candidate, options.output);
    if (keptHtml) await copyFile(htmlPath, keptHtml);
    return {
      ...plan,
      source_kind: normalized.sourceKind,
      source_images: normalized.sourceImageCount,
      metadata: transformed.metadata,
      toc_entries: transformed.tocEntries,
      omissions: transformed.omissions,
      warnings: normalized.warnings,
      validation,
      html: keptHtml,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export const convertToPdf = convertDocument;

export async function main(args = Bun.argv.slice(2)): Promise<void> {
  let json = args.includes("--json");
  try {
    const parsed = parseArgs(args);
    json = parsed.json;
    const result = await convertDocument(await resolveOptions(parsed));
    if (json) console.log(JSON.stringify(result, null, 2));
    else
      console.log(
        `Input: ${result.input}\nOutput: ${result.output}\nFormat: ${result.output_format}\nTypography: Source Serif 4 11/14 pt; Source Sans 3 headings; Source Code Pro code\nValidation: ${JSON.stringify(result.validation)}`,
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ status: "error", error: message }));
    else console.error(`print-me: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
