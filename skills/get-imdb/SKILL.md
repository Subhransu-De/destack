---
name: get-imdb
description: Use this to get full IMDb information about video content.
user-invocable: true
---

# Get IMDb

## Purpose

This skill gets title information from an IMDb link. It returns JSON for a person or another skill.

The resolver uses IMDb-owned endpoints only. It does not use metadata from a third-party service.

## Requirements

- Use Bun to run the resolver.
- Accept one IMDb title link or one title ID.
- Accept IDs that start with `tt` and contain at least seven digits.
- Keep the original input in the output.
- Do not invent a title, date, episode, or language value.

## Procedure

1. Get the IMDb link or title ID from the user.
2. Run the resolver from the `get-imdb` skill folder.

```bash
bun run scripts/get_imdb.ts --url "https://www.imdb.com/title/tt0903747/"
```

You can also use the title ID.

```bash
bun run scripts/get_imdb.ts --imdb-id tt0903747
```

3. Read `source_status` before you use optional fields.
4. Read `unavailable_fields` before you make a search query.
5. Use only values that the resolver returns.

## Options

- Use `--locales en-US fr-FR` to request specific title-page languages.
- Use `--no-page` to get basic data from the IMDb suggestion service only.
- Use `--output PATH` to write the JSON to a file.
- Use `--compact` to write JSON without indentation.

## Output

The output contains these main fields:

- `imdb_id` contains the normalized IMDb title ID.
- `imdb_url` contains the canonical IMDb link.
- `content_type` identifies a movie, TV series, short, TV episode, or other title.
- `titles` contains the available primary, original, English, and French titles.
- `release` contains the start year, end year, and IMDb year label.
- `runtime_minutes`, `description`, `genres`, `rating`, and credits contain optional page data.
- `tv_inventory` contains available series totals and explicit incomplete fields.
- `source_status` gives the result of each IMDb request.
- `unavailable_fields` lists each field that the resolver cannot get.

## TV Series Rules

The title page can include a season count and an episode count. These totals do not identify each episode.

The resolver sets `tv_inventory.complete` to `false`. The resolver does not invent released episodes, future episodes, or numbering gaps.

If `tv_inventory.complete` is `false`, do not describe the record as a complete episode inventory.

If a torrent search needs episode completeness, stop and report the unavailable TV fields.

## Source Limits

The IMDb suggestion service supplies basic title data. This data usually includes the title, media type, year, cast summary, and image.

The resolver also requests IMDb title pages. These pages can supply JSON-LD data for the plot, runtime, genres, rating, and credits.

IMDb can block automated title-page requests. If IMDb blocks a page, the resolver keeps the basic data and reports the page error.

The full IMDb GraphQL API needs an IMDb data subscription and AWS credentials. This skill does not use that API.

## Error Rules

- If the input has no valid title ID, report the input error.
- If IMDb returns no exact title, report that the title is unavailable.
- If the suggestion request fails, stop and report the HTTP status.
- If a title page fails, keep the basic result and report the page status.

## Use With Torrent Search

If the user gives an IMDb link, run `get-imdb` before `torrent-search`.

Use all returned title variants for the torrent queries. If the release year is available, use it in each query.

For a TV series, do not claim that the torrent results cover all episodes without a complete episode inventory.
