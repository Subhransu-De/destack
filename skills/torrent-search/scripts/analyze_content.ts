import {
  appendLine,
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

type Episode = [number, number];

function usage(): void {
  console.log(
    "Usage: bun run analyze_content.ts --files <json...> --query <query> [--json] [--not-found-file path]",
  );
}

export function extractSeasonEpisode(name: string): Episode | undefined {
  const match = /s(\d{1,2})e(\d{1,2})/i.exec(name);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

export function detectContentType(
  results: TorrentResult[],
): "tv_series" | "movie" {
  return results.some(
    (result) =>
      !isErrorResult(result) &&
      extractSeasonEpisode(String(result.fileName ?? "")),
  )
    ? "tv_series"
    : "movie";
}

export function scoreQuality(name: string, seeds: number): [number, number] {
  const lower = name.toLowerCase();
  let score =
    lower.includes("2160p") || lower.includes("4k")
      ? 1_000
      : lower.includes("1080p")
        ? 900
        : lower.includes("720p")
          ? 800
          : lower.includes("480p")
            ? 700
            : 500;
  if (lower.includes("web-dl") || lower.includes("atvp")) score += 100;
  else if (lower.includes("bluray") || lower.includes("blu-ray")) score += 80;
  if (
    lower.includes("atmos") ||
    lower.includes("dv ") ||
    lower.includes("dolby vision")
  )
    score += 20;
  return [score, seeds > 0 ? Math.min(seeds, 100) : 0];
}

function better(left: TorrentResult, right: TorrentResult): number {
  const leftScore = scoreQuality(
    String(left.fileName ?? ""),
    Number(left.nbSeeders ?? 0),
  );
  const rightScore = scoreQuality(
    String(right.fileName ?? ""),
    Number(right.nbSeeders ?? 0),
  );
  return leftScore[0] - rightScore[0] || leftScore[1] - rightScore[1];
}

export function analyzeTvSeries(
  results: TorrentResult[],
  query = "",
): Record<string, unknown> {
  const episodes = new Map<string, TorrentResult[]>();
  const seasons = new Map<number, Set<number>>();
  const queryWords = query
    .replace(/["']/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  for (const result of results) {
    if (isErrorResult(result)) continue;
    const name = String(result.fileName ?? "");
    const episode = extractSeasonEpisode(name);
    if (!episode) continue;
    const matches = queryWords.filter((word) =>
      name.toLowerCase().includes(word),
    ).length;
    if (queryWords.length > 0 && matches < queryWords.length - 1) continue;
    const [seasonNumber, episodeNumber] = episode;
    const key = `${seasonNumber}:${episodeNumber}`;
    episodes.set(key, [...(episodes.get(key) ?? []), result]);
    const seasonEpisodes = seasons.get(seasonNumber) ?? new Set<number>();
    seasonEpisodes.add(episodeNumber);
    seasons.set(seasonNumber, seasonEpisodes);
  }
  const sortedEpisodes = [...episodes.keys()]
    .map((key) => key.split(":").map(Number) as Episode)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const topQuality: Record<string, TorrentResult> = {};
  for (const [season, episode] of sortedEpisodes) {
    const key = `${season}:${episode}`;
    topQuality[
      `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
    ] = (episodes.get(key) ?? []).reduce((best, item) =>
      better(item, best) > 0 ? item : best,
    );
  }
  return {
    content_type: "tv_series",
    seasons: Object.fromEntries(
      [...seasons]
        .sort(([left], [right]) => left - right)
        .map(([season, found]) => [season, found.size]),
    ),
    episodes: sortedEpisodes,
    top_quality_per_episode: topQuality,
    total_episodes: episodes.size,
  };
}

function resolution(name: string): "4k" | "1080p" | undefined {
  const lower = name.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k")) return "4k";
  if (lower.includes("1080p")) return "1080p";
  return undefined;
}

function bestOf(results: TorrentResult[]): TorrentResult | null {
  return results.length === 0
    ? null
    : results.reduce((best, item) => (better(item, best) > 0 ? item : best));
}

function packed(result: TorrentResult | null): Record<string, unknown> | null {
  return result
    ? {
        fileName: result.fileName,
        nbSeeders: result.nbSeeders ?? -1,
        fileUrl: result.fileUrl,
        fileSize: result.fileSize,
        engineName: result.engineName ?? "Unknown",
        quality_score: scoreQuality(
          String(result.fileName ?? ""),
          Number(result.nbSeeders ?? 0),
        )[0],
      }
    : null;
}

export function analyzeMovie(
  results: TorrentResult[],
): Record<string, unknown> {
  const valid = results.filter((result) => !isErrorResult(result));
  const best = bestOf(valid);
  if (!best)
    return {
      content_type: "movie",
      best_result: null,
      best_4k: null,
      best_1080p: null,
      message: "No valid results found",
    };
  return {
    content_type: "movie",
    best_result: best,
    best_4k: packed(
      bestOf(
        valid.filter(
          (item) => resolution(String(item.fileName ?? "")) === "4k",
        ),
      ),
    ),
    best_1080p: packed(
      bestOf(
        valid.filter(
          (item) => resolution(String(item.fileName ?? "")) === "1080p",
        ),
      ),
    ),
    quality_score: scoreQuality(
      String(best.fileName ?? ""),
      Number(best.nbSeeders ?? 0),
    )[0],
    seed_count: best.nbSeeders ?? -1,
  };
}

export function formatTvOutput(analysis: Record<string, unknown>): string {
  const lines = ["=".repeat(70), "TV SERIES FOUND", "=".repeat(70)];
  const seasons = analysis.seasons as Record<string, number>;
  lines.push(`\nSeasons detected: ${Object.keys(seasons).length}`);
  for (const [season, count] of Object.entries(seasons))
    lines.push(`  Season ${season}: ${count} episodes`);
  lines.push(`\nTotal episodes available: ${analysis.total_episodes}`);
  lines.push("\nEpisodes found:");
  const top = analysis.top_quality_per_episode as Record<string, TorrentResult>;
  for (const key of Object.keys(top).sort()) {
    const item = top[key] as TorrentResult;
    lines.push(
      `  ${key} | Seeds: ${String(item.nbSeeders ?? -1).padStart(3)} | ${String(item.fileName ?? "").slice(0, 50)}`,
    );
  }
  lines.push(`\n${"=".repeat(70)}`);
  lines.push(
    `Top quality selected for all ${Object.keys(top).length} episodes.`,
  );
  lines.push("Ready to add to qBittorrent.");
  return lines.join("\n");
}

export function formatMovieOutput(analysis: Record<string, unknown>): string {
  const lines = ["=".repeat(70), "MOVIE FOUND", "=".repeat(70)];
  const best = analysis.best_result as TorrentResult | null;
  if (!best)
    return [...lines, String(analysis.message ?? "No results found")].join(
      "\n",
    );
  const render = (
    label: string,
    item: Record<string, unknown> | null,
  ): void => {
    if (!item) {
      lines.push(`\n[${label}] No result found at this resolution.`);
      return;
    }
    lines.push(`\n[${label}]`);
    lines.push(`  Title:  ${String(item.fileName ?? "")}`);
    lines.push(`  Seeds:  ${String(item.nbSeeders ?? -1)}`);
    lines.push(
      `  Size:   ${(Number(item.fileSize ?? 0) / 1024 ** 3).toFixed(2)} GB`,
    );
    lines.push(`  Source: ${String(item.engineName ?? "Unknown")}`);
  };
  render("4K (2160p)", analysis.best_4k as Record<string, unknown> | null);
  render("1080p", analysis.best_1080p as Record<string, unknown> | null);
  if (!analysis.best_4k && !analysis.best_1080p) render("Best available", best);
  lines.push(`\n${"=".repeat(70)}`);
  lines.push(
    "Best 4K and 1080p options shown above. Pick one to add to qBittorrent.",
  );
  return lines.join("\n");
}

async function recordNotFound(
  path: string | undefined,
  query: string,
): Promise<void> {
  if (!path) return;
  try {
    await appendLine(path, query);
  } catch (error) {
    console.error(
      `Warning: Could not write to not-found file: ${errorMessage(error)}`,
    );
  }
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
  const notFoundFile = value(args, "--not-found-file");
  const results = await loadSearchResults(files);
  if (results.length === 0) {
    await recordNotFound(notFoundFile, query);
    console.error(
      "No results loaded from any provided file - check that files exist and are non-empty",
    );
    return;
  }
  const contentType = detectContentType(results);
  const analysis =
    contentType === "tv_series"
      ? analyzeTvSeries(results, query)
      : analyzeMovie(results);
  if (contentType === "movie" && !analysis.best_result)
    await recordNotFound(notFoundFile, query);
  console.log(
    hasFlag(args, "--json")
      ? JSON.stringify(analysis, null, 2)
      : contentType === "tv_series"
        ? formatTvOutput(analysis)
        : formatMovieOutput(analysis),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
