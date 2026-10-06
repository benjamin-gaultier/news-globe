# news-globe

An interactive 3D globe. Click a country and you get its top national headlines right now, grouped by story and ranked by how many outlets are covering them.

It covers **France (FR)**, the **United States (US)**, the **United Kingdom (GB)**, **Germany (DE)**, **Spain (ES)**, **Italy (IT)**, **Canada (CA)**, **Brazil (BR)** and **Turkey (TR)**. Other countries are greyed out and marked "coming soon".

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

Runs on a Raspberry Pi 4 (64-bit Raspberry Pi OS / Debian 13). Steps 2–4 need no sudo.

1. Create an API token at dash.cloudflare.com → My Profile → API Tokens → *Create custom token*. Give it one permission, **Account → Workers KV Storage → Edit**, limited to your account. (It is a user token: check it with `/user/tokens/verify`, not the account endpoint.)
2. Install Node 24 from the official tarball into your home folder (Debian's `nodejs` package is 20.x and lacks corepack):
   ```bash
   V=v24.21.0; F=node-$V-linux-arm64.tar.xz
   cd /tmp && curl -fsSLO https://nodejs.org/dist/$V/$F
   curl -fsSL https://nodejs.org/dist/$V/SHASUMS256.txt | grep " $F$" | sha256sum -c -
   mkdir -p ~/.local/node && tar -xJf $F -C ~/.local/node --strip-components=1
   echo 'export PATH=$HOME/.local/bin:$HOME/.local/node/bin:$PATH' >> ~/.profile && . ~/.profile
   mkdir -p ~/.local/bin && corepack enable --install-directory ~/.local/bin
   ```
3. The repo is private, so give the Pi a **read-only deploy key** for this repo only:
   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/news_globe_deploy
   printf "Host github-news-globe
  HostName github.com
  User git
  IdentityFile ~/.ssh/news_globe_deploy
  IdentitiesOnly yes
" >> ~/.ssh/config
   # then add ~/.ssh/news_globe_deploy.pub on GitHub (repo → Settings → Deploy keys, write access off),
   # or from a machine with gh: gh repo deploy-key add news_globe_deploy.pub --title "pi (read-only)"
   git clone github-news-globe:benjamin-gaultier/news-globe.git ~/news-globe
   cd ~/news-globe && pnpm install --frozen-lockfile
   cp .env.example .env && chmod 600 .env && nano .env   # paste the token into CLOUDFLARE_API_TOKEN
   pnpm ingest                                         # should end with "[publish] uploaded ... to KV"
   ```
   When moving the ingest from another machine, copy its `data/.cache/` over first. The Pi then knows when each feed was last fetched (and its ETag), so the 15-minute limit holds across the switch.
4. Install the service. [deploy/raspberry-pi/news-globe-ingest.service](deploy/raspberry-pi/news-globe-ingest.service) assumes user `pi`; replace `pi` with your user name:
   ```bash
   sed "s#/home/pi#$HOME#g; s#^User=pi#User=$USER#" deploy/raspberry-pi/news-globe-ingest.service > /tmp/news-globe-ingest.service
   sudo cp /tmp/news-globe-ingest.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now news-globe-ingest
   journalctl -u news-globe-ingest -f
   ```

Only one machine should run the ingest. Two pollers would double the requests to every feed.

Publishing turns on when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` and `CLOUDFLARE_API_TOKEN` are all set, either in the environment or in the repo-root `.env`. If none are set, the ingest only writes local files, as in development. If the upload fails (network, token), the run still writes `data/` and the next run retries; [publish.ts](packages/ingest/src/publish.ts) keeps its hashes in `data/.cache/publish.json`.

To update the Pi (e.g. after adding a country, which also needs a Worker redeploy): `cd ~/news-globe && git pull && pnpm install --frozen-lockfile`. No restart is needed: the watcher starts every run as a fresh `cli.ts` process, so the next run uses the new code and feeds. Only a change to `watch.ts` itself, or to its schedule, needs `sudo systemctl restart news-globe-ingest`.

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

### Headline language

For non-English countries the panel has an **Original / English** toggle. The choice is remembered in `localStorage`.
- Headlines and snippets are translated **in the browser** with the built-in [Translator API](https://developer.chrome.com/docs/ai/translator-api) (Chrome 138+ on desktop). The model runs on-device, nothing is sent to a translation service, and the ingest stays free of LLM and paid APIs ([lib/translate.ts](apps/web/src/lib/translate.ts)).
- Headline links always go to the publisher. In English mode each foreign story also gets a "Read in English ↗" link that opens the article through Google Translate's web proxy.
- Browsers without the API (Safari, Firefox, most phones) keep the original headlines and show a note pointing to that link.

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
| The Independent | politics, UK | 8 | ✅ |
| Sky News | UK, politics | 8 | ✅ (low volume: ~10 items per feed) |
| The i Paper | news | 7 | ✅ (10 items) |
| Evening Standard | UK news | 6 | ✅ |
| Daily Mirror | UK news | 5 | ✅ |
| ~~The Telegraph~~ | — | — | ❌ **dropped**: `news/rss.xml` responds but is stale (newest item from June 2026) |
| ~~The Times~~ / ~~ITV~~ / ~~FT~~ | — | — | ❌ no usable public RSS (HTML, timeout, single item) |

**Germany** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| tagesschau | Innenpolitik, Inland | 10 | ✅ |
| DER SPIEGEL | Politik Deutschland | 9 | ✅ |
| Süddeutsche Zeitung | Politik | 9 | ✅ |
| Frankfurter Allgemeine | Politik Inland | 8 | ✅ |
| ZEIT ONLINE | Politik Deutschland | 8 | ✅ |
| WELT | Politik Deutschland | 7 | ✅ |
| n-tv | Politik | 6 | ✅ |

ZDF heute (`zdf.de/rss/zdf/nachrichten`) and Tagesspiegel (`tagesspiegel.de/contentexport/feed/politik`) also work, but mix in international news.

German, Spanish, Italian, Portuguese and Turkish titles use their own stopword lists ([normalize/text.ts](packages/ingest/src/normalize/text.ts), `STOPWORDS_BY_LANGUAGE`), and German also folds `-en` endings. The list is per-language because words like *die*, *war* and *man* are stopwords in German but carry meaning in English.

**Spain** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El País | España | 10 | ✅ |
| El Mundo | España | 9 | ✅ |
| ABC | España | 8 | ✅ |
| La Vanguardia | Política | 7 | ✅ (high volume, ~100 items) |
| El Confidencial | España | 7 | ✅ (Atom feed) |
| elDiario.es | Política | 6 | ✅ |
| 20minutos | Nacional | 5 | ✅ |
| ~~RTVE~~ | — | — | ❌ **dropped**: public feeds are stale (newest items from 2022) |
| ~~Europa Press~~ | — | — | ❌ **dropped**: no response |

El Español (`elespanol.com/rss/espana/`) and Antena 3 also work and are good substitutes.

**Italy** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ANSA | politica, cronaca | 10 | ✅ |
| la Repubblica | politica, cronaca | 9 | ✅ |
| RaiNews | politica | 8 | ✅ |
| Il Sole 24 Ore | Italia | 7 | ✅ |
| Sky TG24 | politica | 7 | ✅ (items have no dates; taken from the URL, see below) |
| Il Post | Italia | 6 | ✅ (10 items) |
| ~~Corriere della Sera~~ | — | — | ❌ **dropped**: feeds are abandoned (`lastBuildDate` 2024, newest items months old) |
| ~~La Stampa~~ | — | — | ❌ **dropped**: RSS URLs redirect to HTML |
| ~~Il Fatto Quotidiano~~ | — | — | ❌ **dropped**: section feed is empty |

TGcom24 (`tgcom24.mediaset.it/rss/politica.xml`) also works and is a good substitute.

**Canada** (added 2026-10-06)

| Outlet | Feeds | Language | Authority | Status |
| --- | --- | --- | --- | --- |
| The Globe and Mail | politics, canada | en | 10 | ✅ |
| CTV News | canada | en | 9 | ✅ |
| Radio-Canada | ICI Info (4159) | fr | 9 | ✅ (general feed, includes some world news) |
| Global News | politics, canada | en | 8 | ✅ (10 items each) |
| National Post | politics, canada | en | 7 | ✅ (10 items each) |
| La Presse | politique | fr | 7 | ✅ (10 items) |
| ~~CBC News~~ | — | — | — | ❌ **dropped**: `cbc.ca/webfeed/rss/*` hangs for non-browser clients (HTTP/2 stream reset, then a timeout over HTTP/1.1), while `cbc.ca/news` responds |
| ~~Toronto Star~~ | — | — | — | ❌ **dropped**: RSS search endpoint returns **429** |

Canada is bilingual, and clustering only compares titles within a language, so a story covered in English and in French shows up as two clusters. Cross-language matching would need translation at ingest. Until then the French outlets add coverage but not outlet counts.

**Brazil** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| g1 | política | 10 | ✅ (`/rss/g1/brasil/` dropped: stale since 2023) |
| Folha de S.Paulo | poder, cotidiano | 9 | ✅ (ISO-8859-1 encoded, see below) |
| Estadão | política | 9 | ✅ |
| O Globo | main feed | 8 | ✅ (general feed, includes sport and world) |
| Agência Brasil | política, geral | 7 | ✅ (10 items each) |
| Poder360 | main feed | 7 | ✅ (10 items) |
| ~~CNN Brasil~~ | — | — | ❌ **dropped**: section feed returns 404 |

**Turkey** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Anadolu Ajansı | güncel | 10 | ✅ (state news agency; `cat=politika` dropped: stale) |
| TRT Haber | gündem | 9 | ✅ (state broadcaster) |
| Hürriyet | gündem | 8 | ✅ |
| NTV | gündem | 8 | ✅ (Atom feed) |
| Sözcü | gündem | 7 | ✅ (opposition) |
| Cumhuriyet | son dakika | 7 | ✅ (opposition; breaking-news feed) |
| CNN Türk | Türkiye | 7 | ✅ (dates are local time labelled GMT, ~3 h ahead; clamped to now) |
| ~~T24~~ | — | — | ❌ **dropped**: feed is empty |

Sabah, Milliyet, Habertürk and BBC Türkçe also work. Turkish folding maps dotless *ı* to *i*, and the stopword list includes the case suffixes that an apostrophe splits off proper nouns (*Erdoğan'ın*, *Meclis'te*). It also covers light verbs (*etti*, *yaptı*) and the formula words of police-blotter headlines (*operasyon: 26 gözaltı*), which otherwise merged unrelated raids.

**Australia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ABC News | just in | 10 | ✅ (public broadcaster) |
| Guardian Australia | australia-news | 9 | ✅ |
| Sydney Morning Herald | national | 9 | ✅ |
| SBS News | australia | 8 | ✅ (public broadcaster) |
| Australian Financial Review | main feed | 7 | ✅ |
| ~~The Age~~ | — | — | ⏭️ **skipped**: shares most of its copy with the SMH (both Nine), so it would fake multi-outlet clusters |
| ~~news.com.au~~, ~~9News~~ | — | — | ❌ **dropped**: feed is empty / 404 |

**India** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Hindu | national | 10 | ✅ |
| The Indian Express | india | 9 | ✅ |
| Times of India | india | 9 | ✅ |
| Hindustan Times | india-news | 8 | ✅ |
| NDTV | india-news | 8 | ✅ |
| Scroll.in | all articles | 6 | ✅ |
| ~~Deccan Herald~~ | — | — | ❌ **dropped**: 404 |

English-language press only. Hindi outlets would need Hindi stopwords.

**Mexico** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Universal | nación | 10 | ✅ |
| La Jornada | política | 9 | ✅ |
| Reforma | portada | 9 | ✅ (only ~6 items) |
| Excélsior | nacional | 8 | ✅ |
| El Financiero | main feed | 8 | ✅ |
| Expansión | main feed | 7 | ✅ |
| El Sol de México | main feed | 7 | ✅ |
| ~~Milenio~~, ~~Animal Político~~ | — | — | ❌ **dropped**: 404 |
| ~~Proceso~~, ~~SinEmbargo~~ | — | — | ❌ **dropped**: 403 for bots |

**Japan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Asahi Shimbun | headlines | 10 | ✅ (RSS 1.0) |
| Mainichi Shimbun | flash | 9 | ✅ |
| Kyodo News | main feed | 9 | ✅ (10 items) |
| Sankei Shimbun | main feed | 8 | ✅ |
| Jiji Press | ranking | 8 | ✅ (10 most-read items; no general feed) |
| TBS News Dig | main feed | 8 | ✅ |
| HuffPost Japan | main feed | 6 | ✅ |
| ~~NHK~~ | — | — | ❌ **dropped**: feeds abandoned (newest items ~2 months old) |
| ~~Nippon TV News~~ | — | — | ❌ **dropped**: RDF feed has unescaped entities and fails to parse |
| ~~Yomiuri~~, ~~Nikkei~~, ~~Tokyo Shimbun~~, ~~FNN~~ | — | — | ❌ **dropped**: no public feed (404) |

Japanese is written without spaces, so titles are not split on whitespace. Kanji runs become overlapping character bigrams (石破首相 → 石破, 破首, 首相), katakana runs are kept whole (loanwords and foreign names), and hiragana (particles and verb endings) is dropped (`japaneseTokens` in [text.ts](packages/ingest/src/normalize/text.ts)). Titles are NFKC-normalized so full-width Ｇ７ and １１ match G7 and 11, and dakuten are kept, so バス and パス stay distinct.

Arabic attaches the article and some prepositions to the word (الحكومة, والحكومة, للحكومة are all "the government"), and spelling varies in hamza forms and final letters. `arabicTokens` in [text.ts](packages/ingest/src/normalize/text.ts) maps alef variants to ا, ة to ه and ى to ي, drops tatweel and diacritics, turns Arabic-Indic digits into ASCII, then strips one article prefix (ال with an optional و ف ب ك, or لل) if at least three letters remain. Single-letter و/ب/ل prefixes are left alone because too many roots start with them (وزير, بيان, لجنة). The Arabic stopword list goes through the same normalization. Headlines and snippets render with `dir="auto"`, so Arabic text runs right to left.

**Ireland** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| RTÉ News | news | 10 | ✅ (public broadcaster) |
| The Irish Times | Irish news | 10 | ✅ |
| Irish Independent | Irish news | 8 | ✅ |
| TheJournal.ie | main feed | 8 | ✅ |
| Irish Examiner | top news | 8 | ✅ (~9 items) |
| Irish Mirror | Irish news | 6 | ✅ |
| ~~BreakingNews.ie~~ | — | — | ❌ **dropped**: 404 |

**South Africa** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| SABC News | South Africa | 10 | ✅ (public broadcaster; 10 items) |
| Daily Maverick | main feed | 9 | ✅ |
| TimesLIVE | main feed | 9 | ✅ |
| IOL | South Africa | 8 | ✅ |
| eNCA | main feed | 8 | ✅ (10 items) |
| ~~Sowetan~~, ~~BusinessDay~~ | — | — | ⏭️ **skipped**: reprint TimesLIVE copy (all Arena), which faked multi-outlet clusters |
| ~~News24~~, ~~The Citizen~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~EWN~~, ~~Mail & Guardian~~ | — | — | ❌ **dropped**: 404 |

News24 and The Citizen failed on two rounds of URLs; the second round found TimesLIVE and eNCA.

**New Zealand** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| RNZ | national | 10 | ✅ (public broadcaster) |
| NZ Herald | NZ | 9 | ✅ (10 items) |
| 1News | main feed | 9 | ✅ |
| Stuff | main feed | 8 | ✅ |
| Newsroom | main feed | 7 | ✅ (10 items) |
| ~~The Spinoff~~, ~~ODT~~ | — | — | ❌ **dropped**: 404 |

**Argentina** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Clarín | política | 10 | ✅ (10 items) |
| La Nación | main feed | 10 | ✅ |
| Infobae | política | 9 | ✅ |
| TN | main feed | 8 | ✅ |
| Perfil | política | 7 | ✅ |
| Ámbito | política | 7 | ✅ |
| ~~Télam~~ | — | — | ❌ **dropped**: agency shut down (domain gone) |
| ~~Página/12~~ | — | — | ❌ **dropped**: 404 |

Spanish and Portuguese stopwords include weekdays, months and *hoy*/*hoje*. Service headlines ("dólar blue hoy", "a qué hora juega… este martes 6 de octubre") otherwise merged unrelated stories.

**Portugal** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| RTP Notícias | país | 10 | ✅ (public broadcaster) |
| Público | main feed | 10 | ✅ (10 items) |
| Observador | main feed | 9 | ✅ |
| ECO | main feed | 7 | ✅ |
| Correio da Manhã | main feed | 6 | ✅ |
| ~~Expresso~~, ~~JN~~, ~~SIC Notícias~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~Diário de Notícias~~ | — | — | ❌ **dropped**: 404 |

**Austria** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ORF | news | 10 | ✅ (public broadcaster) |
| Der Standard | Inland | 10 | ✅ |
| Die Presse | Innenpolitik | 9 | ✅ |
| Kurier | main feed | 8 | ✅ |
| Kleine Zeitung | Politik | 7 | ✅ |
| Kronen Zeitung | Nachrichten | 7 | ✅ |
| ~~profil~~, ~~Heute~~ | — | — | ❌ **dropped**: 404 |

**Switzerland** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| SRF News | Schweiz | 10 | ✅ (public broadcaster, de) |
| NZZ | Schweiz | 9 | ✅ (de) |
| RTS Info | Suisse | 9 | ✅ (public broadcaster, fr) |
| Tages-Anzeiger | main feed | 8 | ✅ (de) |
| Le Temps | articles | 8 | ✅ (fr) |
| Blick | Schweiz | 7 | ✅ (de) |
| watson | main feed | 6 | ✅ (de) |
| ~~Swissinfo~~ | — | — | ❌ **dropped**: feed gone (410) |

As with Canada, stories cluster only within a language.

**Colombia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Tiempo | política | 10 | ✅ (10 items) |
| Semana | main feed | 9 | ✅ |
| Caracol Radio | main feed | 9 | ✅ |
| El Colombiano | Colombia | 8 | ✅ |
| La Silla Vacía | main feed | 7 | ✅ (10 items) |
| Portafolio | economía | 6 | ✅ |
| ~~El Espectador~~ | — | — | ❌ **dropped**: feed is empty |

**Chile** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| La Tercera | main feed | 10 | ✅ |
| Cooperativa | main feed | 9 | ✅ |
| ADN Radio | main feed | 8 | ✅ |
| La Nación | main feed | 7 | ✅ (10 items) |
| Diario Financiero | main feed | 7 | ✅ |
| The Clinic | main feed | 6 | ✅ (10 items) |
| ~~Emol~~, ~~Meganoticias~~ | — | — | ❌ **dropped**: no answer to bots |
| ~~BioBioChile~~, ~~El Mostrador~~, ~~24 Horas~~, ~~T13~~ | — | — | ❌ **dropped**: 404 |
| ~~CNN Chile~~ | — | — | ❌ **dropped**: malformed XML |

The first round found only three feeds; the second found ADN Radio, La Nación and The Clinic.

**Nigeria** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Punch | main feed | 10 | ✅ |
| Premium Times | main feed | 9 | ✅ |
| Channels TV | main feed | 9 | ✅ |
| Vanguard | main feed | 8 | ✅ |
| Daily Trust | main feed | 8 | ✅ |
| ~~The Guardian (NG)~~, ~~TheCable~~, ~~The Nation~~ | — | — | ❌ **dropped**: 403 for bots |

**Kenya** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Daily Nation | Kenya | 10 | ✅ |
| The Standard | headlines | 9 | ✅ |
| Capital FM | news | 8 | ✅ (10 items) |
| Kenyans.co.ke | news | 7 | ✅ |
| Business Daily | main feed | 6 | ✅ |
| Tuko | all | 6 | ✅ |
| ~~The Star~~, ~~Citizen Digital~~ | — | — | ❌ **dropped**: 404 / 400 |

**Peru** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Comercio | política, perú | 10 | ✅ |
| La República | política | 9 | ✅ |
| RPP Noticias | main feed | 9 | ✅ |
| Andina | agency feed | 8 | ✅ (state news agency) |
| Gestión | main feed | 7 | ✅ |
| ~~Perú21~~, ~~Correo~~ | — | — | ❌ **dropped**: 403 / no answer to bots |

El Comercio's main feed carries foreign SEO pieces (Mexican exchange rates, Argentine TV listings) that clustered with Peruvian stories, so only its Política and Perú sections are used.

**Uruguay** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| la diaria | articles | 9 | ✅ |
| Montevideo Portal | news | 8 | ✅ (8 items) |
| Subrayado | home | 8 | ✅ |
| Teledoce | main feed | 7 | ✅ (10 items) |
| ~~El País~~, ~~El Observador~~, ~~Búsqueda~~ | — | — | ❌ **dropped**: no feed (404 / not RSS) |
| ~~LR21~~ | — | — | ❌ **dropped**: 403 for bots |

**Philippines** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Philippine Daily Inquirer | newsinfo | 10 | ✅ (some dates ahead of now, clamped) |
| Rappler | main feed | 9 | ✅ (10 items) |
| GMA News | news | 9 | ✅ |
| Philstar | headlines | 8 | ✅ (10 items) |
| The Manila Times | news | 7 | ✅ |
| ~~ABS-CBN~~, ~~Manila Bulletin~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~PNA~~, ~~Manila Standard~~ | — | — | ❌ **dropped**: malformed XML |

**Singapore** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Straits Times | Singapore | 10 | ✅ |
| CNA | Singapore | 10 | ✅ |
| The Independent Singapore | main feed | 6 | ✅ |
| ~~The Business Times~~ | — | — | ❌ **dropped**: reprints Straits Times copy (both SPH Media) |
| ~~TODAY~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~Mothership~~ | — | — | ❌ **dropped**: malformed XML |

**Pakistan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Dawn | home | 10 | ✅ |
| The Express Tribune | home | 9 | ✅ |
| Geo News | main feed | 8 | ✅ |
| Business Recorder | latest news | 7 | ✅ |
| ~~The News~~ | — | — | ❌ **dropped**: stale feed (months old) |
| ~~ARY News~~ | — | — | ❌ **dropped**: malformed XML |

**Ghana** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| MyJoyOnline | main feed | 10 | ✅ |
| Graphic Online | news | 9 | ✅ |
| GBC Ghana | main feed | 9 | ✅ (public broadcaster) |
| 3News | main feed | 8 | ✅ |
| Daily Guide | main feed | 7 | ✅ |
| The High Street Journal | main feed | 6 | ✅ (10 items) |
| ~~Citi Newsroom~~ | — | — | ❌ **dropped**: malformed XML |
| ~~GhanaWeb~~, ~~Modern Ghana~~, ~~Pulse~~ | — | — | ❌ **dropped**: 404 / 403 |

**Netherlands** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| NOS | binnenland | 10 | ✅ (public broadcaster) |
| NU.nl | algemeen | 9 | ✅ |
| NRC | main feed | 9 | ✅ |
| de Volkskrant | voorpagina | 9 | ✅ |
| De Telegraaf | main feed | 8 | ✅ |
| AD | home | 8 | ✅ |
| RTL Nieuws | main feed | 8 | ✅ |
| Trouw | voorpagina | 7 | ✅ |

Dutch has its own stopword list (with weekdays and months), and `-en` plurals are folded as in German (*verkiezingen*/*verkiezing*).

**Belgium** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| VRT NWS | articles | 10 | ✅ (public broadcaster, nl) |
| RTBF Info | highlights | 10 | ✅ (public broadcaster, fr) |
| HLN | home | 8 | ✅ (nl) |
| De Morgen | nieuws | 8 | ✅ (nl) |
| La Libre Belgique | Belgique | 8 | ✅ (fr) |
| L'Avenir | main feed | 7 | ✅ (fr) |
| Le Vif | main feed | 6 | ✅ (fr) |
| ~~7sur7~~ | — | — | ❌ **skipped**: the French edition of HLN |
| ~~De Standaard~~, ~~Le Soir~~, ~~Sudinfo~~ | — | — | ❌ **dropped**: 403 for bots |

As with Canada and Switzerland, stories cluster only within a language.

**Sweden** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| SVT Nyheter | main feed | 10 | ✅ (public broadcaster) |
| Dagens Nyheter | main feed | 9 | ✅ |
| Svenska Dagbladet | articles | 9 | ✅ |
| Ekot (Sveriges Radio) | program feed | 9 | ✅ (public radio) |
| Aftonbladet | senaste nytt | 8 | ✅ |
| Expressen | nyheter | 8 | ✅ |
| Göteborgs-Posten | main feed | 7 | ✅ |

Identical titles across Swedish (and Norwegian) papers are TT/NTB wire copy, which every outlet runs, so they count as separate outlets.

**Norway** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| NRK | siste nytt | 10 | ✅ (public broadcaster; toppsaker feed is a day stale) |
| Aftenposten | main feed | 9 | ✅ |
| VG | main feed | 9 | ✅ (10 items) |
| Dagbladet | main feed | 8 | ✅ |
| TV 2 | nyheter | 8 | ✅ |
| Nettavisen | main feed | 7 | ✅ |
| E24 | main feed | 6 | ✅ |

**Denmark** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| DR Nyheder | seneste nyt | 10 | ✅ (public broadcaster) |
| Politiken | seneste nyt | 9 | ✅ |
| Berlingske | main feed | 9 | ✅ (10 items) |
| Ekstra Bladet | all | 7 | ✅ (10 items) |
| ~~B.T.~~ | — | — | ❌ **skipped**: runs Berlingske's copy word for word |
| ~~Jyllands-Posten~~ | — | — | ❌ **dropped**: malformed XML |
| ~~TV 2~~ | — | — | ❌ **dropped**: feed gone |

**Poland** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| TVN24 | najnowsze | 10 | ✅ |
| Rzeczpospolita | main feed | 9 | ✅ |
| Gazeta Wyborcza | najnowsze | 9 | ✅ |
| Polsat News | Polska | 8 | ✅ |
| RMF24 | fakty | 8 | ✅ |
| Onet | wiadomości | 7 | ✅ |
| Wirtualna Polska | wiadomości | 7 | ✅ |
| ~~PAP~~ | — | — | ❌ **dropped**: malformed XML |

Swedish, Norwegian, Danish and Polish have their own stopword lists. They are folded like the tokens, so å, ö and ś lose their marks while ø, æ and ł stay. "Several" (*flera*, *flere*) is a stopword: "flera skadade" merged two unrelated Swedish bus crashes.

**Malaysia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Malaysiakini | English news | 10 | ✅ (10 items) |
| New Straits Times | main feed | 9 | ✅ |
| Free Malaysia Today | main feed | 9 | ✅ (some items in Malay) |
| Malay Mail | Malaysia | 8 | ✅ |
| ~~Bernama~~ | — | — | ❌ **dropped**: undated items would look new on every feed change |
| ~~The Star~~, ~~The Edge~~ | — | — | ❌ **dropped**: 404 |

**Ukraine** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Kyiv Independent | news archive | 10 | ✅ (en) |
| Ukrainska Pravda | English | 9 | ✅ (en) |
| Ukrinform | latest news | 8 | ✅ (state news agency, en) |
| Kyiv Post | main feed | 8 | ✅ (en) |

**Czechia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ČT24 | hlavní zprávy | 10 | ✅ (public broadcaster) |
| iROZHLAS | main feed | 9 | ✅ (public radio) |
| iDNES.cz | zpravodajství | 9 | ✅ |
| Novinky.cz | main feed | 8 | ✅ |
| Seznam Zprávy | main feed | 8 | ✅ |
| Deník N | main feed | 8 | ✅ |
| Aktuálně.cz | main feed | 7 | ✅ |

**Romania** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Digi24 | main feed | 9 | ✅ |
| HotNews.ro | main feed | 9 | ✅ |
| G4Media | main feed | 8 | ✅ (10 items) |
| Adevărul | main feed | 8 | ✅ |
| Libertatea | main feed | 7 | ✅ |
| ~~Agerpres~~ | — | — | ❌ **dropped**: times out |

Czech and Romanian have their own stopword lists; their diacritics all decompose, so the lists are plain ASCII.

**Zimbabwe** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Herald | main feed | 10 | ✅ (10 items) |
| NewsDay | main feed | 9 | ✅ (10 items) |
| NewZimbabwe | main feed | 8 | ✅ |
| 263Chat | main feed | 7 | ✅ (10 items) |
| ~~ZimLive~~, ~~Nehanda Radio~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~The Chronicle~~ | — | — | ❌ **dropped**: empty feed |

**Uganda** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Nile Post | main feed | 9 | ✅ |
| The Observer | main feed | 8 | ✅ (10 items) |
| The Independent (Uganda) | main feed | 8 | ✅ (10 items) |
| SoftPower News | main feed | 6 | ✅ (10 items) |
| KFM | main feed | 6 | ✅ (10 items) |
| ~~Daily Monitor~~, ~~New Vision~~ | — | — | ❌ **dropped**: 403 / 404 |

**Jamaica** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Gleaner | main feed | 10 | ✅ (10 items) |
| Jamaica Observer | main feed | 9 | ✅ |
| Nationwide News Network | main feed | 7 | ✅ (10 items) |
| ~~Radio Jamaica~~ | — | — | ❌ **dropped**: 404 |

Zimbabwe and Jamaica have small feeds, so few of their stories reach two outlets.

**Greece** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ERT News | main feed | 10 | ✅ (public broadcaster) |
| Kathimerini | main feed | 10 | ✅ |
| Ta Nea | main feed | 8 | ✅ |
| Proto Thema | main feed | 8 | ✅ |
| Efimerida ton Syntakton | main feed | 7 | ✅ |
| iefimerida | main feed | 7 | ✅ |
| Naftemporiki | main feed | 6 | ✅ |
| ~~in.gr~~ | — | — | ❌ **skipped**: runs Ta Nea's copy (same group) |

Greek titles fold like the others: tonos marks are stripped and final ς becomes σ, so *εκλογές* and *ΕΚΛΟΓΕΣ* match.

**Hungary** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Telex | main feed | 10 | ✅ |
| HVG | main feed | 9 | ✅ |
| Index | 24 óra | 9 | ✅ |
| 444 | main feed | 8 | ✅ |
| 24.hu | main feed | 8 | ✅ (10 items) |
| Magyar Nemzet | main feed | 8 | ✅ |
| ~~Híradó (MTVA)~~ | — | — | ❌ **dropped**: HTTP 500 |

**Finland** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Yle Uutiset | pääuutiset | 10 | ✅ (public broadcaster) |
| Helsingin Sanomat | tuoreimmat | 10 | ✅ |
| Ilta-Sanomat | tuoreimmat | 8 | ✅ |
| Iltalehti | uutiset | 8 | ✅ |
| MTV Uutiset | uusimmat | 8 | ✅ |
| ~~Kauppalehti~~ | — | — | ❌ **dropped**: 404 |

**Bulgaria** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Dnevnik | main feed | 9 | ✅ |
| Capital | main feed | 8 | ✅ |
| Mediapool | main feed | 8 | ✅ (10 items) |
| 24 Chasa | main feed | 8 | ✅ |
| ~~BNT~~, ~~Sega~~ | — | — | ❌ **dropped**: malformed XML |
| ~~bTV~~ | — | — | ❌ **dropped**: 403 for bots |

**Croatia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Index.hr | main feed | 9 | ✅ |
| Jutarnji list | main feed | 9 | ✅ |
| Večernji list | latest | 9 | ✅ |
| 24sata | aktualno | 7 | ✅ |
| Net.hr | main feed | 7 | ✅ |
| tportal | main feed | 7 | ✅ |
| ~~HRT~~ | — | — | ❌ **dropped**: 404 |

**Serbia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| N1 | main feed | 10 | ✅ |
| Danas | main feed | 9 | ✅ |
| B92 | vesti | 8 | ✅ |
| Blic | današnje vesti | 8 | ✅ |
| ~~Nova~~ | — | — | ❌ **skipped**: runs N1's copy word for word (same group) |
| ~~RTS~~, ~~Politika~~ | — | — | ❌ **dropped**: 404 / 403 |

All Serbian outlets here publish in Latin script. Croatian and Serbian share one stopword list.

**Slovakia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| STVR Správy | main feed | 10 | ✅ (public broadcaster) |
| Denník N | main feed | 9 | ✅ (10 items) |
| SME | titles | 9 | ✅ |
| Aktuality.sk | main feed | 8 | ✅ |
| Pravda | main feed | 8 | ✅ |
| Hospodárske noviny | main feed | 7 | ✅ |
| ~~TERAZ.sk (TASR)~~ | — | — | ❌ **skipped**: Hospodárske noviny runs its copy word for word |

**Estonia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ERR | main feed | 10 | ✅ (public broadcaster) |
| Postimees | main feed | 9 | ✅ |
| Õhtuleht | main feed | 7 | ✅ |
| ~~Delfi~~ | — | — | ❌ **dropped**: 404 |

**Latvia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| LSM | main feed | 10 | ✅ (public broadcaster) |
| Diena | main feed | 8 | ✅ |
| TVNET | main feed | 8 | ✅ |
| Latvijas Avīze | main feed | 7 | ✅ |
| ~~Delfi~~ | — | — | ❌ **dropped**: malformed XML |

**Lithuania** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| 15min | main feed | 9 | ✅ |
| Lrytas | main feed | 8 | ✅ |
| Verslo žinios | main feed | 7 | ✅ |
| ~~LRT~~ | — | — | ❌ **dropped**: 404 |
| ~~Delfi~~ | — | — | ❌ **dropped**: undated items |

Hungarian, Finnish, Estonian, Latvian, Lithuanian, Slovak, Bulgarian and Greek have short stopword lists. These languages inflect heavily, so clustering leans on names and places, and fewer stories reach two outlets (Finland, Slovakia, Estonia and Lithuania especially).

**Morocco** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Hespress FR | main feed | 10 | ✅ (10 items, fr) |
| TelQuel | main feed | 9 | ✅ (fr) |
| Le Desk | main feed | 8 | ✅ (10 items, fr) |
| Les Inspirations ÉCO | main feed | 8 | ✅ (fr) |
| La Vie éco | main feed | 7 | ✅ (fr) |
| Yabiladi | news | 7 | ✅ (8 items, fr) |
| ~~Le360~~, ~~Médias24~~, ~~Le Matin~~, ~~H24~~, ~~MAP~~, ~~SNRT~~ | — | — | ❌ **dropped**: 403 / 404 |

**Algeria** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| TSA Algérie | main feed | 10 | ✅ (10 items, fr) |
| Algérie360 | main feed | 8 | ✅ (fr) |
| Algérie Patriotique | main feed | 7 | ✅ (10 items, fr) |
| Le Jeune Indépendant | main feed | 7 | ✅ (10 items, fr) |
| Algérie Eco | main feed | 6 | ✅ (10 items, fr) |
| Observalgérie | main feed | 6 | ✅ (5 items, fr) |
| ~~El Watan~~, ~~APS~~, ~~Le Quotidien d'Oran~~ | — | — | ❌ **dropped**: unreachable or not RSS |
| ~~Le Soir d'Algérie~~, ~~L'Expression~~, ~~El Moudjahid~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~Radio Algérie~~ | — | — | ❌ **dropped**: stale feed (years old) |

**Tunisia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| La Presse de Tunisie | main feed | 10 | ✅ (10 items, fr) |
| Mosaïque FM | fr | 9 | ✅ (fr) |
| Business News | main feed | 8 | ✅ (10 items, fr) |
| Webdo | fr | 7 | ✅ (fr) |
| Réalités | fr | 7 | ✅ (fr) |
| Leaders | main feed | 7 | ✅ (fr) |
| ~~Kapitalis~~, ~~TAP~~, ~~L'Économiste Maghrébin~~ | — | — | ❌ **dropped**: 404 / unreachable |

The Maghreb countries use their French-language press, which the existing French stopwords cover.

**Egypt** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Al-Masry Al-Youm | main feed | 10 | ✅ (ar) |
| Al-Shorouk | egypt | 9 | ✅ (9 items, ar) |
| Sada El Balad | main feed | 7 | ✅ (ar) |
| Veto | main feed | 7 | ✅ (ar; dates ~3h ahead, clamped) |
| Al-Bawaba News | main feed | 6 | ✅ (ar; dates ~3h ahead, clamped) |
| ~~Al-Ahram~~, ~~Akhbar El Yom~~, ~~Cairo 24~~, ~~Al-Wafd~~, ~~Al-Dostor~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~Youm7~~ | — | — | ❌ **dropped**: undated items |
| ~~Masrawy~~ | — | — | ❌ **dropped**: serves an HTML page |

**Saudi Arabia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Asharq Al-Awsat | main feed | 10 | ✅ (ar; pan-Arab, Saudi-owned) |
| Okaz | main feed | 9 | ✅ (ar) |
| Al-Watan | main feed | 8 | ✅ (ar) |
| Al-Madina | main feed | 7 | ✅ (ar) |
| ~~Sabq~~, ~~Al Arabiya~~, ~~Arab News~~ | — | — | ❌ **dropped**: 403 for bots |

**Lebanon** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| An-Nahar | main feed | 10 | ✅ (ar) |
| LBCI | latest news | 9 | ✅ (20 items, ar) |
| Al-Modon | main feed | 8 | ✅ (ar) |
| ~~Al-Akhbar~~, ~~Al-Joumhouria~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~Al Jadeed~~ | — | — | ❌ **dropped**: serves an HTML page |

An-Nahar and LBCI both run the same wire copy, so their shared stories merge as identical headlines.

**Venezuela** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Nacional | main feed | 10 | ✅ (es) |
| Últimas Noticias | main feed | 8 | ✅ (10 items, es) |
| TalCual | main feed | 8 | ✅ (es) |
| El Pitazo | main feed | 8 | ✅ (10 items, es) |
| Crónica Uno | main feed | 7 | ✅ (10 items, es) |
| ~~Efecto Cocuyo~~ | — | — | ❌ **dropped**: 403 for bots |

**Guatemala** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Prensa Libre | main feed | 10 | ✅ (es) |
| República | main feed | 8 | ✅ (es) |
| La Hora | main feed | 8 | ✅ (10 items, es) |
| Emisoras Unidas | main feed | 6 | ✅ (es; sports-heavy) |
| ~~Soy502~~ | — | — | ❌ **dropped**: malformed beyond repair |
| ~~AGN~~, ~~Plaza Pública~~, ~~Publinews~~ | — | — | ❌ **dropped**: 403 / 404 |

**Dominican Republic** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Diario Libre | portada | 10 | ✅ (es) |
| El Día | main feed | 8 | ✅ (15 items, es) |
| N Digital | main feed | 7 | ✅ (14 items, es) |
| ~~Listín Diario~~, ~~El Caribe~~, ~~CDN~~, ~~El Nuevo Diario~~, ~~Acento~~, ~~Hoy~~ | — | — | ❌ **dropped**: 403 / 404 / unreachable |

**Ecuador** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Universo | main feed | 10 | ✅ (es) |
| El Comercio | main feed | 9 | ✅ (20 items, es) |
| El Mercurio (Cuenca) | main feed | 7 | ✅ (10 items, es) |
| ~~Primicias~~ | — | — | ❌ **dropped**: malformed beyond repair |
| ~~GK~~, ~~Expreso~~, ~~El Telégrafo~~, ~~La Hora~~, ~~Plan V~~, ~~Vistazo~~ | — | — | ❌ **dropped**: 403 / 404 |

**Costa Rica** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Semanario Universidad | main feed | 9 | ✅ (10 items, es) |
| Delfino | main feed | 8 | ✅ (es; dates ~6h ahead, clamped) |
| El Observador | main feed | 7 | ✅ (12 items, es) |
| El Mundo CR | main feed | 7 | ✅ (10 items, es) |
| ~~La Nación~~, ~~CRHoy~~, ~~Teletica~~, ~~Amelia Rueda~~, ~~El Financiero~~, ~~Diario Extra~~ | — | — | ❌ **dropped**: 403 / 404 / malformed |

Costa Rican feeds are small and update a few times a day, so the country has few multi-outlet stories.

**Senegal** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| APS | main feed | 10 | ✅ (fr) |
| Le Soleil | main feed | 9 | ✅ (fr) |
| Le Quotidien | main feed | 8 | ✅ (fr) |
| Dakaractu | main feed | 8 | ✅ (fr) |
| PressAfrik | main feed | 7 | ✅ (fr) |
| E-Media | main feed | 7 | ✅ (fr) |
| Senego | main feed | 6 | ✅ (fr) |
| ~~Leral~~ | — | — | ❌ **skipped**: reprints other outlets' copy (Le Soleil) |
| ~~Sud Quotidien~~ | — | — | ❌ **dropped**: unreachable |

**Côte d'Ivoire** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| AIP | main feed | 10 | ✅ (10 items, fr) |
| L'Infodrome | main feed | 8 | ✅ (fr) |
| L'Intelligent d'Abidjan | main feed | 7 | ✅ (fr) |
| Connection Ivoirienne | main feed | 7 | ✅ (fr) |
| Le Banco | main feed | 6 | ✅ (fr) |
| ~~Fraternité Matin~~, ~~7info~~ | — | — | ❌ **dropped**: 404 |

**Burkina Faso** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Lefaso.net | main feed | 10 | ✅ (fr) |
| Burkina24 | main feed | 8 | ✅ (6 items, fr) |
| Wakat Séra | main feed | 7 | ✅ (10 items, fr) |
| ~~Sidwaya~~, ~~AIB~~, ~~L'Observateur Paalga~~ | — | — | ❌ **dropped**: unreachable / 404 / malformed |

**Mali** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Studio Tamani | main feed | 9 | ✅ (10 items, fr) |
| Journal du Mali | main feed | 9 | ✅ (10 items, fr) |
| Maliactu | main feed | 7 | ✅ (fr) |
| Bamada | main feed | 6 | ✅ (fr) |
| ~~Maliweb~~ | — | — | ❌ **dropped**: 403 for bots |

**Benin** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| La Nouvelle Tribune | main feed | 9 | ✅ (fr) |
| 24 Heures au Bénin | main feed | 8 | ✅ (fr) |
| Bénin Web TV | main feed | 7 | ✅ (fr) |
| Fraternité | main feed | 7 | ✅ (10 items, fr) |
| ~~Banouto~~ | — | — | ❌ **dropped**: 404 |

**Madagascar** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Midi Madagasikara | main feed | 9 | ✅ (fr) |
| Newsmada | main feed | 8 | ✅ (5 items, fr) |
| Madagascar Tribune | main feed | 8 | ✅ (10 items, fr) |
| 2424.mg | main feed | 7 | ✅ (10 items, fr) |
| ~~L'Express de Madagascar~~ | — | — | ❌ **dropped**: malformed beyond repair |

**Zambia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Zambia Daily Mail | main feed | 9 | ✅ (10 items, en) |
| Times of Zambia | main feed | 9 | ✅ (10 items, en) |
| News Diggers! | main feed | 8 | ✅ (9 items, en) |
| Lusaka Times | main feed | 7 | ✅ (10 items, en) |
| Mwebantu | main feed | 6 | ✅ (10 items, en) |
| ~~ZNBC~~ | — | — | ❌ **dropped**: unreachable |

**Malawi** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Nation | main feed | 9 | ✅ (10 items, en) |
| Times 360 Malawi | main feed | 9 | ✅ (10 items, en) |
| Nyasa Times | main feed | 7 | ✅ (10 items, en) |
| Malawi24 | main feed | 7 | ✅ (7 items, en) |

**Sri Lanka** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Island | main feed | 9 | ✅ (10 items, en) |
| EconomyNext | main feed | 8 | ✅ (en) |
| Newswire | main feed | 7 | ✅ (en) |
| ~~Ada Derana~~ | — | — | ❌ **dropped**: undated items |
| ~~Daily Mirror~~, ~~Daily FT~~ | — | — | ❌ **dropped**: malformed beyond repair |

The African and Sri Lankan feeds are small (often 10 items), so these countries show few multi-outlet stories.

**Slovenia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| RTV Slovenija | main feed | 10 | ✅ (20 items, sl) |
| Delo | main feed | 9 | ✅ (sl) |
| 24ur | main feed | 9 | ✅ (20 items, sl) |
| N1 Slovenija | main feed | 8 | ✅ (sl) |
| Siol.net | latest | 8 | ✅ (15 items, sl) |
| Večer | main feed | 8 | ✅ (sl) |
| Žurnal24 | latest | 7 | ✅ (sl) |
| Nova24TV | main feed | 6 | ✅ (sl) |
| ~~Dnevnik~~, ~~Mladina~~ | — | — | ❌ **dropped**: 404 |

**Bosnia and Herzegovina** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Klix.ba | main feed | 10 | ✅ (bs) |
| N1 BiH | main feed | 9 | ✅ (bs) |
| Dnevni avaz | main feed | 8 | ✅ (10 items, bs) |
| Radio Sarajevo | main feed | 8 | ✅ (bs) |
| Fokus.ba | main feed | 7 | ✅ (bs) |
| Istraga.ba | main feed | 6 | ✅ (10 items, bs) |
| ~~Nezavisne novine~~, ~~Hayat~~ | — | — | ❌ **dropped**: 403 for bots |
| ~~Oslobođenje~~, ~~Bljesak~~ | — | — | ❌ **dropped**: 404 |

**Iceland** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| RÚV | fréttir | 10 | ✅ (is) |
| Morgunblaðið | innlent | 9 | ✅ (20 items, is) |
| Vísir | allt | 9 | ✅ (is) |
| Heimildin | main feed | 8 | ✅ (is) |
| DV | main feed | 7 | ✅ (10 items, is) |
| Viðskiptablaðið | main feed | 7 | ✅ (is) |
| ~~Mannlíf~~ | — | — | ❌ **dropped**: undated items |

**Cyprus** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Phileleftheros | main feed | 10 | ✅ (20 items, el) |
| Politis | main feed | 9 | ✅ (10 items, el) |
| Sigmalive | main feed | 8 | ✅ (el) |
| Omega Live | main feed | 7 | ✅ (10 items, el) |
| Cyprus Mail | main feed | 9 | ✅ (20 items, en) |
| ~~Kathimerini Cyprus~~ | — | — | ❌ **dropped**: serves HTML |
| ~~in-cyprus~~, ~~Alpha News~~, ~~Reporter~~ | — | — | ❌ **dropped**: 403 / 404 |

**Luxembourg** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Luxemburger Wort | main feed | 10 | ✅ (de) |
| Luxembourg Times | main feed | 8 | ✅ (en) |
| Le Quotidien | main feed | 8 | ✅ (20 items, fr) |
| Virgule | main feed | 7 | ✅ (fr) |
| ~~RTL~~ | — | — | ❌ **dropped**: serves HTML |
| ~~L'essentiel~~, ~~Tageblatt~~ | — | — | ❌ **dropped**: 404 |

Luxembourg's press is split across German, English and French, and titles only match within one language, so most multi-outlet stories come from the two French outlets.

**Moldova** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Ziarul de Gardă | main feed | 9 | ✅ (10 items, ro) |
| NewsMaker | main feed | 8 | ✅ (10 items, ro) |
| Unimedia | main feed | 8 | ✅ (ro) |
| ~~IPN~~, ~~Agora~~, ~~Deschide~~, ~~Stiri.md~~, ~~Moldpres~~, ~~TV8~~ | — | — | ❌ **dropped**: 403 / 404 / 500 / unreachable |

Not added yet, for lack of usable feeds: Israel (Times of Israel and Haaretz 403, JPost and Ynet stale), Thailand (three feeds of 5–10 items), the UAE (Sky News Arabia and Al Khaleej; 24.ae undated, WAM behind a bot challenge) and Bangladesh (403 or malformed everywhere), South Korea (Korea Herald mostly runs Yonhap's copy, Korea Times stamps items with the fetch time, Hankyoreh's are undated), Taiwan (Taipei Times posts once a day, other feeds 404), Vietnam (two feeds), Indonesia and Tanzania (one usable feed each), Jordan (Royanews and Ammon; Al-Ghad, Addustour and Al-Rai 403), Iraq (Baghdad Today only; Alsumaria, Shafaq, Rudaw and 964 serve HTML or deny bots), Kuwait and Qatar (feeds serve HTML or 403), Paraguay (El Nacional and La Clave; ABC, Última Hora and La Nación 404), Bolivia (Opinión and El Diario; most others 404 or stale), Panama (TVN only; La Prensa's feed is weeks old), Honduras (Proceso Digital plus two feeds of 4–5 items), El Salvador (Co Latino only), Cameroon (Actu Cameroun only in French; Cameroon Tribune 403), Togo, Nepal (Kathmandu Post undated), Rwanda, Namibia, Botswana, Ethiopia (stale or 4-item feeds), Mauritius and Trinidad and Tobago (one usable feed each), Montenegro (Vijesti and CdM; RTCG and Dan 404, Pobjeda and Standard serve HTML).

**Malformed feeds.** Many feeds are not well-formed XML: bare `&`, junk before the first tag, or HTML attributes without values (`<iframe allowfullscreen>`). `parseFeedXml` in [adapters/rss.ts](packages/ingest/src/adapters/rss.ts) tries a strict parse, then a repaired one (leading junk dropped, bare `&` escaped), then sax's loose mode. Loose mode can turn unescaped HTML in a description into child elements, so only string titles and snippets are kept. Each parse attempt has a 10-second timeout: xml2js can drop its callback, and a promise that never settles let Node exit mid-run without saving.

**Encodings.** Feeds are decoded with their declared charset: the `Content-Type` header first, then the XML declaration, else UTF-8 (`decodeBody` in [http.ts](packages/ingest/src/http.ts)). Folha serves ISO-8859-1, which `Response.text()` would garble ("Fl�vio").

When probing a feed, count `<item>`/`<entry>` tags, not lines. Several feeds (The Independent, Süddeutsche, El Mundo) are served on a single line and look empty to `grep -c`. Also check that the newest item is recent: Corriere and The Telegraph return well-formed but stale feeds.

Items without a date take the date from their URL (`/2026/10/06/` or `/20261006/`, see `dateFromUrl` in [normalize/url.ts](packages/ingest/src/normalize/url.ts)) and fall back to the fetch time only if there isn't one. Otherwise an undated feed like Sky TG24's would look entirely brand-new on every run.

Authority weights are editorial judgment calls. They only decide which outlet's headline represents a cluster, not ranking.

## Adding a feed or a country

The Pi is the only machine that polls feeds. On a dev machine, probe the candidates once and then build from the cache:

```bash
pnpm probe <feed-url> [feed-url...]   # one polite request per URL: status, item count, newest/oldest item
pnpm ingest --offline                 # rebuild data/ from data/.cache only: no requests, no publishing
```

`pnpm probe` goes through the same cache as the ingest, so it records each request (the 15-minute limit holds) and keeps the parsed items for `--offline`. To test against current data, first copy the Pi's `data/.cache/http.json` to your machine.

**A feed for an existing country:** add an entry to `SOURCES` in [sources.config.ts](packages/ingest/src/sources.config.ts) with a stable `id`, display `name`, `country`, `language`, `feedUrls` and `authority`.

**A new country:**

1. Add it to `COUNTRIES` in [packages/shared/src/index.ts](packages/shared/src/index.ts) with its ISO 3166-1 alpha-2 code, name, and the camera `lat` / `lng` / `altitude` for the globe.
2. Probe candidate feeds and add 4–6 national outlets to `SOURCES`. Skip outlets that reprint another's copy (The Age/SMH, BusinessDay/TimesLIVE): they fake multi-outlet clusters.
3. If its language has no stopword list yet, add one to `STOPWORDS_BY_LANGUAGE` in [normalize/text.ts](packages/ingest/src/normalize/text.ts). Otherwise clustering will match on function words.
4. Run `pnpm ingest --offline` and read the multi-outlet clusters.
5. Merge, then redeploy the Worker (`COUNTRIES` is bundled into the front end).
6. Hand your probe history to the Pi, so it won't fetch a feed you probed less than 15 minutes ago: copy your `data/.cache/http.json` to the Pi (e.g. `scp data/.cache/http.json pi:/tmp/probe-cache.json`) and run `pnpm cache:merge /tmp/probe-cache.json` there, between two runs (not on a :00/:15/:30/:45 boundary). Then `git pull && pnpm install --frozen-lockfile`. The next run publishes the new country.

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
