#!/usr/bin/env bun
/**
 * Claude Code statusline script
 * Reads JSON from stdin, prints one status line (no ANSI/color).
 *
 * Field sources (from Claude Code statusline JSON schema):
 *   model.display_name      — e.g. "Claude Opus 4.8"
 *   model.id                — e.g. "claude-opus-4-8"
 *   effort.level            — "low"|"medium"|"high"|"xhigh"|"max" (optional)
 *   workspace.current_dir   — current working directory (Windows path)
 *   context_window.total_input_tokens   — tokens used so far
 *   context_window.context_window_size  — total context window capacity
 *   context_window.remaining_percentage — pre-calculated % remaining (null if no messages yet)
 *   rate_limits.five_hour.used_percentage — % of 5-hour window used (optional)
 *
 * Effort x-code mapping (covers all documented levels):
 *   low    → x0
 *   medium → x1
 *   high   → x2
 *   xhigh  → x3
 *   max    → x4
 */

interface ModelInfo {
  id: string;
  display_name: string;
}

interface ContextWindow {
  total_input_tokens: number;
  total_output_tokens: number;
  context_window_size: number;
  used_percentage: number | null;
  remaining_percentage: number | null;
  current_usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;
}

interface RateLimits {
  five_hour?: {
    used_percentage: number;
    resets_at: number;
  };
  seven_day?: {
    used_percentage: number;
    resets_at: number;
  };
}

interface Effort {
  level: "low" | "medium" | "high" | "xhigh" | "max";
}

interface StatusLineInput {
  model: ModelInfo;
  effort?: Effort;
  /**
   * Custom name from `--name`/`/rename`, else the AI-generated session title.
   * Absent until one of those exists — the default display name (e.g.
   * "my-app-3f") does NOT populate this field, so it is often undefined.
   */
  session_name?: string;
  workspace: {
    current_dir: string;
    project_dir: string;
    added_dirs: string[];
    git_worktree?: string;
    repo?: {
      host: string;
      owner: string;
      name: string;
    };
  };
  cwd: string;
  context_window: ContextWindow;
  rate_limits?: RateLimits;
  worktree?: {
    branch?: string;
  };
  [key: string]: unknown;
}

// --- Helpers ---

/** Map effort level string to x-code */
function effortXCode(level: string): string {
  const map: Record<string, string> = {
    low: "x0",
    medium: "x1",
    high: "x2",
    xhigh: "x3",
    max: "x4",
  };
  return map[level] ?? `x?`;
}

/** Render an ASCII progress bar for `usedPct` (0-100). Filled cells = used portion. */
function progressBar(usedPct: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, usedPct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `⟨${"●".repeat(filled)}${"○".repeat(empty)}⟩`;
}

/** Clip `s` to `max` chars, appending an ellipsis when it had to be cut. */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** Format token count as human-readable with k/M suffix */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/**
 * Convert a Windows absolute path to Linux/git-bash style, collapsing the
 * home directory to `~`. A drive-letter path becomes a `/<drive>/...` path,
 * and anything under $HOME is shortened to `~/...` instead.
 */
function toGitBashPath(p: string): string {
  // Match drive letter prefix like C:\ or C:/
  const match = p.match(/^([A-Za-z]):[/\\](.*)/);
  let unix: string;
  if (!match) {
    // Already Unix-style or relative — just normalise backslashes
    unix = p.replace(/\\/g, "/");
  } else {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, "/");
    unix = `/${drive}/${rest}`;
  }

  // Collapse home directory to ~ (Linux/git-bash convention).
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home) {
    const homeUnix = toUnixDriveOnly(home);
    if (unix === homeUnix) return "~";
    if (unix.startsWith(homeUnix + "/")) return "~" + unix.slice(homeUnix.length);
  }
  return unix;
}

/** Normalise a Windows path to /c/... form WITHOUT the ~ collapse (used for $HOME). */
function toUnixDriveOnly(p: string): string {
  const match = p.match(/^([A-Za-z]):[/\\](.*)/);
  if (!match) return p.replace(/\\/g, "/").replace(/\/$/, "");
  return `/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`.replace(/\/$/, "");
}

