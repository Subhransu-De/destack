import { join } from "node:path";
import {
  errorMessage,
  hasFlag,
  integerValue,
  parseArgs,
  qbtJson,
  tempDir,
  value,
  values,
  writeJson,
} from "./common";

interface SearchStatus {
  id: number;
  status: string;
}

interface SearchPage {
  results?: unknown[];
  total?: number;
}

const pollIntervalMs = 15_000;
const fetchLimit = 500;

function usage(): void {
  console.log(
    "Usage: bun run search_fetch.ts --ids <id...> [--out file] [--outdir dir] [--timeout 600] [--json]",
  );
}

export async function getStatuses(ids: number[]): Promise<Map<number, string>> {
  try {
    const jobs = await qbtJson<SearchStatus[]>("/search/status");
    const byId = new Map(jobs.map((job) => [job.id, job.status]));
    return new Map(ids.map((id) => [id, byId.get(id) ?? "Unknown"]));
  } catch (error) {
    console.error(`  [warn] Status poll failed: ${errorMessage(error)}`);
    return new Map(ids.map((id) => [id, "Unknown"]));
  }
}

export async function waitUntilStopped(
  ids: number[],
  timeoutSeconds: number,
): Promise<Map<number, boolean>> {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  const pending = new Set(ids);
  const completed = new Map<number, boolean>();
  const unknownStrikes = new Map(ids.map((id) => [id, 0]));
  console.error(
    `  [poll] Waiting for ${ids.length} search job(s): ${ids.join(", ")}`,
  );

  while (pending.size > 0 && Date.now() < deadline) {
    const statuses = await getStatuses([...pending]);
    for (const [id, status] of statuses) {
      if (status.toLowerCase() === "stopped") {
        pending.delete(id);
        completed.set(id, true);
        console.error(`  [done] Job ${id} stopped`);
      } else if (status === "Unknown") {
        const strikes = (unknownStrikes.get(id) ?? 0) + 1;
        unknownStrikes.set(id, strikes);
        if (strikes >= 2) {
          pending.delete(id);
          completed.set(id, false);
          console.error(
            `  [error] Job ${id} not found in qBittorrent - invalid or expired ID`,
          );
        }
      } else {
        unknownStrikes.set(id, 0);
      }
    }
    if (pending.size > 0) {
      const statusText = [...pending]
        .sort((a, b) => a - b)
        .map((id) => `${id}:${statuses.get(id) ?? "Unknown"}`)
        .join(", ");
      console.error(
        `  [poll] Still running: ${statusText} - sleeping ${pollIntervalMs / 1_000}s`,
      );
      await Bun.sleep(pollIntervalMs);
    }
  }

  for (const id of pending) {
    completed.set(id, false);
    console.error(
      `  [timeout] Job ${id} did not stop within ${timeoutSeconds}s`,
    );
  }
  return completed;
}

export async function fetchResults(
  jobId: number,
  outPath: string,
): Promise<[boolean, number]> {
  const allResults: unknown[] = [];
  for (let offset = 0; ; offset += fetchLimit) {
    try {
      const page = await qbtJson<SearchPage>(
        `/search/results?id=${jobId}&limit=${fetchLimit}&offset=${offset}`,
      );
      const batch = Array.isArray(page.results) ? page.results : [];
      const total = Number(page.total ?? 0);
      allResults.push(...batch);
      if (allResults.length >= total || batch.length < fetchLimit) break;
    } catch (error) {
      console.error(
        `  [error] Fetch failed for job ${jobId} offset ${offset}: ${errorMessage(error)}`,
      );
      return [false, 0];
    }
  }
  try {
    const size = await writeJson(outPath, {
      results: allResults,
      total: allResults.length,
    });
    if (size === 0) throw new Error("output file is empty");
    console.error(
      `  [ok] Job ${jobId} -> ${allResults.length} results -> ${outPath} (${size} bytes)`,
    );
    return [true, allResults.length];
  } catch (error) {
    console.error(
      `  [error] Could not write ${outPath}: ${errorMessage(error)}`,
    );
    return [false, 0];
  }
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }
  const ids = values(args, "--ids", true).map((raw) => Number(raw));
  if (ids.some((id) => !Number.isInteger(id)))
    throw new Error("--ids values must be integers.");
  const out = value(args, "--out");
  const outDir = value(args, "--outdir", tempDir) as string;
  const timeout = integerValue(args, "--timeout", 600);
  const completed = await waitUntilStopped(ids, timeout);
  const summary: Array<Record<string, unknown>> = [];
  let failed = false;

  for (const id of ids) {
    if (!completed.get(id)) {
      summary.push({
        id,
        success: false,
        reason: "timeout_or_invalid",
        results: 0,
        path: null,
      });
      failed = true;
      continue;
    }
    const path =
      out && ids.length === 1 ? out : join(outDir, `qbt_search_${id}.json`);
    const [success, count] = await fetchResults(id, path);
    summary.push({
      id,
      success,
      reason: success ? "ok" : "fetch_error",
      results: count,
      path: success ? path : null,
    });
    failed ||= !success;
  }

  if (hasFlag(args, "--json")) console.log(JSON.stringify(summary, null, 2));
  else
    for (const item of summary) {
      if (item.success) console.log(item.path);
      else console.error(`FAILED:${item.id}:${item.reason}`);
    }
  if (failed) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
