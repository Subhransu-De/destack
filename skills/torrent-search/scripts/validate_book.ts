import {
  errorMessage,
  hasFlag,
  integerValue,
  parseArgs,
  qbtJson,
  qbtPost,
  value,
} from "./common";

interface TorrentFile {
  name?: string;
  [key: string]: unknown;
}

interface ValidationResult {
  hash: string;
  valid: boolean;
  reason: string;
  deleted: boolean;
  valid_files?: string[];
  files_found?: string[];
  total_files?: number;
}

function usage(): void {
  console.log(
    "Usage: bun run validate_book.ts --hash <infohash> [--wait 5] [--json] [--quiet]",
  );
}

export async function getTorrentFiles(hash: string): Promise<TorrentFile[]> {
  try {
    return await qbtJson<TorrentFile[]>(
      `/torrents/files?hash=${encodeURIComponent(hash)}`,
    );
  } catch (error) {
    console.error(`Error fetching files: ${errorMessage(error)}`);
    return [];
  }
}

export function checkBookFormat(files: TorrentFile[]): {
  validFiles: string[];
  allFiles: string[];
} {
  const allFiles = files.map((file) => String(file.name ?? "").toLowerCase());
  return {
    allFiles,
    validFiles: allFiles.filter((name) => /\.(pdf|epub|mobi)$/i.test(name)),
  };
}

export async function deleteTorrent(hash: string): Promise<boolean> {
  try {
    await qbtPost("/torrents/delete", { hashes: hash, deleteFiles: "true" });
    return true;
  } catch (error) {
    console.error(`Error deleting torrent: ${errorMessage(error)}`);
    return false;
  }
}

export async function validateBook(
  hash: string,
  waitSeconds = 5,
  verbose = true,
): Promise<ValidationResult> {
  if (verbose) {
    console.log(`Validating book torrent: ${hash}`);
    console.log(`Waiting ${waitSeconds} seconds for metadata download...`);
  }
  await Bun.sleep(waitSeconds * 1_000);
  if (verbose) console.log("Fetching file list...");
  const files = await getTorrentFiles(hash);
  if (files.length === 0)
    return {
      hash,
      valid: false,
      reason: "Could not fetch file list",
      deleted: false,
    };
  const { validFiles, allFiles } = checkBookFormat(files);
  if (verbose) {
    console.log(`\nFiles in torrent (${allFiles.length}):`);
    allFiles.slice(0, 10).forEach((file) => console.log(`  - ${file}`));
    if (allFiles.length > 10)
      console.log(`  ... and ${allFiles.length - 10} more files`);
  }
  if (validFiles.length > 0) {
    if (verbose) {
      console.log("\nValid book format found.");
      validFiles.forEach((file) => console.log(`  [valid] ${file}`));
    }
    return {
      hash,
      valid: true,
      reason: "Valid book format(s) found",
      valid_files: validFiles,
      total_files: allFiles.length,
      deleted: false,
    };
  }
  if (verbose)
    console.log(
      "\nNo valid book format found (PDF/EPUB/MOBI required). Deleting torrent...",
    );
  const deleted = await deleteTorrent(hash);
  if (verbose)
    console.log(deleted ? "Torrent deleted." : "Failed to delete torrent.");
  return {
    hash,
    valid: false,
    reason: "No valid book format (PDF/EPUB/MOBI) found",
    files_found: allFiles,
    deleted,
  };
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }
  const hash = value(args, "--hash");
  if (!hash) throw new Error("--hash is required.");
  const quiet = hasFlag(args, "--quiet") || hasFlag(args, "--json");
  const result = await validateBook(
    hash,
    integerValue(args, "--wait", 5),
    !quiet,
  );
  if (hasFlag(args, "--json")) console.log(JSON.stringify(result, null, 2));
  else if (!quiet) {
    console.log(`\nValidation Result: ${result.valid ? "VALID" : "INVALID"}`);
    console.log(`Reason: ${result.reason}`);
    if (result.deleted) console.log("Action: Torrent and files were deleted");
    else if (result.valid)
      console.log(
        `Action: Ready to download (${result.total_files ?? "?"} files)`,
      );
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
