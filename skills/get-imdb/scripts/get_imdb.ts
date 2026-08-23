import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ContentType =
  "movie" | "tv_series" | "short" | "tv_episode" | "other";

interface ImageData {
  url: string;
  width: number | null;
  height: number | null;
}

interface SuggestionItem {
  id?: string;
  l?: string;
  q?: string;
  qid?: string;
  s?: string;
  tl?: string;
  y?: number;
  yr?: string;
  rank?: number;
  i?: {
    imageUrl?: string;
    width?: number;
    height?: number;
  };
}

interface PageData {
  locale: string;
  status: "ok" | "unavailable";
  http_status: number;
  error: string | null;
  name: string | null;
  alternate_name: string | null;
  description: string | null;
  genres: string[];
  duration_minutes: number | null;
  rating: { value: number; count: number | null } | null;
  content_rating: string | null;
  actors: string[];
  directors: string[];
  creators: string[];
  season_count: number | null;
  episode_count: number | null;
}

interface ReaderData {
  status: "not_used" | "ok" | "unavailable";
  http_status: number | null;
  error: string | null;
  original_title: string | null;
}

export interface ImdbMetadata {
  imdb_id: string;
  input: string;
  imdb_url: string;
  content_type: ContentType;
  imdb_media_type: string | null;
  titles: {
    primary: string;
    original: string | null;
    english: string | null;
    french: string | null;
    variants: string[];
  };
  release: {
    year: number | null;
    end_year: number | null;
    label: string | null;
  };
  runtime_minutes: number | null;
  description: string | null;
  genres: string[];
  content_rating: string | null;
  rating: { value: number; count: number | null } | null;
  cast: string[];
  directors: string[];
  creators: string[];
  image: ImageData | null;
  popularity_rank: number | null;
  tv_inventory: {
    season_count: number | null;
    episode_count: number | null;
    released_episode_count: number | null;
    expected_episode_count: number | null;
    episodes_by_season: null;
    gaps: null;
    complete: false;
  } | null;
  source_status: {
    suggestion: "ok";
    pages: PageData[];
    reader: ReaderData;
  };
  unavailable_fields: string[];
}

interface ResolveOptions {
  locales?: string[];
  includePages?: boolean;
  fetchImpl?: typeof fetch;
}

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string[]>;
}

const IMDB_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function imdbPageHeaders(locale: string): Record<string, string> {
  const language = locale.toLowerCase().startsWith("en")
    ? `${locale},en;q=0.9`
    : `${locale},en-US;q=0.8,en;q=0.7`;
  return {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": language,
    "Cache-Control": "max-age=0",
    Priority: "u=0, i",
    Referer: "https://www.imdb.com/",
    "Sec-CH-UA":
      '"Not=A?Brand";v="24", "Chromium";v="140", "Google Chrome";v="140"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": IMDB_BROWSER_USER_AGENT,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const parsedValues = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token ?? ""}`);
    }
    const collected: string[] = [];
    while (index + 1 < argv.length && !argv[index + 1]?.startsWith("--")) {
      collected.push(argv[index + 1] as string);
      index += 1;
    }
    if (collected.length === 0) flags.add(token);
    else parsedValues.set(token, collected);
  }
  return { flags, values: parsedValues };
}

function one(args: ParsedArgs, name: string): string | undefined {
  const found = args.values.get(name) ?? [];
  if (found.length > 1) throw new Error(`${name} accepts one value.`);
  return found[0];
}

export function extractImdbId(input: string): string {
  const match = /(?:^|\b|\/)(tt\d{7,12})(?:\b|\/|$)/i.exec(input.trim());
  if (!match?.[1]) {
    throw new Error("The input does not contain a valid IMDb title ID.");
  }
  return match[1].toLowerCase();
}

function mapContentType(item: SuggestionItem): ContentType {
  const type = `${item.qid ?? ""} ${item.q ?? ""}`.toLowerCase();
  if (type.includes("episode")) return "tv_episode";
  if (type.includes("short")) return "short";
  if (type.includes("series") || type.includes("miniseries"))
    return "tv_series";
  if (type.includes("movie") || type.includes("feature")) return "movie";
  return "other";
}

