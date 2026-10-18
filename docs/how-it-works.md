# How it works

The features in detail, the pipeline and the data files. The overview is in the [README](../README.md).

## Features

**Shading.** Each country on the globe is shaded by how many outlets covered its top story in the last 24 hours (≤1, 2, 3, 4, 5+; a legend sits in the corner), and hovering shows that headline. The regions of an open country get the same treatment in amber. Both read `topTitle` and `topOutlets` from `index.json`, so no country file is fetched until a click ([lib/heat.ts](../apps/web/src/lib/heat.ts)).

**Search.** The search bar at the top (`/` jumps to it) finds countries and regions by name and searches every current headline of every country and region as you type; Escape clears it. A place matches when each word typed starts a word of its name, or of a region's local name ("bayern" finds Bavaria); only places with headlines are listed, above the headlines, and Enter opens the first. Matching ignores accents and case, every word must match, and the place name counts too ("budget brittany"). Results are grouped by place, most widely covered first. A result opens its country or region panel, scrolled to that story and highlighted, so the publisher link is one tap away. The index, `/data/search.json` (about 270 KB gzipped, no links), comes from the hourly workflow and loads on the first search ([lib/search.ts](../apps/web/src/lib/search.ts)). Under the search bar, a row keeps the last five countries opened in this browser one tap away ([useRecentCountries.ts](../apps/web/src/hooks/useRecentCountries.ts)).

**Today.** The **Today** button (or `/#today`) opens the day at a glance: the most widely covered national stories (at most two per country), the stories new or rising this hour, the first cross-border stories, and the stories that have stayed in a country's top 3 for 6 hours or more. Each opens its story page. Headlines are translated on the device where the browser can. The page reads `/data/today.json` (about 4 KB gzipped), which the hourly workflow derives with `trends` and `search` ([derived.ts](../packages/ingest/src/derived.ts)).

**Story pages.** A story's **+N other sources** (or **Story details**) button opens its page in the panel: the headline and snippet, a link to the publisher and a **Share** button, its rank at each of today's runs, every outlet covering it in the order they published (the first is marked), and the same story in other countries, each opening its page there. **Also in** chips and the **Across borders** list open these pages too. A page has its own link, `/#FR/<story id>`; if that story has since left the top list, the page says so ([StoryDetail.tsx](../apps/web/src/components/StoryDetail.tsx)).

**Sections.** A country or region with sport or business headlines gets a **Top / Sport / Business** switch under its name, offering only the sections it has (its `categories` in `index.json`). A section is clustered and ranked like the top headlines, from the outlets' section feeds (see **Sections** under [Pipeline](#pipeline)), and has its own link, `/#FR.sport`. New and Rising badges, sparklines, **Also in**, History, search and Today cover top headlines only, so a section's panel has no badges and no History bar, and its footnote says so. Moving between a country and its regions keeps the section where the place has it. Opening another country (from the row, the globe or a sideways swipe on a phone) starts on its top headlines: only some countries have sections, so a swipe that kept one would drop back to Top at whichever country lacks it, and this way every route into a country lands on the same view ([NewsPanel.tsx](../apps/web/src/components/NewsPanel.tsx)).

