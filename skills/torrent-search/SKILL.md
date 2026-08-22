---
name: torrent-search
description: Use this to search for torrents in qBittorrent and add them to downloads.
user-invocable: true
---

# Torrent Search

## Connection

- **Base URL:** `http://localhost:2200` by default; override with `QBT_BASE_URL`
- **Auth:** None (open, no login)
- **Session:** Managed automatically by `search_start.ts` — no manual session initialization needed

---

## Scripts Reference

All scripts live in `scripts/` relative to this skill and must be run with Bun.

| Script | Purpose |
|--------|---------|
| `search_start.ts` | Start one or more searches. Handles session initialization, 5-job concurrency cap, and retries. |
| `search_fetch.ts` | Poll job IDs until stopped, paginate results, and write JSON files. Fails fast on invalid IDs. |
| `analyze_content.ts` | Detect TV versus movie results, extract seasons and episodes, and pick the top quality per episode. |
| `analyze_books.ts` | Filter, relevance-score, and rank book results by seeds and size. Returns the top 10 candidates. |
| `parse_results.ts` | Deduplicate, tag, and rank general results by seed count and media quality. |
| `select_and_add.ts` | Select results interactively or with `--select`/`--all`, then add them to qBittorrent. |
| `validate_book.ts` | After adding a book torrent, wait for metadata, check for PDF/EPUB/MOBI, and delete it with its files if invalid. |

---

## Full Workflow

### IMDb input

If the user gives an IMDb link or title ID, run the `get-imdb` skill before you start a torrent search.

Use the returned title variants and release year for the search queries. Do not invent unavailable metadata.

If `tv_inventory.complete` is `false`, do not claim that the search covers all released episodes.

### Step 1 — Start searches

**Query strategy:**
- **Movies/TV:** 3–4 variants — `"Title Year"`, `"Title Year 1080p"`, `"Title Year 4K"`, alternate title if known
- **Books:** 2 variants — `"Title Author"` and `"Title"` alone (quality labels irrelevant for books)

```bash
# Capture all search IDs (pass as many queries as needed — cap handled automatically)
IDS=$(bun run scripts/search_start.ts \
  --query "QUERY1" "QUERY2" "QUERY3" \
  --json 2>/dev/null \
  | bun -e "const x = await new Response(Bun.stdin.stream()).json(); console.log(x.map(v => v.id).join(' '))")
```

Output: JSON array of `{"query": "...", "id": 123456789}`. Always use `2>/dev/null` to suppress progress lines from mixing into captured output.

### Step 2 — Fetch results

```bash
# Blocks until all jobs stopped (~2–5 min), writes result files, returns paths
PATHS=$(bun run scripts/search_fetch.ts \
  --ids $IDS --json 2>/dev/null \
  | bun -e "const x = await new Response(Bun.stdin.stream()).json(); console.log(x.filter(v => v.success).map(v => v.path).join(' '))")
```

Output: JSON array of `{"id": 123, "success": true, "results": 412, "path": "C:\\...\\qbt_search_123.json"}`. `$PATHS` is a space-separated list of result files ready for the analyze scripts.

### Step 3 — Detect content type and analyze

**For TV/Movies:**
```bash
bun run scripts/analyze_content.ts \
  --files $PATHS --query "SEARCH TERM" \
  --not-found-file "PATH/TO/movies_series_not_found.txt"
```

Output includes: `content_type` (tv_series/movie), `seasons`, `episodes`, `top_quality_per_episode` (TV) or `best_4k` + `best_1080p` (movie, with `best_result` kept as the overall best for fallback).

**Not-found handling:** When `--not-found-file` is provided, any search that yields no valid results automatically appends the query to that file. This is useful for tracking titles that were searched but not available in any indexer.

**For Books:**
```bash
bun run scripts/analyze_books.ts \
  --files $PATHS --query "SEARCH TERM"
```

Output includes: `content_type` (book), `best_candidate`, `top_candidates` (top 10), `total_valid_results`. Results are filtered by relevance to query (≥ half keywords must match) before ranking by seeds + size.

### Step 4 — Present results to user