function yearRange(item: SuggestionItem): {
  year: number | null;
  end_year: number | null;
  label: string | null;
} {
  const label = item.yr ?? item.tl ?? (item.y ? String(item.y) : null);
  const years = label?.match(/\d{4}/g)?.map(Number) ?? [];
  return {
    year: item.y ?? years[0] ?? null,
    end_year: years.length > 1 ? (years.at(-1) ?? null) : null,
    label,
  };
}

function people(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry) =>
      entry && typeof entry === "object"
        ? String((entry as { name?: unknown }).name ?? "")
        : "",
    )
    .filter(Boolean);
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value ? [String(value)] : [];
}

function durationMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value);
  if (!match) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

function recognizedJsonLd(value: unknown): Record<string, unknown> | null {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const type = String((candidate as { "@type"?: unknown })["@type"] ?? "");
    if (
      [
        "Movie",
        "TVSeries",
        "TVMiniSeries",
        "TVEpisode",
        "VideoObject",
      ].includes(type)
    ) {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

export function parseJsonLd(html: string): Record<string, unknown> | null {
  const pattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const found = recognizedJsonLd(JSON.parse(match[1] ?? ""));
      if (found) return found;
    } catch {
      // Continue to the next JSON-LD block.
    }
  }
  return null;
}

export function parseReaderOriginalTitle(markdown: string): string | null {
  const match = /^Original title:\s*(.+?)\s*$/im.exec(markdown);
  return match?.[1]?.trim() || null;
}

function pageDataFromJsonLd(
  locale: string,
  status: number,
  value: Record<string, unknown>,
): PageData {
  const ratingValue = value.aggregateRating;
  const rating =
    ratingValue && typeof ratingValue === "object"
      ? {
          value: Number((ratingValue as { ratingValue?: unknown }).ratingValue),
          count: Number.isFinite(
            Number((ratingValue as { ratingCount?: unknown }).ratingCount),
          )
            ? Number((ratingValue as { ratingCount?: unknown }).ratingCount)
            : null,
        }
      : null;
  return {
    locale,
    status: "ok",
    http_status: status,
    error: null,
    name: typeof value.name === "string" ? value.name : null,
    alternate_name:
      typeof value.alternateName === "string" ? value.alternateName : null,
    description:
      typeof value.description === "string" ? value.description : null,
    genres: strings(value.genre),
    duration_minutes: durationMinutes(value.duration),
    rating: rating && Number.isFinite(rating.value) ? rating : null,
    content_rating:
      typeof value.contentRating === "string" ? value.contentRating : null,
    actors: people(value.actor),
    directors: people(value.director),
    creators: people(value.creator),
    season_count: Number.isFinite(Number(value.numberOfSeasons))
      ? Number(value.numberOfSeasons)
      : null,
    episode_count: Number.isFinite(Number(value.numberOfEpisodes))
      ? Number(value.numberOfEpisodes)
      : null,
  };
}

