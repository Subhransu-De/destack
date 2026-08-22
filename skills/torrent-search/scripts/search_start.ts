import {
  baseUrl,
  errorMessage,
  hasFlag,
  initializeSession,
  integerValue,
  parseArgs,
  qbtJson,
  qbtPost,
  value,
  values,
} from "./common";

interface SearchStatus {
  id: number;
  status: string;
}

const maxConcurrent = 5;
const pollIntervalMs = 5_000;

function usage(): void {
  console.log(
    "Usage: bun run search_start.ts --query <query...> [--plugins all] [--category all] [--json] [--no-wait] [--cap-timeout 300]",
  );
}

export async function runningCount(): Promise<number> {
  try {
    const jobs = await qbtJson<SearchStatus[]>("/search/status");
    return jobs.filter((job) => job.status.toLowerCase() === "running").length;
  } catch {
    return 0;
  }
}

export async function waitForSlot(timeoutSeconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    const count = await runningCount();
    if (count < maxConcurrent) return true;
    console.error(
      `  [cap] ${count}/${maxConcurrent} searches running - waiting ${pollIntervalMs / 1_000}s...`,
    );
    await Bun.sleep(pollIntervalMs);
  }
  return false;
}

export async function startSearch(
  query: string,
  plugins = "all",
  category = "all",
  retries = 3,
): Promise<number | undefined> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const raw = await qbtPost("/search/start", {
        pattern: query,
        plugins,
        category,
      });
      const id = (JSON.parse(raw) as { id?: unknown }).id;
      if (Number.isInteger(id)) return Number(id);
      console.error(
        `  [warn] Empty ID for '${query}' (attempt ${attempt}/${retries})`,
      );
    } catch (error) {
      console.error(
        `  [warn] Search start error for '${query}' attempt ${attempt}: ${errorMessage(error)}`,
      );
    }
    if (attempt < retries) await Bun.sleep(3_000);
  }
  return undefined;
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }
  const queries = values(args, "--query", true);
  const plugins = value(args, "--plugins", "all") as string;
  const category = value(args, "--category", "all") as string;
  const capTimeout = integerValue(args, "--cap-timeout", 300);

  if (!(await initializeSession()))
    throw new Error(`Could not reach qBittorrent at ${baseUrl}`);

  const results: Array<{ query: string; id: number }> = [];
  const failed: string[] = [];
  for (const query of queries) {
    const slotAvailable = hasFlag(args, "--no-wait")
      ? (await runningCount()) < maxConcurrent
      : await waitForSlot(capTimeout);
    if (!slotAvailable) {
      console.error(
        `ERROR: ${hasFlag(args, "--no-wait") ? "Concurrency cap hit" : "Timed out waiting for search slot"} for '${query}'`,
      );
      failed.push(query);
      continue;
    }
    const id = await startSearch(query, plugins, category);
    if (id === undefined) {
      failed.push(query);
      console.error(`  [fail] Could not start search for '${query}'`);
    } else {
      results.push({ query, id });
      console.error(`  [ok] Started '${query}' -> id=${id}`);
    }
  }

  if (hasFlag(args, "--json")) console.log(JSON.stringify(results, null, 2));
  else for (const result of results) console.log(result.id);
  if (failed.length > 0) {
    console.error(
      `\nFailed queries (${failed.length}): ${JSON.stringify(failed)}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
