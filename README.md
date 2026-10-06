# news-globe

An interactive 3D globe. Click a country and you get its top national headlines right now, grouped by story and ranked by how many outlets are covering them.

It covers **France (FR)**, the **United States (US)** and the **United Kingdom (GB)**. Other countries are greyed out and marked "coming soon".

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
  worker/index.ts, wrangler.jsonc  Cloudflare Worker: static assets + /data/* from KV
packages/ingest/     Node worker: fetch → normalize → dedupe → cluster → rank → write JSON
  src/sources.config.ts            feeds, authority weights, pipeline settings
  src/adapters/                    SourceAdapter interface, RSS adapter, GDELT stub
  src/publish.ts                   uploads changed JSON to Cloudflare KV after each run
packages/shared/     Types for the data contract + country metadata (used by both sides)
data/
  sample/            committed sample output (served until the first ingest)
  index.json, countries/*.json, .cache/   generated, gitignored
deploy/raspberry-pi/ systemd unit for the ingest
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

The front end only fetches `${DATA_BASE_URL}/index.json` and `${DATA_BASE_URL}/countries/{CC}.json`. `DATA_BASE_URL` defaults to `/data`. In dev, a small Vite plugin ([apps/web/vite.config.ts](apps/web/vite.config.ts)) serves those two paths from the repo-root `data/` directory and falls back to `data/sample/`. Nothing else is exposed: `data/.cache` returns 404. In production the same two paths are served by a Cloudflare Worker from KV (see [Deploy](#deploy)). To host the data somewhere else instead, upload the same files and build with:

```bash
DATA_BASE_URL=https://dxxxx.cloudfront.net/news pnpm build
```

## Deploy

Live at **https://news-globe.maze-td.workers.dev**.

```
 Raspberry Pi (systemd)                       Cloudflare (free tier)
┌──────────────────────────┐  KV bulk write  ┌──────────────────────────────────────┐
│ pnpm ingest:watch        │ ──────────────▶ │ KV "news-globe-data"                 │
│  every 15 min → data/    │ changed files   │   index.json, countries/{CC}.json    │
└──────────────────────────┘    only         │ Worker "news-globe"                  │
                                             │   /data/*  → KV (max-age=60)         │
                                             │   anything else → static assets      │
                                             └──────────────────────────────────────┘
```

Why the ingest runs on the Pi rather than on a Cloudflare Cron Trigger: a free-plan Worker gets 10 ms of CPU per invocation, and parsing ~25 feeds and clustering ~400 titles takes far more than that. KV's free tier allows 1,000 writes a day. The publisher only uploads files whose hash changed, which comes to at most 96 runs × (countries + 1) keys a day.

### Front end (Worker + static assets)

Config is in [apps/web/wrangler.jsonc](apps/web/wrangler.jsonc) and the Worker in [apps/web/worker/index.ts](apps/web/worker/index.ts). Static files never invoke the Worker; only `/data/*` does (`run_worker_first`), and it serves only the two public key shapes.

```bash
npx wrangler login                          # once, from apps/web
pnpm --filter @news-globe/web run deploy    # typecheck + vite build + wrangler deploy
pnpm --filter @news-globe/web preview:worker   # local Worker (uses a local KV)
```

### Ingest on a Raspberry Pi

1. Create an API token at dash.cloudflare.com → My Profile → API Tokens → *Create custom token*. Give it one permission, **Account → Workers KV Storage → Edit**, limited to your account.
2. On the Pi (64-bit Raspberry Pi OS, Node ≥ 20.11):
   ```bash
   git clone https://github.com/benjamin-gaultier/news-globe.git ~/news-globe
   cd ~/news-globe
   sudo corepack enable
   pnpm install
   cp .env.example .env && nano .env      # paste the token into CLOUDFLARE_API_TOKEN
   pnpm ingest                            # should end with "[publish] uploaded ... to KV"
   ```
3. Install the service ([deploy/raspberry-pi/news-globe-ingest.service](deploy/raspberry-pi/news-globe-ingest.service)). Adjust `User` and the paths if you're not user `pi`.
   ```bash
   sudo cp deploy/raspberry-pi/news-globe-ingest.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now news-globe-ingest
   journalctl -u news-globe-ingest -f
   ```

Publishing turns on when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` and `CLOUDFLARE_API_TOKEN` are all set, either in the environment or in the repo-root `.env`. If none are set, the ingest only writes local files, as in development. If the upload fails (network, token), the run still writes `data/` and the next run retries; [publish.ts](packages/ingest/src/publish.ts) keeps its hashes in `data/.cache/publish.json`.

To update the Pi: `git pull && pnpm install && sudo systemctl restart news-globe-ingest`.

### Pipeline details

| Step | What it does |
| --- | --- |
| **Fetch** | `HttpCache` ([http.ts](packages/ingest/src/http.ts)) sends `If-None-Match` / `If-Modified-Since` and keeps validators and **parsed items** in `data/.cache/http.json`. A feed requested less than 15 minutes ago is skipped, even on a manual `pnpm ingest`, and its cached items are reused. A 304 also reuses the cached items. A failed feed keeps serving its last good items, and its retry is throttled the same way. Every request in a run is stamped with the run's start time, and the check allows 5 s of slack, so the 15-minute cron never skips a slot. |
| **Parse** | `rss-parser`. The adapter keeps title, link, the feed's `<description>` (HTML stripped, ~300 chars) and the date. Images come from `media:content`, then `media:thumbnail`, then `enclosure`, then the first `<img>`. `content:encoded` (often the full article) is never read into the stored description. |
| **Normalize** | Canonical URL: strip `utm_*`, `fbclid`, `gclid`, `xtor`, `at_*`, `smid` and similar, drop the fragment, lowercase the host, sort the remaining params. `id` is 12 chars of base64url SHA-256 of the canonical URL. Future dates are clamped to now; articles older than 48 h are dropped. |
| **Dedupe** | Exact match on canonical URL. Outlets often list the same article in two section feeds. |
| **Cluster** | Titles are folded (NFD, accents stripped, lowercase, punctuation removed) and FR+EN stopwords and live-blog boilerplate ("EN DIRECT", "LIVE") are dropped. Light suffix folding means *inscrites* ≡ *inscrits* and *lycées* ≡ *lycée*. The pipeline then computes pairwise token-set Jaccard within a country. A cross-outlet pair is a candidate link when similarity ≥ `clusterThreshold` (0.3) **and** the titles share ≥ 2 tokens; two articles from the same outlet are never linked directly. Links are applied strongest first with union-find, and two existing groups only merge if their **average** pairwise similarity is ≥ `clusterMinAverageLink` (0.2). That guard stops one bridging headline from chaining two stories together. |
| **Rank** | First by distinct outlets in the last 24 h, then by most recent article. The representative is the highest-authority outlet, with ties going to the earliest article. "+N other sources" shows one article per other outlet. The top 15 clusters are kept. |
| **Write** | Atomic: write to a tmp file, then rename. If every feed for a country fails and nothing is cached, the previous file is kept rather than blanked. |

**Why the threshold is 0.3, not 0.4:** on the live feeds (2026-10-06), headlines about the same story from different outlets mostly scored 0.3–0.5, because French headlines in particular are long and worded differently. On ~200 raw FR feed items, 0.4 produced 5 multi-outlet clusters and 0.3 produced 11. Only one of the 11 was borderline: two different Édouard Philippe pieces. The cluster tests use real headline pairs at the configured threshold.

**Chaining guard (average linkage):** plain union-find is transitive. On the live US feeds, NPR's "Supreme Court's new term kicks off with blockbuster climate change case" scored 0.30 against WaPo's "6 things to watch in the Supreme Court's new term". That one link merged the climate-case story and the new-term story into a single 15-article cluster, headlined by a midterms piece. Requiring an average similarity of 0.2 between the groups being merged splits them back into "climate case" (11) and "new term" (4), while every genuine multi-outlet story (e.g. Hastert, 6 outlets) stays whole. At 0.25, real members started dropping out. [cluster.test.ts](packages/ingest/test/cluster.test.ts) reproduces the chain with those real headlines.

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

**United Kingdom** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| BBC News | UK, politics | 10 | ✅ |
| The Guardian | uk-news, politics | 9 | ✅ |
| Sky News | UK, politics | 8 | ✅ (low volume: ~10 items per feed) |
| The i Paper | news | 7 | ✅ (10 items) |
| Evening Standard | UK news | 6 | ✅ |
| Daily Mirror | UK news | 5 | ✅ |
| ~~The Telegraph~~ | — | — | ❌ **dropped**: `news/rss.xml` responds but is stale (newest item from June 2026) |
| ~~The Independent~~ | — | — | ❌ **dropped**: section feeds return a single item |
| ~~The Times~~ / ~~ITV~~ / ~~FT~~ | — | — | ❌ no usable public RSS (HTML, timeout, single item) |

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

**Clustering.** Use the snippet's top tokens as a weaker second signal, and add a time-decay so a story from 40 hours ago doesn't absorb today's follow-up.

**Ops.** Alert when a feed returns errors for more than an hour (`lastStatus` in the cache file) or when `index.json` in KV goes stale (the Pi is offline). Later, move the ingest off the Pi, e.g. to a Workers Paid cron trigger with feeds fanned out across invocations.

## Notes

- Country shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:110m admin-0 (public domain), bundled locally, coordinates rounded to 0.01°. In Natural Earth, `ISO_A2` is `-99` for France and Norway, so the build script uses `ISO_A2_EH`.
- `data/sample/` is a real `pnpm ingest` output from 2026-10-06. Its relative times will read "days ago" until you run an ingest.
