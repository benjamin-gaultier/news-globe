# news-globe

An interactive 3D globe. Click a country and you get its top national headlines right now, grouped by story and ranked by how many outlets are covering them.

The MVP covers **France (FR)** and the **United States (US)**. Other countries are greyed out and marked "coming soon".

- No LLM calls and no paid APIs anywhere. The pipeline is RSS plus hand-written text processing.
- It stores metadata only: headline, the feed's own short snippet, URL, source, time and image URL. It never stores or displays article text, and every headline links out to the publisher.
- Polite fetching: a descriptive User-Agent, conditional GET (ETag / Last-Modified), and **at most one request per feed every 15 minutes**.

## Quick start

Requires Node ≥ 20.11 and pnpm (`corepack enable` gives you the pinned version).

```bash
pnpm install
pnpm dev            # web app on http://localhost:5173 (shows the committed sample data)
pnpm ingest         # one-off run: fetch feeds → data/countries/*.json + data/index.json
pnpm ingest:watch   # run now, then every 15 minutes (node-cron)
pnpm test           # vitest (ingest pipeline)
pnpm typecheck      # all packages
pnpm build          # production build of the web app → apps/web/dist
```

After the first `pnpm ingest`, the dev server serves your fresh output instead of the sample.

## Layout

```
apps/web/            React + Vite front end (react-globe.gl)
  src/assets/countries-110m.json   Natural Earth 110m countries, trimmed (scripts/prepare-countries.mjs)
packages/ingest/     Node worker: fetch → normalize → dedupe → cluster → rank → write JSON
  src/sources.config.ts            feeds, authority weights, pipeline settings
  src/adapters/                    SourceAdapter interface, RSS adapter, GDELT stub
packages/shared/     Types for the data contract + country metadata (used by both sides)
data/
  sample/            committed sample output (served until the first ingest)
  index.json, countries/*.json, .cache/http.json   generated, gitignored
```

## Architecture

The work is precomputed, so a click never triggers a query.

```
 every 15 min                                                   static JSON
┌────────────┐   ┌──────────┐   ┌───────────┐   ┌─────────┐   ┌──────┐   ┌──────────────────────┐
│ RSS feeds  │──▶│ HttpCache│──▶│ normalize │──▶│ cluster │──▶│ rank │──▶│ data/countries/FR.json│
│ (adapters) │   │ ETag/LM  │   │ + dedupe  │   │ (title  │   │      │   │ data/index.json       │
└────────────┘   │ throttle │   └───────────┘   │ Jaccard)│   └──────┘   └──────────┬───────────┘
                 └──────────┘                   └─────────┘                         │ fetch
                                                                         ┌──────────▼──────────┐
                                                                         │ web app (globe+panel)│
                                                                         └─────────────────────┘
```

The front end only fetches `${DATA_BASE_URL}/index.json` and `${DATA_BASE_URL}/countries/{CC}.json`. `DATA_BASE_URL` defaults to `/data`. In dev, a small Vite plugin ([apps/web/vite.config.ts](apps/web/vite.config.ts)) serves those two paths from the repo-root `data/` directory and falls back to `data/sample/`. Nothing else is exposed: `data/.cache` returns 404. To host the data on S3/CloudFront, upload the same files and build with:

```bash
DATA_BASE_URL=https://dxxxx.cloudfront.net/news pnpm build
```

### Pipeline details

