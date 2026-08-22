import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type PlatformName = "win32" | "linux" | "darwin" | string;

export interface DiscoveryEnvironment {
  [key: string]: string | undefined;
  QBT_BASE_URL?: string;
  APPDATA?: string;
  LOCALAPPDATA?: string;
  XDG_CONFIG_HOME?: string;
  XDG_DATA_HOME?: string;
  HOME?: string;
}

export interface ConnectionCandidate {
  baseUrl: string;
  host: string;
  port: number;
  protocol: "http:" | "https:";
  source: string;
  configPath?: string;
  engineDirectory?: string;
  logDirectory?: string;
}

export interface SearchPlanItem {
  plugin: string;
  query: string;
  category?: string;
}

export interface SearchRunResult {
  plugin: string;
  query: string;
  category: string;
  jobId?: number;
  status: "stopped" | "timed_out" | "error";
  elapsedMs: number;
  total: number;
  sample: Array<Record<string, unknown>>;
  error?: string;
}

export interface SearchRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  pollMs?: number;
  sampleLimit?: number;
  keepJobs?: boolean;
}

export interface PluginRecord {
  name: string;
  fullName: string;
  url: string;
  enabled: boolean;
  supportedCategories?: string[];
  version?: string;
}

export interface SearchStatusRecord {
  id: number;
  status: string;
  total?: number;
}

export interface SearchResultsResponse {
  results: Array<Record<string, unknown>>;
  status: string;
  total: number;
}

export function parseIni(text: string): Map<string, string> {
  const values = new Map<string, string>();
  let section = "";
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1].trim();
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    values.set(`${section}/${key}`, value);
  }
  return values;
}