**TV Series:**
- List seasons found and episode count per season
- List all available episodes (S01E01, S01E02 …)
- Show auto-selected top quality version for each episode
- Offer to add all top-quality episodes at once

**Movie:**
- Show TWO options: the best **4K (2160p)** result and the best **1080p** result (each = highest seeds within its tier)
- For each option display: title, seed count, size, source
- If only one tier is available, show that one; if neither 4K nor 1080p matched, fall back to the overall best result
- Ask the user which one to add (default to 4K if they don't specify), then add to qBittorrent

**Books:**
- Show top 10 candidates ranked by seeds then size
- Highlight best candidate (#1)
- Display seeds, file size, source for each

### Step 5 — Add to qBittorrent

Use the selection command. It displays matching results and asks for comma-separated indexes. For non-interactive use, pass `--select <index...>` or the explicit `--all` flag:

```bash
bun run scripts/select_and_add.ts --files $PATHS --query "SEARCH TERM"
```

### Step 6 (Books only) — Validate format

Immediately after adding a book torrent, run the validation script with the torrent's infohash:

```bash
bun run scripts/validate_book.ts \
  --hash INFOHASH --wait 5
```

The script waits 5 seconds for metadata, checks the file list for PDF/EPUB/MOBI, and **auto-deletes the torrent** if none are found. Reports back with status.

Get the infohash from the selected magnet URL's `btih:` segment or the qBittorrent torrent list.

---

## Content Type Detection

`analyze_content.ts` auto-detects TV versus movie by looking for `SxxExx` patterns in result filenames. If any match, it treats the content as a TV series; otherwise it treats it as a movie.

`analyze_books.ts` is called explicitly when the user request is for a book. It does **not** detect automatically; the agent decides based on the user's query.

---

## Error Filtering

All analyze scripts automatically exclude:
- Names containing: `[Error]:`, `API Key`, `not authorized`, `nCore error:`, `Jackett:`, `Prowlarr:`, `Empty cookies`, `connection error`, `Unexpected page`
- `nbSeeders == -1`
- `nbSeeders == 100` AND `fileSize == 1099511627776` (1 TiB fake placeholder)

Plugins that commonly fail without credentials (expect errors from these): `IPTorrents`, `nCore`, `Jackett`, `Prowlarr`, `redacted.ch`, `gazellegames`, `SpeedApp`, `FileList`, `TorrentLeech`, `LostFilm`, `Rutracker`, `Kinozal`, `Rutor`, `nnmclub`

---

## Automatic Behaviour Summary

1. **TV Series** → list all seasons + episode counts → show all episodes → auto-select top quality per episode → offer batch add
2. **Movie** → show best 4K and best 1080p options side by side (highest seeds within each tier) → ask which to add (default 4K). If no results: append to not-found file (if `--not-found-file` specified)
3. **Book** → filter by relevance → rank by seeds + size → add best → validate format → delete if not PDF/EPUB/MOBI
4. **Quality ranking:** 4K (2160p) > 1080p > 720p > 480p → tie-break by seeds
5. **Source preference:** WEB-DL > BluRay. Bonus points for Atmos/Dolby Vision
6. **Book relevance:** ≥ half of query keywords must appear in result name (stopwords excluded)
7. **Not-found file:** When analyzing, pass `--not-found-file <path>` to automatically log titles with zero results to a file

---

## Platform Notes

- Always use `bun run` for the TypeScript entrypoints.
- The qBittorrent base URL can be changed with `QBT_BASE_URL`; do not edit the scripts for a different port.
- The cookie file defaults to the operating system temporary directory and can be changed with `QBT_COOKIE_FILE`.
- Prefer `--json` for machine-readable output and keep progress messages on stderr.

---

## API Reference

See `references/api_reference.md` for the full endpoint catalogue (app, torrents, search, transfer, sync).

Key endpoints used directly (not covered by scripts):
- `POST /api/v2/torrents/add` — Add torrent via magnet URL
- `GET /api/v2/torrents/info` — List torrents and check download state
- `GET /api/v2/torrents/files?hash=HASH` — Get file list (used by `validate_book.ts`)
- `POST /api/v2/torrents/delete` — Delete torrent with `hashes=HASH&deleteFiles=true`
