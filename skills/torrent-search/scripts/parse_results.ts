import {
  errorMessage,
  expandPatterns,
  formatSize,
  hasFlag,
  isErrorResult,
  loadSearchResults,
  parseArgs,
  TorrentResult,
  value,
  values,
} from "./common";

interface RankedResult {
  name: string;
  seeds: number;
  size: number;
  url: string;
  engine: string;
}

const qualityTier: Record<string, number> = {
  "4k remux": 7,
  "2160p remux": 7,
  "4k": 6,
  "2160p": 6,
  uhd: 6,
  "1080p remux": 5,
  "1080p": 4,
  fullhd: 4,
  "720p": 3,
  "480p": 2,
  "576p": 2,
  dvdrip: 1,
  sd: 1,
};
const sourceTier: Record<string, number> = {
  bluray: 5,
  "blu-ray": 5,
  bdrip: 5,
  brrip: 5,
  "web-dl": 4,
  webdl: 4,
  webrip: 3,
  web: 3,
  hdtv: 2,
  dvdrip: 1,
};

function usage(): void {
  console.log(
    "Usage: bun run parse_results.ts --files <json...> --query <query> [--json]",
  );
}

export function detectTags(name: string): string[] {
  const lower = name.toLowerCase();
  const tags: string[] = [];
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd"))
    tags.push("4K/UHD");
  else if (lower.includes("1080p")) tags.push("1080p");
  else if (lower.includes("720p")) tags.push("720p");
  else if (lower.includes("480p") || lower.includes("576p")) tags.push("SD");
  if (lower.includes("remux")) tags.push("REMUX");
  if (
    ["bluray", "blu-ray", "bdrip", "brrip"].some((item) => lower.includes(item))
  )
    tags.push("BluRay");
  else if (lower.includes("web-dl") || lower.includes("webdl"))
    tags.push("WEB-DL");
  else if (lower.includes("webrip")) tags.push("WEBRip");
  else if (lower.includes("hdtv")) tags.push("HDTV");
  if (["hevc", "x265", "h.265"].some((item) => lower.includes(item)))
    tags.push("HEVC");
  if (lower.includes("hdr")) tags.push("HDR");
  if (lower.includes("dts")) tags.push("DTS");
  if (lower.includes("atmos") || lower.includes("truehd"))
    tags.push("Atmos/TrueHD");
  return tags;
}

export function qualityScore(name: string): number {
  const lower = name.toLowerCase();
  const quality = Math.max(
    0,
    ...Object.entries(qualityTier)
      .filter(([marker]) => lower.includes(marker))
      .map(([, score]) => score),
  );
  const source = Math.max(
    0,
    ...Object.entries(sourceTier)
      .filter(([marker]) => lower.includes(marker))
      .map(([, score]) => score),
  );
  return quality * 10 + source;
}

export function rankResults(
  results: TorrentResult[],
  query: string,
): RankedResult[] {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "have",
    "not",
    "are",
    "was",
  ]);
  const keywords = query
    .replaceAll(".", " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));
  const seen = new Map<string, RankedResult>();
  for (const result of results) {
    if (isErrorResult(result)) continue;
    const name = String(result.fileName ?? "").trim();
    if (
      !name ||
      !keywords.every((keyword) => name.toLowerCase().includes(keyword))
    )
      continue;
    const candidate = {
      name,
      seeds: Number(result.nbSeeders ?? 0),
      size: Number(result.fileSize ?? 0),
      url: String(result.fileUrl ?? ""),
      engine: String(result.engineName ?? ""),
    };
    const key = name.toLowerCase();
    if (!seen.has(key) || (seen.get(key)?.seeds ?? -1) < candidate.seeds)
      seen.set(key, candidate);
  }
  return [...seen.values()];
}

function printTable(title: string, rows: RankedResult[]): void {
  console.log(`\n### ${title}\n`);
  if (rows.length === 0) {
    console.log("No results found.");
    return;
  }
  console.log(
    `${"#".padEnd(4)} ${"Seeds".padEnd(7)} ${"Size".padEnd(10)} ${"Tags".padEnd(30)} Name`,
  );
  console.log("-".repeat(110));
  rows.slice(0, 10).forEach((result, index) => {
    console.log(
      `${String(index + 1).padEnd(4)} ${String(result.seeds).padEnd(7)} ${formatSize(result.size).padEnd(10)} ${detectTags(result.name).join(" ").padEnd(30)} ${result.name}`,
    );
  });
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }
  const query = value(args, "--query") ?? "";
  if (!query) throw new Error("--query is required.");
  const files = await expandPatterns(values(args, "--files", true));
  const results = rankResults(await loadSearchResults(files), query);
  if (results.length === 0) {
    console.log("No matching results found after filtering.");
    return;
  }
  const has4k = results.some((result) => /4k|2160p|uhd/i.test(result.name));
  const bySeeds = [...results].sort((left, right) => right.seeds - left.seeds);
  const byQuality = [...results].sort(
    (left, right) =>
      qualityScore(right.name) - qualityScore(left.name) ||
      right.seeds - left.seeds,
  );
  if (hasFlag(args, "--json")) {
    const seen = new Set<string>();
    const merged = [...bySeeds, ...byQuality]
      .filter((result) => {
        if (seen.has(result.url)) return false;
        seen.add(result.url);
        return true;
      })
      .slice(0, 20)
      .map((result) => ({
        label: `[${String(result.seeds).padStart(4)} seeds] ${formatSize(result.size).padStart(9)}   ${result.name}`,
        description: detectTags(result.name).join(" ") || "-",
        ...result,
      }));
    console.log(JSON.stringify({ has_4k: has4k, results: merged }));
    return;
  }
  if (!has4k)
    console.log("\n[No 4K/UHD version found across all searched plugins.]");
  printTable("Best Seeded", bySeeds);
  printTable("Highest Quality", byQuality);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
