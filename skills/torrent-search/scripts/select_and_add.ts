import { createInterface } from "node:readline/promises";
import {
  errorMessage,
  expandPatterns,
  formatSize,
  hasFlag,
  isErrorResult,
  loadSearchResults,
  parseArgs,
  qbtPost,
  TorrentResult,
  value,
  values,
} from "./common";

interface SelectableResult {
  name: string;
  url: string;
  seeds: number;
  size: number;
  hash: string;
}

function usage(): void {
  console.log(
    "Usage: bun run select_and_add.ts --files <json...> --query <query> [--select <index...> | --all]",
  );
}

export function selectableResults(
  results: TorrentResult[],
  query: string,
): SelectableResult[] {
  const keywords = query
    .replaceAll(".", " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const seen = new Map<string, SelectableResult>();
  for (const result of results) {
    if (isErrorResult(result)) continue;
    const name = String(result.fileName ?? "").trim();
    const url = String(result.fileUrl ?? "");
    if (
      !name ||
      !url.startsWith("magnet:") ||
      !keywords.some((word) => name.toLowerCase().includes(word))
    )
      continue;
    const hash = /btih:([a-f0-9]{40})/i.exec(url)?.[1]?.toUpperCase();
    if (!hash) continue;
    const candidate = {
      name,
      url,
      hash,
      seeds: Number(result.nbSeeders ?? 0),
      size: Number(result.fileSize ?? 0),
    };
    if (!seen.has(hash) || (seen.get(hash)?.seeds ?? -1) < candidate.seeds)
      seen.set(hash, candidate);
  }
  return [...seen.values()].sort((left, right) => right.seeds - left.seeds);
}

export async function addToQbittorrent(url: string): Promise<boolean> {
  try {
    return (await qbtPost("/torrents/add", { urls: url })) === "Ok.";
  } catch {
    return false;
  }
}

async function choose(
  results: SelectableResult[],
  args: ReturnType<typeof parseArgs>,
): Promise<SelectableResult[]> {
  if (hasFlag(args, "--all")) return results;
  const explicit = values(args, "--select").map(Number);
  if (explicit.length > 0) {
    if (
      explicit.some(
        (index) =>
          !Number.isInteger(index) || index < 1 || index > results.length,
      )
    )
      throw new Error("--select indexes must refer to displayed results.");
    return [...new Set(explicit)].map(
      (index) => results[index - 1] as SelectableResult,
    );
  }
  if (!process.stdin.isTTY)
    throw new Error(
      "Interactive selection requires a terminal. Use --select <index...> or --all.",
    );
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (
      await input.question(
        "Select indexes separated by commas, or 'all' (Enter cancels): ",
      )
    ).trim();
    if (!answer) return [];
    if (answer.toLowerCase() === "all") return results;
    const indexes = answer
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (
      indexes.some(
        (index) =>
          !Number.isInteger(index) || index < 1 || index > results.length,
      )
    )
      throw new Error("Selection contains an invalid index.");
    return [...new Set(indexes)].map(
      (index) => results[index - 1] as SelectableResult,
    );
  } finally {
    input.close();
  }
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
  const results = selectableResults(await loadSearchResults(files), query);
  if (results.length === 0) {
    console.log("No matching results found.");
    return;
  }
  results.forEach((result, index) =>
    console.log(
      `${String(index + 1).padStart(2)}. [${String(result.seeds).padStart(4)} seeds] ${formatSize(result.size).padStart(10)}   ${result.name}`,
    ),
  );
  const selected = await choose(results, args);
  if (selected.length === 0) {
    console.log("Nothing selected.");
    return;
  }
  console.log(`\nAdding ${selected.length} torrent(s)...\n`);
  let added = 0;
  for (const result of selected) {
    const success = await addToQbittorrent(result.url);
    console.log(`  [${success ? "Added " : "Failed"}] ${result.name}`);
    if (success) added += 1;
  }
  console.log(
    `\nDone. Added: ${added} | Failed/Duplicate: ${selected.length - added}`,
  );
  if (added !== selected.length) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