| Step | What it does |
| --- | --- |
| **Fetch** | `HttpCache` ([http.ts](packages/ingest/src/http.ts)) sends `If-None-Match` / `If-Modified-Since` and keeps validators and **parsed items** in `data/.cache/http.json`. A feed requested less than 15 minutes ago is skipped, even on a manual `pnpm ingest`, and its cached items are reused. A 304 also reuses the cached items. A failed feed keeps serving its last good items, and its retry is throttled the same way. Every request in a run is stamped with the run's start time, and the check allows 5 s of slack, so the 15-minute cron never skips a slot. |
| **Parse** | `rss-parser`. The adapter keeps title, link, the feed's `<description>` (HTML stripped, ~300 chars) and the date. Images come from `media:content`, then `media:thumbnail`, then `enclosure`, then the first `<img>`. `content:encoded` (often the full article) is never read into the stored description. |
| **Normalize** | Canonical URL: strip `utm_*`, `fbclid`, `gclid`, `xtor`, `at_*`, `smid` and similar, drop the fragment, lowercase the host, sort the remaining params. `id` is 12 chars of base64url SHA-256 of the canonical URL. Future dates are clamped to now; articles older than 48 h are dropped. |
| **Dedupe** | Exact match on canonical URL. Outlets often list the same article in two section feeds. |
| **Cluster** | Titles are folded (NFD, accents stripped, lowercase, punctuation removed) and FR+EN stopwords and live-blog boilerplate ("EN DIRECT", "LIVE") are dropped. Light suffix folding means *inscrites* ≡ *inscrits* and *lycées* ≡ *lycée*. The pipeline then computes pairwise token-set Jaccard within a country and merges with union-find when similarity ≥ `clusterThreshold` (0.3) **and** the titles share ≥ 2 tokens. Two articles from the same outlet are never linked directly. |
| **Rank** | First by distinct outlets in the last 24 h, then by most recent article. The representative is the highest-authority outlet, with ties going to the earliest article. "+N other sources" shows one article per other outlet. The top 15 clusters are kept. |
| **Write** | Atomic: write to a tmp file, then rename. If every feed for a country fails and nothing is cached, the previous file is kept rather than blanked. |

**Why the threshold is 0.3, not 0.4:** on the live feeds (2026-10-06), headlines about the same story from different outlets mostly scored 0.3–0.5, because French headlines in particular are long and worded differently. On ~200 raw FR feed items, 0.4 produced 5 multi-outlet clusters and 0.3 produced 11. Only one of the 11 was borderline: two different Édouard Philippe pieces. The cluster tests use real headline pairs at the configured threshold.

**Known limitation:** union-find is transitive, so two adjacent stories can chain into one cluster if a headline bridges them. Example: "Supreme Court's new term" and "Supreme Court hears climate case" joined through "Supreme Court term begins with cases on climate change". A centroid or average-link check would fix this; see next steps.

## Data contract

Types live in [packages/shared/src/index.ts](packages/shared/src/index.ts). `schemaVersion` is currently `1`, and the web app refuses other versions.

`data/index.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-06T08:11:52.000Z",
  "countries": [{ "code": "FR", "name": "France", "updatedAt": "…", "clusterCount": 15 }]
}
```

`data/countries/{CC}.json`

```jsonc
{
  "schemaVersion": 1,
  "countryCode": "FR",
  "countryName": "France",
  "updatedAt": "2026-10-06T08:11:52.000Z",
  "clusters": [                     // ranked, best first, ≤ 15
    {
      "id": "<representative id>",
      "representative": Article,
      "related": [Article],         // one per other outlet, newest first
      "outletCount24h": 4,
      "outletCount": 4,
      "latestPublishedAt": "…"
    }
  ]
}
```

`Article`: `id, url, canonicalUrl, title, description (≤ ~300 chars or null), source {id, name}, sourceCountry, language, publishedAt, imageUrl (or null), countryCode, regionCode (null; reserved)`.

## Sources

Every candidate feed was fetched and parsed with the real User-Agent on 2026-10-06 before it went into [sources.config.ts](packages/ingest/src/sources.config.ts). Where an outlet has them, it uses two section feeds (politics plus national/society) rather than an "all news" feed, which would mix in international stories.

**France**

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Le Monde | politique, société | 10 | ✅ |
| franceinfo | politique, france | 9 | ✅ (`francetvinfo.fr` now redirects to `franceinfo.fr`; config uses the final URL) |
| Le Figaro | politique, actualité France | 8 | ✅ |
| Libération | politique, société | 7 | ✅ (no images in feed; ETag/LM supported) |
| Ouest-France | france | 6 | ➕ **added**, replacing Les Echos |
| 20 Minutes | politique, société | 5 | ➕ **added**, replacing Les Echos |
| ~~Les Echos~~ | — | — | ❌ **dropped**: every RSS endpoint (`syndication.lesechos.fr/rss/*`, `services.lesechos.fr/rss/*`) returns **403** to non-browser clients |