async function fetchPage(
  imdbId: string,
  locale: string,
  fetchImpl: typeof fetch,
): Promise<PageData> {
  let response: Response;
  try {
    response = await fetchImpl(`https://www.imdb.com/title/${imdbId}/`, {
      headers: imdbPageHeaders(locale),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return unavailablePage(locale, 0, errorMessage(error));
  }
  const html = await response.text();
  if (!response.ok || !html.trim()) {
    return unavailablePage(
      locale,
      response.status,
      `IMDb returned HTTP ${response.status} without usable title data.`,
    );
  }
  const jsonLd = parseJsonLd(html);
  if (!jsonLd) {
    return unavailablePage(
      locale,
      response.status,
      "The IMDb page did not contain usable JSON-LD metadata.",
    );
  }
  return pageDataFromJsonLd(locale, response.status, jsonLd);
}

function unavailablePage(
  locale: string,
  status: number,
  error: string,
): PageData {
  return {
    locale,
    status: "unavailable",
    http_status: status,
    error,
    name: null,
    alternate_name: null,
    description: null,
    genres: [],
    duration_minutes: null,
    rating: null,
    content_rating: null,
    actors: [],
    directors: [],
    creators: [],
    season_count: null,
    episode_count: null,
  };
}

function unusedReader(): ReaderData {
  return {
    status: "not_used",
    http_status: null,
    error: null,
    original_title: null,
  };
}

async function fetchReader(
  imdbId: string,
  fetchImpl: typeof fetch,
): Promise<ReaderData> {
  let response: Response;
  try {
    response = await fetchImpl(
      `https://r.jina.ai/http://www.imdb.com/title/${imdbId}/`,
      {
        headers: {
          Accept: "text/plain",
          "User-Agent": "get-imdb/1.1",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (error) {
    return {
      status: "unavailable",
      http_status: null,
      error: errorMessage(error),
      original_title: null,
    };
  }
  const markdown = await response.text();
  if (!response.ok || !markdown.trim()) {
    return {
      status: "unavailable",
      http_status: response.status,
      error: `Jina Reader returned HTTP ${response.status} without usable IMDb page data.`,
      original_title: null,
    };
  }
  const originalTitle = parseReaderOriginalTitle(markdown);
  if (!originalTitle) {
    return {
      status: "unavailable",
      http_status: response.status,
      error: "The rendered IMDb page did not contain an original title.",
      original_title: null,
    };
  }
  return {
    status: "ok",
    http_status: response.status,
    error: null,
    original_title: originalTitle,
  };
}

export function parseSuggestion(
  payload: unknown,
  imdbId: string,
): SuggestionItem {
  if (!payload || typeof payload !== "object") {
    throw new Error("IMDb returned an invalid suggestion response.");
  }
  const items = (payload as { d?: unknown }).d;
  const match = Array.isArray(items)
    ? (items as SuggestionItem[]).find(
        (item) => item.id?.toLowerCase() === imdbId,
      )
    : undefined;
  if (!match?.l)
    throw new Error(`IMDb did not return title data for ${imdbId}.`);
  return match;
}

function firstPageValue<T>(
  pages: PageData[],
  select: (page: PageData) => T | null,
): T | null {
  for (const page of pages) {
    const value = select(page);
    if (value !== null) return value;
  }
  return null;
}

function unique(values: Array<string | null | undefined>): string[] {
  const found = new Map<string, string>();
  for (const value of values) {
    if (!value?.trim()) continue;
    const key = value.normalize("NFKC").trim().toLowerCase();
    if (!found.has(key)) found.set(key, value.trim());
  }
  return [...found.values()];
}

export async function resolveImdb(
  input: string,
  options: ResolveOptions = {},
): Promise<ImdbMetadata> {
  const imdbId = extractImdbId(input);
  const fetchImpl = options.fetchImpl ?? fetch;
  const suggestionUrl = `https://v2.sg.media-imdb.com/suggestion/t/${imdbId}.json`;
  const suggestionResponse = await fetchImpl(suggestionUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "get-imdb/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!suggestionResponse.ok) {
    throw new Error(
      `IMDb suggestion request failed with HTTP ${suggestionResponse.status}.`,
    );
  }
  const item = parseSuggestion(await suggestionResponse.json(), imdbId);
  const locales = unique(options.locales ?? ["en-US", "fr-FR"]);
  const pages =
    options.includePages === false
      ? []
      : await Promise.all(
          locales.map((locale) => fetchPage(imdbId, locale, fetchImpl)),
        );
  const englishPage = pages.find((page) =>
    page.locale.toLowerCase().startsWith("en"),
  );
  const frenchPage = pages.find((page) =>
    page.locale.toLowerCase().startsWith("fr"),
  );
  const primary = item.l as string;
  const pageOriginal = firstPageValue(pages, (page) => page.alternate_name);
  const reader =
    options.includePages !== false && pageOriginal === null
      ? await fetchReader(imdbId, fetchImpl)
      : unusedReader();
  const original = pageOriginal ?? reader.original_title;
  const english = englishPage?.name ?? null;
  const french = frenchPage?.name ?? null;
  const release = yearRange(item);
  const contentType = mapContentType(item);
  const cast =
    firstPageValue(pages, (page) =>
      page.actors.length > 0 ? page.actors : null,
    ) ??
    String(item.s ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  const seasonCount = firstPageValue(pages, (page) => page.season_count);
  const episodeCount = firstPageValue(pages, (page) => page.episode_count);
  const metadata: ImdbMetadata = {
    imdb_id: imdbId,
    input,
    imdb_url: `https://www.imdb.com/title/${imdbId}/`,
    content_type: contentType,
    imdb_media_type: item.qid ?? item.q ?? null,
    titles: {
      primary,
      original,
      english,
      french,
      variants: unique([primary, original, english, french]),
    },
    release,
    runtime_minutes: firstPageValue(pages, (page) => page.duration_minutes),
    description: firstPageValue(pages, (page) => page.description),
    genres:
      firstPageValue(pages, (page) =>
        page.genres.length > 0 ? page.genres : null,
      ) ?? [],
    content_rating: firstPageValue(pages, (page) => page.content_rating),
    rating: firstPageValue(pages, (page) => page.rating),
    cast,
    directors:
      firstPageValue(pages, (page) =>
        page.directors.length > 0 ? page.directors : null,
      ) ?? [],
    creators:
      firstPageValue(pages, (page) =>
        page.creators.length > 0 ? page.creators : null,
      ) ?? [],
    image: item.i?.imageUrl
      ? {
          url: item.i.imageUrl,
          width: item.i.width ?? null,
          height: item.i.height ?? null,
        }
      : null,
    popularity_rank: item.rank ?? null,
    tv_inventory:
      contentType === "tv_series"
        ? {
            season_count: seasonCount,
            episode_count: episodeCount,
            released_episode_count: null,
            expected_episode_count: null,
            episodes_by_season: null,
            gaps: null,
            complete: false,
          }
        : null,
    source_status: { suggestion: "ok", pages, reader },
    unavailable_fields: [],
  };
  const unavailable: Array<[string, unknown]> = [
    ["titles.original", metadata.titles.original],
    ["titles.english", metadata.titles.english],
    ["titles.french", metadata.titles.french],
    ["runtime_minutes", metadata.runtime_minutes],
    ["description", metadata.description],
    ["genres", metadata.genres.length > 0 ? metadata.genres : null],
    ["rating", metadata.rating],
  ];
  if (metadata.tv_inventory) {
    unavailable.push(
      ["tv_inventory.season_count", metadata.tv_inventory.season_count],
      ["tv_inventory.episode_count", metadata.tv_inventory.episode_count],
      ["tv_inventory.released_episode_count", null],
      ["tv_inventory.expected_episode_count", null],
      ["tv_inventory.episodes_by_season", null],
      ["tv_inventory.gaps", null],
    );
  }
  metadata.unavailable_fields = unavailable
    .filter(([, value]) => value === null)
    .map(([name]) => name);
  return metadata;
}

function usage(): void {
  console.log(
    "Usage: bun run scripts/get_imdb.ts (--url <IMDb URL> | --imdb-id <tt ID>) [--locales en-US fr-FR] [--no-page] [--output file] [--compact]",
  );
}

export async function main(argv = Bun.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.flags.has("--help")) {
    usage();
    return;
  }
  const url = one(args, "--url");
  const id = one(args, "--imdb-id");
  if ((url ? 1 : 0) + (id ? 1 : 0) !== 1) {
    throw new Error("Provide one --url value or one --imdb-id value.");
  }
  const metadata = await resolveImdb(url ?? (id as string), {
    locales: args.values.get("--locales"),
    includePages: !args.flags.has("--no-page"),
  });
  const output = JSON.stringify(
    metadata,
    null,
    args.flags.has("--compact") ? undefined : 2,
  );
  const outputPath = one(args, "--output");
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${output}\n`, "utf8");
  } else {
    console.log(output);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`ERROR: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