export function parseBoolean(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

export function normalizeBaseUrl(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const url = new URL(withProtocol);
  if (!url.hostname || !url.port) {
    throw new Error("The qBittorrent base URL must include an explicit port.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The qBittorrent base URL must use HTTP or HTTPS.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function localHost(address: string | undefined): string {
  const candidate = (address ?? "").trim();
  if (
    !candidate ||
    candidate === "*" ||
    candidate === "0.0.0.0" ||
    candidate === "::" ||
    candidate === "[::]"
  ) {
    return "127.0.0.1";
  }
  return candidate.replace(/^\[(.*)]$/, "$1");
}

export function candidateFromConfig(
  text: string,
  configPath: string,
  paths: { engineDirectory?: string; logDirectory?: string } = {},
): ConnectionCandidate | null {
  const ini = parseIni(text);
  const rawPort = ini.get("Preferences/WebUI\\Port");
  if (!rawPort || !/^\d+$/.test(rawPort)) return null;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const protocol = parseBoolean(ini.get("Preferences/WebUI\\HTTPS\\Enabled"))
    ? "https:"
    : "http:";
  const host = localHost(ini.get("Preferences/WebUI\\Address"));
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return {
    baseUrl: `${protocol}//${displayHost}:${port}`,
    host,
    port,
    protocol,
    source: "qBittorrent configuration",
    configPath,
    ...paths,
  };
}

export function defaultQbtPaths(
  platform: PlatformName,
  env: DiscoveryEnvironment = process.env,
  home = env.HOME ?? homedir(),
): Array<{
  configPath: string;
  engineDirectory?: string;
  logDirectory?: string;
}> {
  if (platform === "win32") {
    const roaming = env.APPDATA;
    const local = env.LOCALAPPDATA;
    if (!roaming) return [];
    return [
      {
        configPath: join(roaming, "qBittorrent", "qBittorrent.ini"),
        engineDirectory: local
          ? join(local, "qBittorrent", "nova3", "engines")
          : undefined,
        logDirectory: local ? join(local, "qBittorrent", "logs") : undefined,
      },
    ];
  }
  if (platform === "darwin") {
    return [
      {
        configPath: join(
          home,
          "Library",
          "Preferences",
          "qBittorrent",
          "qBittorrent.ini",
        ),
        engineDirectory: join(
          home,
          "Library",
          "Application Support",
          "qBittorrent",
          "nova3",
          "engines",
        ),
        logDirectory: join(home, "Library", "Logs", "qBittorrent"),
      },
    ];
  }
  const configRoot = env.XDG_CONFIG_HOME ?? join(home, ".config");
  const dataRoot = env.XDG_DATA_HOME ?? join(home, ".local", "share");
  return [
    {
      configPath: join(configRoot, "qBittorrent", "qBittorrent.conf"),
      engineDirectory: join(dataRoot, "qBittorrent", "nova3", "engines"),
      logDirectory: join(dataRoot, "qBittorrent", "logs"),
    },
  ];
}

export async function discoverCandidates(
  options: {
    platform?: PlatformName;
    env?: DiscoveryEnvironment;
    home?: string;
    configPaths?: string[];
  } = {},
): Promise<ConnectionCandidate[]> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const candidates: ConnectionCandidate[] = [];
  if (env.QBT_BASE_URL) {
    const baseUrl = normalizeBaseUrl(env.QBT_BASE_URL);
    const url = new URL(baseUrl);
    candidates.push({
      baseUrl,
      host: url.hostname,
      port: Number(url.port),
      protocol: url.protocol as "http:" | "https:",
      source: "QBT_BASE_URL",
    });
  }

  const defaults = defaultQbtPaths(platform, env, options.home);
  const requested =
    options.configPaths?.map((configPath) => ({
      configPath: resolve(configPath),
    })) ?? defaults;
  for (const item of requested) {
    if (!existsSync(item.configPath)) continue;
    const text = await readFile(item.configPath, "utf8");
    const matchingDefault = defaults.find(
      (candidate) => resolve(candidate.configPath) === resolve(item.configPath),
    );
    const candidate = candidateFromConfig(
      text,
      resolve(item.configPath),
      matchingDefault ?? {},
    );
    if (candidate) candidates.push(candidate);
  }

  const unique = new Map<string, ConnectionCandidate>();
  for (const candidate of candidates) unique.set(candidate.baseUrl, candidate);
  return [...unique.values()];
}

function withTimeout(timeoutMs: number): AbortSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("timeoutMs must be positive");
  return AbortSignal.timeout(timeoutMs);
}

export class QbtClient {
  readonly baseUrl: string;
  private cookie = "";

  constructor(
    baseUrl: string,
    private readonly requestTimeoutMs = 15_000,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: this.baseUrl,
      },
      body: new URLSearchParams({ username, password }),
      signal: withTimeout(this.requestTimeoutMs),
    });
    const body = (await response.text()).trim();
    if (!response.ok || body !== "Ok.") {
      throw new Error(
        `qBittorrent authentication failed (${response.status} ${body || "empty response"}).`,
      );
    }
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0] ?? "";
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Referer", this.baseUrl);
    if (this.cookie) headers.set("Cookie", this.cookie);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? withTimeout(this.requestTimeoutMs),
    });
    if (!response.ok) {
      const body = (await response.text()).trim();
      throw new Error(
        `${init.method ?? "GET"} ${path} failed (${response.status}${body ? `: ${body}` : ""}).`,
      );
    }
    return response;
  }

  private async form(
    path: string,
    data: Record<string, string>,
  ): Promise<string> {
    const response = await this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data),
    });
    return response.text();
  }

  async version(): Promise<{ qBittorrent: string; webApi: string }> {
    const [appResponse, apiResponse] = await Promise.all([
      this.request("/api/v2/app/version"),
      this.request("/api/v2/app/webapiVersion"),
    ]);
    return {
      qBittorrent: (await appResponse.text()).trim(),
      webApi: (await apiResponse.text()).trim(),
    };
  }

  async plugins(): Promise<PluginRecord[]> {
    const response = await this.request("/api/v2/search/plugins");
    return response.json() as Promise<PluginRecord[]>;
  }

  async startSearch(item: SearchPlanItem): Promise<number> {
    const body = await this.form("/api/v2/search/start", {
      pattern: item.query,
      plugins: item.plugin,
      category: item.category ?? "all",
    });
    const parsed = JSON.parse(body) as { id?: number };
    if (!Number.isInteger(parsed.id))
      throw new Error("qBittorrent did not return a search job id.");
    return parsed.id as number;
  }

  async searchStatus(id: number): Promise<SearchStatusRecord> {
    const response = await this.request(
      `/api/v2/search/status?id=${encodeURIComponent(String(id))}`,
    );
    const parsed = (await response.json()) as
      SearchStatusRecord[] | SearchStatusRecord;
    const status = Array.isArray(parsed)
      ? (parsed.find((entry) => entry.id === id) ?? parsed[0])
      : parsed;
    if (!status)
      throw new Error(`Search job ${id} is absent from qBittorrent status.`);
    return status;
  }

  async searchResults(
    id: number,
    limit: number,
  ): Promise<SearchResultsResponse> {
    const response = await this.request(
      `/api/v2/search/results?id=${encodeURIComponent(String(id))}&limit=${encodeURIComponent(String(limit))}&offset=0`,
    );
    return response.json() as Promise<SearchResultsResponse>;
  }

  async stopSearch(id: number): Promise<void> {
    await this.form("/api/v2/search/stop", { id: String(id) });
  }

  async deleteSearch(id: number): Promise<void> {
    await this.form("/api/v2/search/delete", { id: String(id) });
  }

  async updatePlugins(): Promise<void> {
    await this.form("/api/v2/search/updatePlugins", {});
  }

  async installPlugins(sources: string[]): Promise<void> {
    await this.form("/api/v2/search/installPlugin", {
      sources: sources.join("|"),
    });
  }

  async uninstallPlugins(names: string[]): Promise<void> {
    await this.form("/api/v2/search/uninstallPlugin", {
      names: names.join("|"),
    });
  }

  async enablePlugins(names: string[], enable: boolean): Promise<void> {
    await this.form("/api/v2/search/enablePlugin", {
      names: names.join("|"),
      enable: String(enable),
    });
  }
}