**United States**

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The New York Times | Politics, U.S. | 10 | ✅ (section feeds reachable) |
| The Washington Post | politics, national | 9 | ✅ (section feeds reachable) |
| NPR | Politics (1014), National (1003) | 8 | ✅ (low volume: 10 items each, can lag ~1 day) |
| PBS News | politics, nation | 8 | ✅ |
| CBS News | politics, us | 7 | ➕ **added**, replacing AP |
| ABC News | politics, US headlines | 7 | ➕ **added**, replacing AP (`abcnews.go.com` now redirects to `abcnews.com`) |
| ~~AP~~ | — | — | ❌ **dropped**: AP publishes no official RSS, and `apnews.com/*.rss` / `?format=rss` return **403** |

The Hill (`thehill.com/homenews/feed/`) and NBC (`feeds.nbcnews.com/nbcnews/public/politics`) also worked and are good substitutes if one of the above breaks.

Authority weights are editorial judgment calls. They only decide which outlet's headline represents a cluster, not ranking.

## Adding a feed or a country

**A feed for an existing country:** add an entry to `SOURCES` in [sources.config.ts](packages/ingest/src/sources.config.ts) with a stable `id`, display `name`, `country`, `language`, `feedUrls` and `authority`. Check it first:

```bash
curl -sA "NewsGlobeBot/0.1 (+https://github.com/benjamin-gaultier/news-globe; headline metadata only)" -I <feed-url>
```

**A new country:**

1. Add it to `COUNTRIES` in [packages/shared/src/index.ts](packages/shared/src/index.ts) with its ISO 3166-1 alpha-2 code, name, and the camera `lat` / `lng` / `altitude` for the globe.
2. Add 4–6 national outlets for it to `SOURCES`.
3. If its language isn't French or English, add stopwords to [normalize/text.ts](packages/ingest/src/normalize/text.ts). Otherwise clustering will match on function words.
4. Run `pnpm ingest`. The globe highlights every country listed in `index.json`, so nothing else changes in the front end.

## Next steps

**GDELT adapter.** Interface and stub are in [adapters/gdelt.ts](packages/ingest/src/adapters/gdelt.ts). The plan is to query the free GDELT DOC 2.0 API (`mode=ArtList`, `sourcecountry:<FIPS>`, `sourcelang:`, 6 h timespan) through the same `HttpCache` throttle. Each article's domain would count as its outlet, with a domain → authority table. GDELT uses FIPS 10-4 codes rather than ISO, so an ISO→FIPS map is needed. This is the path to covering most countries without curating feeds one by one. It returns no snippets, so `description` would be `null`.

**Regional (sub-national) headlines.** `regionCode` (ISO 3166-2, e.g. `FR-BRE`, `US-CA`) is already in the data model.
1. Tag articles from regional outlets (Ouest-France regional editions, *La Dépêche*, state-level US papers) with the outlet's region in the config, and later from place names in titles.
2. Write `data/regions/{CC}-{REGION}.json` with the same cluster shape.
3. On the globe, show admin-1 polygons (Natural Earth 10m/50m states & provinces) when zoomed into a covered country.

**Clustering.** Add an average-link or centroid check before union so bridging headlines can't chain distinct stories, and include the snippet's top tokens as a weaker signal.

**Ops.** Run `ingest:watch` as a small container or cron job, sync `data/` to S3 with `Cache-Control: max-age=60`, and alert when a feed returns errors for more than an hour (`lastStatus` in the cache file).

## Notes

- Country shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:110m admin-0 (public domain), bundled locally, coordinates rounded to 0.01°. In Natural Earth, `ISO_A2` is `-99` for France and Norway, so the build script uses `ISO_A2_EH`.
- `data/sample/` is a real `pnpm ingest` output from 2026-10-06. Its relative times will read "days ago" until you run an ingest.