**Rising.** Stories in a country or region panel carry a **New** badge (first ranked this hour) or a **↑ Rising** badge (up 3 or more places since the previous run), and a sparkline of their rank over today's runs. Countries whose #1 story is new or rising this hour, and covered by 2 or more outlets, pulse with an orange ring (the 10 best-covered at most; none while a country is open, in history, or with reduced motion; with reduced motion the globe doesn't spin on its own either), and their tooltip says so. All of this comes from `/data/trends.json`, which the hourly workflow derives from the [history archive](operations.md#history-archive) ([derived.ts](../packages/ingest/src/derived.ts)). Badges only appear when the file describes the run on screen.

**Across borders.** When the same story is in several countries' top headlines, the **Across borders** chip (`/#world`) lists those stories with each country's headline, and arcs join the countries on the globe. Each story gets an English line: an English-language country's headline when there is one, or else the best-covered headline translated (by the hourly workflow, or on-device where the browser supports it; see [Headline translation](operations.md#headline-translation)). A story in a country's list that runs elsewhere too shows "Also in" links to those countries. The matching uses no translation: see **Link** under [Pipeline](#pipeline).

**History.** The **History** button at the top of a country's or region's panel, above its top headlines, replays the day: a timeline steps through the day's hourly runs, from the [history archive](operations.md#history-archive), and the globe's shading, hover headlines and country panels show that hour. With a country or region open, the timeline sits at the top of its panel, so its headlines change as you move it; close the panel and it floats under the globe. Each story in a panel says when it was in the top list and its best rank. The arrows step through earlier days. **Live** returns to the current data. The Worker serves `/data/archive/YYYY-MM-DD.json` straight from KV, still gzipped. Finished days are cached for a day.

**On a phone.** Headlines open in a bottom sheet. Swipe sideways on a country's headlines to move to the next or previous country, in a fixed order of countries (a country reached by swiping isn't added to the shortcuts). The top bar shrinks on narrow screens (Today becomes an icon). The site can be installed ("Add to Home Screen"; [manifest.webmanifest](../apps/web/public/manifest.webmanifest)), and a service worker ([sw.js](../apps/web/public/sw.js), production builds only) keeps the app and the last news it loaded, so repeat visits start straight away and the site still opens offline. The page also starts downloading the globe code (about 600 KB gzipped) together with the app, not after it.

**Links.** The open view lives in the URL hash, so it can be shared: `/#FR` opens France and `/#FR-BRE` opens Brittany (a region code names its country). Codes are case-insensitive. Back and Forward step through the views you opened. A story id after a slash opens its page: `/#FR/EAskgXdmb1-3`. A section after a dot opens it: `/#FR.sport`, `/#FR-BRE.business`, `/#FR.sport/<story id>`. A `@` suffix opens History: `/#FR@2026-10-08T14:05` is France at the run of 14:05 UTC that day (or the closest run), and `/#@2026-10-08` is the globe on that day's latest run. Moving the timeline updates the link without adding Back steps. A link to a country or region with no data falls back to the globe or to the country, and one to a section the place doesn't have falls back to its top headlines. History has no sections, so `/#FR.sport@2026-10-08` is France's top headlines that day ([lib/route.ts](../apps/web/src/lib/route.ts)).

## Architecture

The work is precomputed, so a click never triggers a query.

```
 every hour                                                     static JSON
┌────────────┐   ┌──────────┐   ┌───────────┐   ┌─────────┐   ┌──────┐   ┌──────────────────────┐
│ RSS feeds  │──▶│ HttpCache│──▶│ normalize │──▶│ cluster │──▶│ rank │──▶│ data/countries/FR.json│
│ (adapters) │   │ ETag/LM  │   │ + dedupe  │   │ (title  │   │      │   │ data/index.json       │
└────────────┘   │ throttle │   └───────────┘   │ Jaccard)│   └──────┘   └──────────┬───────────┘
                 └──────────┘                   └─────────┘                         │ fetch
                                                                         ┌──────────▼──────────┐
                                                                         │ web app (globe+panel)│
                                                                         └─────────────────────┘
```

The front end only fetches `${DATA_BASE_URL}/index.json` and `${DATA_BASE_URL}/countries/{CC}.json`. `DATA_BASE_URL` defaults to `/data`. In dev, a small Vite plugin ([apps/web/vite.config.ts](../apps/web/vite.config.ts)) serves those two paths from the repo-root `data/` directory and falls back to `data/sample/`. Nothing else is exposed: `data/.cache` returns 404. In production the same two paths are served by a Cloudflare Worker from KV (see [Operations](operations.md)). To host the data somewhere else instead, upload the same files and build with:

```bash
DATA_BASE_URL=https://dxxxx.cloudfront.net/news pnpm build
```

## Layout

```
apps/web/            React + Vite front end (react-globe.gl)
  src/lib/route.ts                 the URL hash (#FR, #FR-BRE, #FR.sport) ↔ the open country, region or section
  src/assets/countries-110m.json   Natural Earth 110m countries, trimmed (scripts/prepare-countries.mjs)
  src/assets/regions-fr.json       France's 13 regions, IGN Admin Express, trimmed (scripts/prepare-regions.mjs fr)
  src/assets/regions-de.json       Germany's 16 Länder, Natural Earth 10m admin-1, trimmed (scripts/prepare-regions.mjs de)
  src/assets/regions-us.json       The 50 US states and DC, Natural Earth 50m admin-1, trimmed (scripts/prepare-regions.mjs us)
  src/assets/regions-es.json       Spain's 17 autonomous communities, Natural Earth 10m provinces merged, trimmed (scripts/prepare-regions.mjs es)
  src/assets/regions-it.json       Italy's 20 regions, Natural Earth 10m provinces merged, trimmed (scripts/prepare-regions.mjs it)
  src/assets/regions-ca.json       Canada's 13 provinces and territories, Natural Earth 50m admin-1, trimmed (scripts/prepare-regions.mjs ca)
  src/assets/regions-au.json       Australia's 8 states and territories, Natural Earth 50m admin-1, trimmed (scripts/prepare-regions.mjs au)
  src/assets/regions-br.json       Brazil's 26 states and the Federal District, Natural Earth 50m admin-1, trimmed (scripts/prepare-regions.mjs br)
  src/assets/regions-mx.json       Mexico's 31 states and Mexico City, Natural Earth 10m admin-1, trimmed (scripts/prepare-regions.mjs mx)
  src/assets/regions-ar.json       Argentina's 23 provinces and the City of Buenos Aires, Natural Earth 10m admin-1, trimmed (scripts/prepare-regions.mjs ar)
  src/assets/regions-in.json       India's 28 states and 8 union territories, Natural Earth 50m admin-1, trimmed (scripts/prepare-regions.mjs in)
  worker/index.ts, wrangler.jsonc  Cloudflare Worker: static assets + /data/* from KV
packages/ingest/     Node worker: fetch → normalize → dedupe → cluster → rank → write JSON
  src/sources.config.ts            feeds, authority weights, pipeline settings
  src/adapters/                    SourceAdapter interface and the RSS adapter
  src/publish.ts                   uploads the JSON to Cloudflare KV as one bundle after each run
  src/kv.ts                        the Cloudflare KV REST client publish.ts and archive-remote.ts share
packages/shared/     Types for the data contract + country metadata (used by both sides)
data/
  sample/            committed sample output (served until the first ingest)
  index.json, status.json, countries/*.json, regions/*.json, .cache/   generated, gitignored
deploy/raspberry-pi/ systemd unit for the ingest
```

## Pipeline

| Step | What it does |
| --- | --- |
| **Fetch** | `HttpCache` ([http.ts](../packages/ingest/src/http.ts)) sends `If-None-Match` / `If-Modified-Since` and keeps validators and **parsed items** in `data/.cache/http.json`. A feed requested less than 15 minutes ago is skipped, even on a manual `pnpm ingest`, and its cached items are reused. A 304 also reuses the cached items. A failed feed keeps serving its last good items, and its retry is throttled the same way. Every request in a run is stamped with the run's start time, and the check allows 5 s of slack, so cron jitter never makes a run skip a feed. |
| **Parse** | `rss-parser`. The adapter keeps title, link, the feed's `<description>` (HTML stripped, ~300 chars) and the date (a Google News sitemap gives title, link and date only). Images come from `media:content`, then `media:thumbnail`, then `enclosure`, then the first `<img>`. `content:encoded` (often the full article) is never read into the stored description. |
| **Normalize** | Canonical URL: strip `utm_*`, `fbclid`, `gclid`, `xtor`, `at_*`, `smid` and similar, drop the fragment, lowercase the host, sort the remaining params. `id` is 12 chars of base64url SHA-256 of the canonical URL. Future dates are clamped to now; articles older than 48 h are dropped. |
| **Dedupe** | Exact match on canonical URL. Outlets often list the same article in two section feeds. |
| **Cluster** | Titles are folded (NFD, accents stripped, lowercase, punctuation removed) and FR+EN stopwords and live-blog boilerplate ("EN DIRECT", "LIVE") are dropped. Light suffix folding means *inscrites* ≡ *inscrits* and *lycées* ≡ *lycée*. The pipeline then computes pairwise token-set Jaccard within a country. A cross-outlet pair is a candidate link when similarity ≥ `clusterThreshold` (0.3) **and** the titles share ≥ 2 tokens; two articles from the same outlet are never linked directly. Links are applied strongest first with union-find, and two existing groups only merge if their **average** pairwise similarity is ≥ `clusterMinAverageLink` (0.2). That guard stops one bridging headline from chaining two stories together. |
| **Rank** | First by distinct outlets in the last 24 h, then by most recent article. The representative is the highest-authority outlet, with ties going to the earliest article. "+N other sources" shows one article per other outlet. The top 15 clusters are kept. |
| **Link** | Across countries, without translation: clusters whose headlines share two separate names (people, places, organisations), one of them rare in the run, are the same story. Names are runs of capitalised words, joined across particles ("Corée du Sud") but not punctuation; in title-case headlines, and for a title's first word, only words seen capitalised mid-sentence elsewhere count. Groups merge only on a high average link, as in clustering. Linked clusters get `alsoIn`; the top 20 groups go into `index.json` as `world` ([world.ts](../packages/ingest/src/world.ts)). |
| **Write** | Atomic: write to a tmp file, then rename. If every feed for a country fails and nothing is cached, the previous file is kept rather than blanked. |

**Sections.** Sport and business feeds go through the same steps, each category on its own, per country and region, into a file of its own next to the top file: `countries/FR.sport.json`, `countries/DE.business.json`, `regions/FR-BRE.sport.json`. A source counts toward a category only through its feeds in that category (`feeds.sport`; see `feedUrlsOf`), so a sports daily like kicker makes Germany's sport file and never touches its top file, and a country with no feed in a category gets no file for it. `FETCHED_CATEGORIES` in [sources.config.ts](../packages/ingest/src/sources.config.ts) lists the categories a run fetches. Section files are not linked across borders, and the history archive, trends, search and Today read only the top files.

**Why the threshold is 0.3, not 0.4:** on the live feeds (2026-10-06), headlines about the same story from different outlets mostly scored 0.3–0.5, because French headlines in particular are long and worded differently. On ~200 raw FR feed items, 0.4 produced 5 multi-outlet clusters and 0.3 produced 11. Only one of the 11 was borderline: two different Édouard Philippe pieces. The cluster tests use real headline pairs at the configured threshold.

**Chaining guard (average linkage):** plain union-find is transitive. On the live US feeds, NPR's "Supreme Court's new term kicks off with blockbuster climate change case" scored 0.30 against WaPo's "6 things to watch in the Supreme Court's new term". That one link merged the climate-case story and the new-term story into a single 15-article cluster, headlined by a midterms piece. Requiring an average similarity of 0.2 between the groups being merged splits them back into "climate case" (11) and "new term" (4), while every genuine multi-outlet story (e.g. Hastert, 6 outlets) stays whole. At 0.25, real members started dropping out. [cluster.test.ts](../packages/ingest/test/cluster.test.ts) reproduces the chain with those real headlines.

## Data contract

Types live in [packages/shared/src/index.ts](../packages/shared/src/index.ts). `schemaVersion` is currently `1`, and the web app refuses other versions.

`data/index.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-06T08:11:52.000Z",
  "countries": [{
    "code": "FR", "name": "France", "updatedAt": "…", "clusterCount": 15,
    "topTitle": "…",   // the top story's headline        (optional: older files have neither)
    "topOutlets": 4,   // its outletCount24h
    "categories": ["top", "sport", "business"]   // optional: the files it has, when it has section files
  }],
  "regions": [{ "code": "FR-BRE", "name": "Brittany", "updatedAt": "…", "clusterCount": 15 }],  // optional
  "world": [{                       // optional: cross-border stories, most countries first, ≤ 20
    "id": "…",
    "names": ["francis halzen", "nobel"],   // names the countries' headlines share (folded)
    "countries": [{ "code": "UY", "clusterId": "…", "title": "…", "url": "…", "outletCount24h": 2 }],
    "latestPublishedAt": "…"
  }]
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
      "latestPublishedAt": "…",
      "alsoIn": [{ "code": "DE", "clusterId": "…" }]   // optional: the same story in other countries
    }
  ]
}
```

`data/regions/{CC}-{R}.json` (ISO 3166-2 code, e.g. `FR-BRE`; Corsica is `FR-20R`) has the same shape plus `regionCode` and `regionName`. It is built from regional outlets only (sources with a `region` in the config), clustered and ranked on its own, so regional papers never crowd the national file.

Section files, `data/countries/{CC}.{category}.json` and `data/regions/{CC}-{R}.{category}.json` with `category` `sport` or `business` (`FR.sport.json`), have the same shape plus `category`, and no `alsoIn`. Top files keep their plain name and have no `category`. A code never contains a dot, so the name is unambiguous, and the same stem (`DE.sport`) names the file in `status.json`. An index entry lists its place's files in `categories`; a section with no top file isn't listed.

`Article`: `id, url, canonicalUrl, title, description (≤ ~300 chars or null), source {id, name}, sourceCountry, language, publishedAt, imageUrl (or null), countryCode, regionCode (the outlet's region, or null for national outlets)`.

## Next steps

**GDELT adapter.** A second `SourceAdapter` ([adapters/types.ts](../packages/ingest/src/adapters/types.ts)) next to RSS. The plan is to query the free GDELT DOC 2.0 API (`mode=ArtList`, `sourcecountry:<FIPS>`, `sourcelang:`, 6 h timespan) through the same `HttpCache` throttle. Each article's domain would count as its outlet, with a domain → authority table. GDELT uses FIPS 10-4 codes rather than ISO, so an ISO→FIPS map is needed. This is the path to covering most countries without curating feeds one by one. It returns no snippets, so `description` would be `null`.

**More regions.** France, Germany, Spain, Italy, the US, Canada, Australia, Brazil, Mexico, Argentina and India have regions (see [Sources](sources.md)). Adding a country means adding its entries to `REGIONS` ([shared](../packages/shared/src/index.ts)), sources with `region`, and an outline file next to `regions-fr.json` (named `regions-xx.json`; [GlobeView.tsx](../apps/web/src/components/GlobeView.tsx) picks it up by name). Natural Earth 10m admin-1 has states and provinces for most countries. Later, tag national outlets' stories with a region from place names in titles.

**Cross-border stories.** Use the history archive as a background corpus, so words that make the news every day (ministries, leaders' names) weigh less than this week's names. Link regions too, and match names across scripts (Трамп ↔ Trump) with a small transliteration table.

**Clustering.** Use the snippet's top tokens as a weaker second signal, and add a time-decay so a story from 40 hours ago doesn't absorb today's follow-up.

**Ops.** Done: the hourly health check (see [Health check](operations.md#health-check)). Later, move the ingest off the Pi, e.g. to a Workers Paid cron trigger with feeds fanned out across invocations.
