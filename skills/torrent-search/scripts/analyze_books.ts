import {
  errorMessage,
  expandPatterns,
  hasFlag,
  isErrorResult,
  loadSearchResults,
  parseArgs,
  TorrentResult,
  value,
  values,
} from "./common";

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
  "its",
  "how",
  "why",
  "what",
  "who",
  "a",
  "of",
  "in",
  "an",
]);

function usage(): void {
  console.log(
    "Usage: bun run analyze_books.ts --files <json...> --query <query> [--json]",
  );
}

export function queryKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s\-_,.]+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

export function isRelevant(name: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const lower = name.toLowerCase();
  const matches = keywords.filter((keyword) => lower.includes(keyword)).length;
  return matches >= Math.max(1, Math.ceil(keywords.length / 2));
}

export function analyzeBooks(
  results: TorrentResult[],
  query = "",
): Record<string, unknown> {
  const keywords = queryKeywords(query);
  let valid = results.filter(
    (result) =>
      !isErrorResult(result) &&
      isRelevant(String(result.fileName ?? ""), keywords),
  );
  if (valid.length === 0) {
    const unfiltered = results.filter((result) => !isErrorResult(result));
    if (unfiltered.length === 0)
      return {
        content_type: "book",
        top_candidates: [],
        message: "No valid results found",
      };
    console.error(
      `Warning: relevance filter removed all results for '${query}', using unfiltered set`,
    );
    valid = unfiltered;
  }
  valid.sort(
    (left, right) =>
      Number(right.nbSeeders ?? 0) - Number(left.nbSeeders ?? 0) ||
      Number(right.fileSize ?? 0) - Number(left.fileSize ?? 0),
  );
  const topCandidates = valid.slice(0, 10);
  return {
    content_type: "book",
    top_candidates: topCandidates,
    total_valid_results: valid.length,
    best_candidate: topCandidates[0] ?? null,
  };
}

export function formatBookOutput(analysis: Record<string, unknown>): string {
  const lines = ["=".repeat(80), "BOOK SEARCH RESULTS", "=".repeat(80)];
  const best = analysis.best_candidate as TorrentResult | null | undefined;
  if (!best)
    return [...lines, String(analysis.message ?? "No results found")].join(
      "\n",
    );
  const candidates = (analysis.top_candidates ?? []) as TorrentResult[];
  lines.push(
    `\nTotal valid results found: ${Number(analysis.total_valid_results ?? 0)}`,
  );
  lines.push("\nTop 10 candidates (ranked by seeds, then size):\n");
  candidates.forEach((item, index) => {
    const name = String(item.fileName ?? "");
    const seeds = Number(item.nbSeeders ?? -1);
    const sizeGib = Number(item.fileSize ?? 0) / 1024 ** 3;
    lines.push(`${String(index + 1).padStart(2)}. ${name.slice(0, 65)}`);
    lines.push(
      `     Seeds: ${String(seeds).padStart(4)} | Size: ${sizeGib.toFixed(2).padStart(6)} GB | Source: ${String(item.engineName ?? "Unknown")}`,
    );
    if (index === 0) lines.push("     BEST CANDIDATE (highest seeds + size)");
    lines.push("");
  });
  lines.push("=".repeat(80));
  lines.push("Best candidate can be added to qBittorrent and validated.");
  lines.push(
    "After 5 seconds, file format should be checked (PDF/EPUB/MOBI required).",
  );
  lines.push(
    "If the format is invalid, the validation command automatically removes the torrent.",
  );
  return lines.join("\n");
}

function compact(
  result: TorrentResult | null | undefined,
): Record<string, unknown> | null {
  return result
    ? {
        fileName: result.fileName,
        nbSeeders: result.nbSeeders,
        fileSize: result.fileSize,
        fileUrl: result.fileUrl,
        engineName: result.engineName,
      }
    : null;
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }
  const files = await expandPatterns(values(args, "--files", true));
  const query = value(args, "--query") ?? "";
  if (!query) throw new Error("--query is required.");
  const results = await loadSearchResults(files);
  if (results.length === 0) {
    console.error(
      "No results loaded from any provided file - check that files exist and are non-empty",
    );
    return;
  }
  const analysis = analyzeBooks(results, query);
  if (hasFlag(args, "--json")) {
    const candidates = (analysis.top_candidates ?? []) as TorrentResult[];
    console.log(
      JSON.stringify(
        {
          content_type: analysis.content_type,
          total_valid_results: analysis.total_valid_results ?? 0,
          best_candidate: compact(
            analysis.best_candidate as TorrentResult | null,
          ),
          top_10: candidates.map(compact),
        },
        null,
        2,
      ),
    );
  } else console.log(formatBookOutput(analysis));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