export function validateSearchPlan(input: unknown): SearchPlanItem[] {
  if (!Array.isArray(input) || input.length === 0)
    throw new Error("Search plan must be a non-empty JSON array.");
  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object")
      throw new Error(`Search plan item ${index} must be an object.`);
    const item = entry as Record<string, unknown>;
    if (typeof item.plugin !== "string" || !item.plugin.trim())
      throw new Error(`Search plan item ${index} needs a plugin.`);
    if (typeof item.query !== "string" || !item.query.trim())
      throw new Error(`Search plan item ${index} needs a query.`);
    if (
      item.category !== undefined &&
      (typeof item.category !== "string" || !item.category.trim())
    )
      throw new Error(`Search plan item ${index} has an invalid category.`);
    return {
      plugin: item.plugin.trim(),
      query: item.query.trim(),
      category:
        typeof item.category === "string" ? item.category.trim() : "all",
    };
  });
}

export async function runSearchPlan(
  client: QbtClient,
  plan: SearchPlanItem[],
  options: SearchRunnerOptions = {},
): Promise<SearchRunResult[]> {
  const concurrency = options.concurrency ?? 5;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollMs = options.pollMs ?? 1_000;
  const sampleLimit = options.sampleLimit ?? 3;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5)
    throw new Error("Concurrency must be between 1 and 5.");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("timeoutMs must be positive.");
  if (!Number.isFinite(pollMs) || pollMs <= 0)
    throw new Error("pollMs must be positive.");

  const results = new Array<SearchRunResult>(plan.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      const item = plan[index];
      if (!item) return;
      const startedAt = performance.now();
      let jobId: number | undefined;
      let timedOut = false;
      try {
        jobId = await client.startSearch(item);
        while (true) {
          const state = await client.searchStatus(jobId);
          if (state.status.toLowerCase() !== "running") break;
          if (performance.now() - startedAt >= timeoutMs) {
            timedOut = true;
            await client.stopSearch(jobId);
            break;
          }
          await Bun.sleep(pollMs);
        }
        const response = await client.searchResults(jobId, sampleLimit);
        results[index] = {
          plugin: item.plugin,
          query: item.query,
          category: item.category ?? "all",
          jobId,
          status: timedOut ? "timed_out" : "stopped",
          elapsedMs: Math.round(performance.now() - startedAt),
          total: response.total,
          sample: response.results.slice(0, sampleLimit),
        };
      } catch (error) {
        results[index] = {
          plugin: item.plugin,
          query: item.query,
          category: item.category ?? "all",
          jobId,
          status: "error",
          elapsedMs: Math.round(performance.now() - startedAt),
          total: 0,
          sample: [],
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (jobId !== undefined && !options.keepJobs) {
          try {
            await client.deleteSearch(jobId);
          } catch (error) {
            const result = results[index];
            if (result && !result.error)
              result.error = `Search completed, but cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, plan.length) }, () => worker()),
  );
  return results;
}
