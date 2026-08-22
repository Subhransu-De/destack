import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface TorrentResult {
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  nbSeeders?: number;
  nbLeechers?: number;
  engineName?: string;
  [key: string]: unknown;
}

export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string[]>;
}

export const baseUrl = (process.env.QBT_BASE_URL ?? "http://localhost:2200")
  .replace(/\/api\/v2\/?$/i, "")
  .replace(/\/$/, "");
export const apiBase = `${baseUrl}/api/v2`;
export const tempDir = process.env.TEMP ?? process.env.TMP ?? "/tmp";
export const cookieFile =
  process.env.QBT_COOKIE_FILE ?? join(tempDir, "qbt_cookies.txt");

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--"))
      throw new Error(`Unexpected argument: ${token ?? ""}`);
    const collected: string[] = [];
    while (index + 1 < argv.length && !argv[index + 1]?.startsWith("--")) {
      collected.push(argv[index + 1] as string);
      index += 1;
    }
    if (collected.length === 0) flags.add(token);
    else values.set(token, [...(values.get(token) ?? []), ...collected]);
  }
  return { flags, values };
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
}

export function values(
  args: ParsedArgs,
  name: string,
  required = false,
): string[] {
  const result = args.values.get(name) ?? [];
  if (required && result.length === 0) throw new Error(`${name} is required.`);
  return result;
}

export function value(
  args: ParsedArgs,
  name: string,
  fallback?: string,
): string | undefined {
  const result = values(args, name);
  if (result.length > 1) throw new Error(`${name} accepts one value.`);
  return result[0] ?? fallback;
}

export function integerValue(
  args: ParsedArgs,
  name: string,
  fallback: number,
): number {
  const raw = value(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

export async function expandPatterns(patterns: string[]): Promise<string[]> {
  const found = new Set<string>();
  for (const pattern of patterns) {
    try {
      if ((await stat(pattern)).isFile()) {
        found.add(pattern);
        continue;
      }
    } catch {
      // Fall through to glob expansion.
    }
    const glob = new Bun.Glob(pattern.replaceAll("\\", "/"));
    for await (const match of glob.scan({
      cwd: process.cwd(),
      onlyFiles: true,
    }))
      found.add(match);
  }
  return [...found];
}

export async function loadSearchResults(
  paths: string[],
): Promise<TorrentResult[]> {
  const all: TorrentResult[] = [];
  for (const path of paths) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      const candidate =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? ((parsed as { results?: unknown }).results ?? parsed)
          : parsed;
      if (Array.isArray(candidate)) all.push(...(candidate as TorrentResult[]));
      else if (candidate && typeof candidate === "object")
        all.push(candidate as TorrentResult);
    } catch (error) {
      console.error(`Warning: Could not load ${path}: ${errorMessage(error)}`);
    }
  }
  return all;
}

const errorMarkers = [
  "[error]",
  "api key",
  "not authorized",
  "ncore error",
  "jackett:",
  "prowlarr:",
  "empty cookies",
  "connection error",
  "unexpected page",
  "you have not updated",
  "please check your credentials",
];

export function isErrorResult(result: TorrentResult): boolean {
  const name = String(result.fileName ?? "").toLowerCase();
  const seeds = Number(result.nbSeeders ?? 0);
  const size = Number(result.fileSize ?? 0);
  return (
    errorMarkers.some((marker) => name.includes(marker)) ||
    name.includes("error") ||
    seeds === -1 ||
    (seeds === 100 && size >= 1024 ** 4)
  );
}

export function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "?";
  const mib = bytes / 1024 ** 2;
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GB` : `${mib.toFixed(0)} MB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function cookieHeader(): Promise<string> {
  try {
    const raw = await readFile(cookieFile, "utf8");
    const cookies: string[] = [];
    for (const originalLine of raw.split(/\r?\n/)) {
      if (!originalLine.trim()) continue;
      if (/^[^#\s=]+=[^\s]+$/.test(originalLine.trim())) {
        cookies.push(originalLine.trim());
        continue;
      }
      const line = originalLine.startsWith("#HttpOnly_")
        ? originalLine.slice("#HttpOnly_".length)
        : originalLine;
      if (line.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length >= 7) cookies.push(`${parts[5]}=${parts[6]}`);
    }
    return cookies.join("; ");
  } catch {
    return "";
  }
}

async function persistSetCookie(header: string | null): Promise<void> {
  if (!header) return;
  const first = header.split(",", 1)[0]?.split(";", 1)[0]?.trim();
  if (!first?.includes("=")) return;
  const separator = first.indexOf("=");
  const name = first.slice(0, separator);
  const cookieValue = first.slice(separator + 1);
  const host = new URL(baseUrl).hostname;
  const netscape = `# Netscape HTTP Cookie File\n#HttpOnly_${host}\tFALSE\t/\tFALSE\t0\t${name}\t${cookieValue}\n`;
  await mkdir(dirname(cookieFile), { recursive: true });
  await writeFile(cookieFile, netscape, "utf8");
}

export async function qbtRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Referer", baseUrl);
  const cookie = await cookieHeader();
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  await persistSetCookie(response.headers.get("set-cookie"));
  if (!response.ok) {
    const body = (await response.text()).trim();
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${response.status}${body ? `: ${body}` : ""}).`,
    );
  }
  return response;
}

export async function qbtJson<T>(path: string): Promise<T> {
  return qbtRequest(path).then((response) => response.json() as Promise<T>);
}

export async function qbtPost(
  path: string,
  data: Record<string, string>,
): Promise<string> {
  const response = await qbtRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data),
  });
  return (await response.text()).trim();
}

export async function initializeSession(): Promise<boolean> {
  try {
    const response = await qbtRequest("/app/version");
    return (await response.text()).trim().length > 0;
  } catch {
    return false;
  }
}

export async function writeJson(
  path: string,
  valueToWrite: unknown,
): Promise<number> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(valueToWrite), "utf8");
  return (await stat(path)).size;
}

export async function appendLine(path: string, line: string): Promise<void> {
  await appendFile(path, `${line}\n`, "utf8");
}
