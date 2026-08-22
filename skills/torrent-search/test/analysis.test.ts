import { describe, expect, test } from "bun:test";
import { analyzeBooks, queryKeywords } from "../scripts/analyze_books";
import {
  analyzeMovie,
  analyzeTvSeries,
  detectContentType,
} from "../scripts/analyze_content";
import { rankResults } from "../scripts/parse_results";
import { selectableResults } from "../scripts/select_and_add";
import { checkBookFormat } from "../scripts/validate_book";

const hashA = "A".repeat(40);
const hashB = "B".repeat(40);
const results = [
  {
    fileName: "Example Show S01E01 2160p WEB-DL Atmos",
    fileUrl: `magnet:?xt=urn:btih:${hashA}`,
    fileSize: 12 * 1024 ** 3,
    nbSeeders: 20,
    engineName: "fixture",
  },
  {
    fileName: "Example Show S01E01 1080p BluRay",
    fileUrl: `magnet:?xt=urn:btih:${hashB}`,
    fileSize: 8 * 1024 ** 3,
    nbSeeders: 80,
    engineName: "fixture",
  },
  {
    fileName: "Example Show S01E02 1080p WEB-DL",
    fileUrl: `magnet:?xt=urn:btih:${"C".repeat(40)}`,
    fileSize: 7 * 1024 ** 3,
    nbSeeders: 50,
    engineName: "fixture",
  },
];

describe("content analysis", () => {
  test("detects TV episodes and chooses quality before seed count", () => {
    expect(detectContentType(results)).toBe("tv_series");
    const analysis = analyzeTvSeries(results, "Example Show");
    expect(analysis.total_episodes).toBe(2);
    expect(
      (
        analysis.top_quality_per_episode as Record<string, { fileName: string }>
      )["S01E01"]?.fileName,
    ).toContain("2160p");
  });

  test("returns separate 4K and 1080p movie choices", () => {
    const analysis = analyzeMovie(
      results.map((result) => ({
        ...result,
        fileName: result.fileName.replace(/S01E\d{2} /, ""),
      })),
    );
    expect(analysis.best_4k).toBeTruthy();
    expect(analysis.best_1080p).toBeTruthy();
  });
});

describe("book and result filtering", () => {
  test("ranks relevant books and recognizes supported formats", () => {
    const analysis = analyzeBooks(
      [
        { fileName: "The Example Book EPUB", nbSeeders: 10, fileSize: 1_000 },
        { fileName: "Unrelated archive", nbSeeders: 100, fileSize: 2_000 },
      ],
      "The Example Book",
    );
    expect(queryKeywords("The Example Book")).toEqual(["example", "book"]);
    expect(
      (analysis.best_candidate as { fileName: string }).fileName,
    ).toContain("Example Book");
    expect(
      checkBookFormat([{ name: "books/title.epub" }, { name: "cover.jpg" }])
        .validFiles,
    ).toEqual(["books/title.epub"]);
  });

  test("deduplicates selectable magnets and retains ranked results", () => {
    expect(selectableResults(results, "Example Show")).toHaveLength(3);
    expect(rankResults(results, "Example Show")).toHaveLength(3);
  });
});