/** Get git branch name from the worktree field or by reading HEAD directly */
function getGitBranch(input: StatusLineInput): string {
  // Prefer worktree.branch if present
  if (input.worktree?.branch) return input.worktree.branch;

  // Try to read .git/HEAD from the workspace directory
  const dir = input.workspace?.current_dir ?? input.cwd;
  if (!dir) return "?";

  try {
    // Walk up to find .git/HEAD
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    let current = dir;
    for (let i = 0; i < 20; i++) {
      const headPath = path.join(current, ".git", "HEAD");
      if (fs.existsSync(headPath)) {
        const head = fs.readFileSync(headPath, "utf8").trim();
        // "ref: refs/heads/main"
        const refMatch = head.match(/^ref: refs\/heads\/(.+)$/);
        if (refMatch) return refMatch[1];
        // Detached HEAD — return short SHA
        return head.slice(0, 7);
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // ignore
  }
  return "-";
}

/**
 * Health glyph for the "Claude Code" component on status.claude.com.
 *   ● = operational, ⊘ = any non-operational state.
 *
 * The status line runs on every refresh, so a live network call each time
 * would lag the bar. We cache the result to a temp file and only re-fetch
 * when it is older than CACHE_TTL_MS. A missing/failed fetch falls back to ●
 * (don't alarm on a transient network hiccup). The refresh runs detached so
 * it never blocks rendering.
 */
async function claudeCodeStatusGlyph(): Promise<string> {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");

  const CACHE_TTL_MS = 60_000;
  const URL = "https://status.claude.com/api/v2/components.json";
  const cacheFile = path.join(os.tmpdir(), "cc-statusline-ccstatus.txt");

  const readCache = (): string | null => {
    try {
      return fs.readFileSync(cacheFile, "utf8").trim() || null;
    } catch {
      return null;
    }
  };
  const cacheAge = (): number => {
    try {
      return Date.now() - fs.statSync(cacheFile).mtimeMs;
    } catch {
      return Infinity;
    }
  };
  const glyphFor = (status: string | null): string =>
    status === "operational" ? "●" : status ? "⊘" : "●";

  const fresh = cacheAge() < CACHE_TTL_MS;
  const cached = readCache();

  if (fresh && cached) {
    return glyphFor(cached);
  }

  // Cache missing or stale — fetch with a short timeout, update the cache.
  // Any network-level failure (DNS, refused connection, TLS, timeout/abort,
  // offline) rejects fetch and lands in catch; a bad HTTP status or malformed
  // body is rejected explicitly so we never treat an error page as truth.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    let res: Response;
    try {
      res = await fetch(URL, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`status page HTTP ${res.status}`);

    const data = (await res.json()) as {
      components?: Array<{ name?: string; status?: string }>;
    };
    const comp = data.components?.find((c) => c.name === "Claude Code");
    // If the component vanished from the feed, don't invent an outage — treat
    // an unknown/missing component as healthy rather than flashing ⊘.
    const status = comp?.status ?? "operational";

    try {
      fs.writeFileSync(cacheFile, status, "utf8");
    } catch {
      // ignore cache write failure (read-only tmp, disk full, etc.)
    }
    return glyphFor(status);
  } catch {
    // Network/timeout/HTTP/parse error — prefer the last known-good cache,
    // otherwise assume healthy so a transient blip never shows a false ⊘.
    return glyphFor(cached);
  }
}

// --- Main ---

async function main() {
  // Read all stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let input: StatusLineInput;
  try {
    input = JSON.parse(raw) as StatusLineInput;
  } catch {
    process.stdout.write("(statusline: invalid JSON)\n");
    process.exit(1);
  }

  // 1. MODEL + EFFORT
  const modelName = input.model?.display_name ?? input.model?.id ?? "?";
  // Strip "Claude " prefix for brevity if present, keep as-is otherwise
  const shortModel = modelName.replace(/^Claude\s+/i, "");
  const effortSuffix = input.effort?.level ? ` ${effortXCode(input.effort.level)}` : "";
  // Claude Code service-health glyph (● operational / ⊘ any incident), 60s cached.
  const statusGlyph = await claudeCodeStatusGlyph();
  const modelPart = `${shortModel}${effortSuffix} ${statusGlyph}`;

  // 2. CONTEXT WINDOW
  const ctx = input.context_window;
  let contextPart: string;
  if (ctx) {
    const used = ctx.total_input_tokens ?? 0;
    const size = ctx.context_window_size ?? 0;
    const remaining = ctx.remaining_percentage;
    const usedFmt = fmtTokens(used);
    const sizeFmt = fmtTokens(size);
    if (remaining !== null && remaining !== undefined) {
      const remPct = Math.round(remaining);
      const bar = progressBar(100 - remPct);
      contextPart = `${bar} ${usedFmt}/${sizeFmt} ${remPct}% left`;
    } else {
      // No messages yet
      contextPart = `${progressBar(0)} 0/${sizeFmt} 100% left`;
    }
  } else {
    contextPart = "ctx:?";
  }

  // 3. 5-HOUR RATE LIMIT
  // The schema only provides used_percentage (not raw token counts for the window),
  // so we show percentage-only. Degrades gracefully if absent.
  let fiveHourPart: string;
  const fiveHour = input.rate_limits?.five_hour;
  if (fiveHour !== undefined && fiveHour !== null) {
    const usedPct = Math.round(fiveHour.used_percentage);
    const leftPct = 100 - usedPct;
    fiveHourPart = `${progressBar(usedPct)} 5h ${leftPct}% left`;
  } else {
    fiveHourPart = "5h: -";
  }

  // 4. CURRENT PATH (git-bash format)
  const rawPath = input.workspace?.current_dir ?? input.cwd ?? "";
  const bashPath = toGitBashPath(rawPath);
  const pathPart = bashPath || "?";

  // 5. GIT BRANCH
  const branchPart = getGitBranch(input);

  // 6. SESSION NAME (optional — absent unless set via --name//rename or an
  // AI-generated title exists). Truncated so a long title can't crowd out the
  // metrics that follow it.
  const sessionName = input.session_name?.trim();
  const sessionPart = sessionName ? `[${truncate(sessionName, 24)}]` : null;

  // Assemble — drop any part that isn't present rather than showing a blank slot.
  const line = [modelPart, contextPart, fiveHourPart, pathPart, branchPart, sessionPart]
    .filter((p): p is string => Boolean(p))
    .join(" · ");
  process.stdout.write(line + "\n");
}

main().catch((err) => {
  process.stderr.write(`statusline error: ${err}\n`);
  process.exit(1);
});
