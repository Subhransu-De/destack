import { describe, expect, test } from "bun:test";
import {
  extractImdbId,
  parseJsonLd,
  parseReaderOriginalTitle,
  parseSuggestion,
  resolveImdb,
} from "../scripts/get_imdb";

const id = "tt0903747";
const suggestion = {
  d: [
    {
      id,
      l: "Breaking Bad",
      q: "TV series",
      qid: "tvSeries",
      s: "Bryan Cranston, Aaron Paul",
      y: 2008,
      yr: "2008-2013",
      rank: 41,
      i: {
        imageUrl: "https://example.test/poster.jpg",
        width: 100,
        height: 200,
      },
    },
  ],
};

const jsonLd = {
  "@type": "TVSeries",
  name: "Breaking Bad",
  alternateName: "Breaking Bad Original",
  description: "A series description.",
  duration: "PT49M",
  genre: ["Crime", "Drama"],
  numberOfSeasons: 5,
  numberOfEpisodes: 62,
  aggregateRating: { ratingValue: 9.5, ratingCount: 2000000 },
  actor: [{ name: "Bryan Cranston" }],
  director: [{ name: "Test Director" }],
};

describe("IMDb input", () => {
  test("extracts an IMDb title ID from a URL or an ID", () => {
    expect(extractImdbId(`https://www.imdb.com/title/${id}/`)).toBe(id);
    expect(extractImdbId(id.toUpperCase())).toBe(id);
    expect(() => extractImdbId("not-an-imdb-link")).toThrow();
  });

  test("selects the exact suggestion result", () => {
    expect(parseSuggestion(suggestion, id).l).toBe("Breaking Bad");
  });
});

describe("IMDb metadata", () => {
  test("reads JSON-LD from a title page", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`;
    expect(parseJsonLd(html)?.name).toBe("Breaking Bad");
  });

  test("reads an original title from a rendered IMDb page", () => {
    const markdown = "# The Holy Family\n\nOriginal title: Sveta obitelj\n";
    expect(parseReaderOriginalTitle(markdown)).toBe("Sveta obitelj");
  });

  test("keeps unavailable localized data empty", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("media-imdb.com")) return Response.json(suggestion);
      if (url.includes("imdb.com/title") && url) {
        return new Response(
          `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const metadata = await resolveImdb(`https://www.imdb.com/title/${id}/`, {
      locales: ["en-US"],
      fetchImpl,
    });
    expect(metadata.content_type).toBe("tv_series");
    expect(metadata.titles.english).toBe("Breaking Bad");
    expect(metadata.titles.french).toBeNull();
    expect(metadata.runtime_minutes).toBe(49);
    expect(metadata.tv_inventory?.season_count).toBe(5);
    expect(metadata.tv_inventory?.complete).toBeFalse();
    expect(metadata.unavailable_fields).toContain("titles.french");
  });

  test("falls back to a rendered IMDb page when direct pages are blocked", async () => {
    const blockedId = "tt15978202";
    const blockedSuggestion = {
      d: [
        {
          id: blockedId,
          l: "The Holy Family",
          q: "feature",
          qid: "movie",
          y: 2023,
        },
      ],
    };
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("media-imdb.com"))
        return Response.json(blockedSuggestion);
      if (url.startsWith("https://r.jina.ai/")) {
        return new Response(
          "# The Holy Family\n\nOriginal title: Sveta obitelj\n",
          { status: 200 },
        );
      }
      if (url.includes("imdb.com/title"))
        return new Response(null, { status: 202 });
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const metadata = await resolveImdb(
      `https://www.imdb.com/title/${blockedId}/`,
      { fetchImpl },
    );

    expect(metadata.titles.original).toBe("Sveta obitelj");
    expect(metadata.titles.variants).toEqual([
      "The Holy Family",
      "Sveta obitelj",
    ]);
    expect(
      metadata.source_status.pages.every(
        (page) => page.status === "unavailable",
      ),
    ).toBeTrue();
    expect(metadata.source_status.reader.status).toBe("ok");
    expect(metadata.unavailable_fields).not.toContain("titles.original");
  });
});
