# news-globe

An interactive 3D globe. Click a country and you get its top national headlines right now, grouped by story and ranked by how many outlets are covering them.

It covers 175 countries (see [Sources](#sources)); the others are greyed out and marked "coming soon". Open France, Germany, Spain, Italy, the United States, Canada, Australia, Brazil, Mexico, Argentina or India and it splits into its regions (13 French regions, 16 German Länder, 17 Spanish autonomous communities, 20 Italian regions, the 50 US states and DC, 13 Canadian provinces and territories, 8 Australian states and territories, 27 Brazilian states, 32 Mexican states, 24 Argentine provinces, 36 Indian states and union territories), each with its own headlines from regional and local outlets.

- No LLM calls and no paid APIs in the pipeline or the app. The pipeline is RSS plus hand-written text processing. (An LLM only reviews pull requests; see [Quick start](#quick-start).)
- It stores metadata only: headline, the feed's own short snippet, URL, source, time and image URL. It never stores or displays article text, and every headline links out to the publisher.
- Polite fetching: a descriptive User-Agent, conditional GET (ETag / Last-Modified), and **at most one request per feed every 15 minutes**.

## Quick start

Requires Node ≥ 20.11 and pnpm (`corepack enable` gives you the pinned version).

```bash
pnpm install
pnpm dev            # web app on http://localhost:5173 (shows the committed sample data)
pnpm ingest         # one-off run: fetch feeds → data/countries/*.json, data/regions/*.json + data/index.json
pnpm ingest:watch   # run now, then every hour (node-cron)
pnpm test           # vitest (ingest pipeline, Worker, web app and its components)
pnpm coverage       # the same, with a coverage report per package
pnpm --filter @news-globe/web e2e   # Playwright: the WebGL globe in Chromium (once: `pnpm --filter @news-globe/web exec playwright install chromium`)
pnpm typecheck      # all packages
pnpm build          # production build of the web app → apps/web/dist
```

After the first `pnpm ingest`, the dev server serves your fresh output instead of the sample.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `pnpm typecheck`, `pnpm test`, a Vite build and the Playwright tests on every pull request and every push to `main`, then deploys `main` to Cloudflare (see [Deploy](#deploy)).

**LLM review.** [.github/workflows/claude-review.yml](.github/workflows/claude-review.yml) has Claude review every pull request, with inline comments marked 🔴 (blocking) or 🟡 (not blocking) and a summary that ends with `Verdict: ✅ no blocking issues` or `Verdict: ❌ blocking issues`. It only comments: it never pushes, approves or merges. Until the secret below exists, it skips with a notice instead of failing. It signs in with a Claude subscription. Run `claude setup-token` on a machine logged in to Claude Code and save the token as the `CLAUDE_CODE_OAUTH_TOKEN` repository secret. Each review counts against that plan's usage. The workflow needs the Claude GitHub App installed on the repo. It is the only LLM in the project, and it reviews code only: the pipeline and the app still make no LLM calls.

**Shading.** Each country on the globe is shaded by how many outlets covered its top story in the last 24 hours (≤1, 2, 3, 4, 5+; a legend sits in the corner), and hovering shows that headline. The regions of an open country get the same treatment in amber. Both read `topTitle` and `topOutlets` from `index.json`, so no country file is fetched until a click ([lib/heat.ts](apps/web/src/lib/heat.ts)).

**Search.** The search bar at the top (`/` jumps to it) searches every current headline of every country and region as you type; Escape clears it. Matching ignores accents and case, every word must match, and the place name counts too ("budget brittany"). Results are grouped by place, most widely covered first. A result opens its country or region panel, scrolled to that story and highlighted, so the publisher link is one tap away. The index, `/data/search.json` (about 270 KB gzipped, no links), comes from the hourly workflow and loads on the first search ([lib/search.ts](apps/web/src/lib/search.ts)).

**Today.** The **Today** button (or `/#today`) opens the day at a glance: the most widely covered national stories (at most two per country), the stories new or rising this hour, the first cross-border stories, and the stories that have stayed in a country's top 3 for 6 hours or more. Each opens its story page. Headlines are translated on the device where the browser can. The page reads `/data/today.json` (about 4 KB gzipped), which the hourly workflow derives with `trends` and `search` ([derived.ts](packages/ingest/src/derived.ts)).

**Story pages.** A story's **+N other sources** (or **Story details**) button opens its page in the panel: the headline and snippet, a link to the publisher and a **Share** button, its rank at each of today's runs, every outlet covering it in the order they published (the first is marked), and the same story in other countries, each opening its page there. **Also in** chips and the **Across borders** list open these pages too. A page has its own link, `/#FR/<story id>`; if that story has since left the top list, the page says so ([StoryDetail.tsx](apps/web/src/components/StoryDetail.tsx)).

**Rising.** Stories in a country or region panel carry a **New** badge (first ranked this hour) or a **↑ Rising** badge (up 3 or more places since the previous run), and a sparkline of their rank over today's runs. The legend's **Change** switch shades the globe by how many of each place's top 5 stories are new or rising this hour, which shows where the news is moving rather than how widely it's covered. All of this comes from `/data/trends.json`, which the hourly workflow derives from the [history archive](#history-archive) ([derived.ts](packages/ingest/src/derived.ts)). Badges only appear when the file describes the run on screen.

**Across borders.** When the same story is in several countries' top headlines, the **Across borders** chip (`/#world`) lists those stories with each country's headline, and arcs join the countries on the globe. Each story gets an English line: an English-language country's headline when there is one, or else the best-covered headline translated (by the hourly workflow, or on-device where the browser supports it; see [Headline language](#headline-language)). A story in a country's list that runs elsewhere too shows "Also in" links to those countries. The matching uses no translation: see **Link** under [Pipeline details](#pipeline-details).

**History.** The **History** button (in the top bar, and at the top of a country's panel, above its headlines) replays the day: a timeline steps through the day's hourly runs, from the [history archive](#history-archive), and the globe's shading, hover headlines and country panels show that hour. With a country or region open, the timeline sits at the top of its panel, so its headlines change as you move it; otherwise it floats under the globe. Each story in a panel says when it was in the top list and its best rank. The arrows step through earlier days. **Live** returns to the current data. The Worker serves `/data/archive/YYYY-MM-DD.json` straight from KV, still gzipped. Finished days are cached for a day.

**On a phone.** Headlines open in a bottom sheet. Swipe sideways on a country's headlines to move to the next or previous country, in the order of the country row. The top bar shrinks on narrow screens (Today and History become icons). The site can be installed ("Add to Home Screen"; [manifest.webmanifest](apps/web/public/manifest.webmanifest)), and a service worker ([sw.js](apps/web/public/sw.js), production builds only) keeps the app and the last news it loaded, so repeat visits start straight away and the site still opens offline. The page also starts downloading the globe code (about 600 KB gzipped) together with the app, not after it.

**Links.** The open view lives in the URL hash, so it can be shared: `/#FR` opens France and `/#FR-BRE` opens Brittany (a region code names its country). Codes are case-insensitive. Back and Forward step through the views you opened. A story id after a slash opens its page: `/#FR/EAskgXdmb1-3`. A `@` suffix opens History: `/#FR@2026-10-08T14:05` is France at the run of 14:05 UTC that day (or the closest run), and `/#@2026-10-08` is the globe on that day's latest run. Moving the timeline updates the link without adding Back steps. A link to a country or region with no data falls back to the globe or to the country ([lib/route.ts](apps/web/src/lib/route.ts)).

## Layout

```
apps/web/            React + Vite front end (react-globe.gl)
  src/lib/route.ts                 the URL hash (#FR, #FR-BRE) ↔ the open country or region
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
  src/adapters/                    SourceAdapter interface, RSS adapter, GDELT stub
  src/publish.ts                   uploads the JSON to Cloudflare KV as one bundle after each run
packages/shared/     Types for the data contract + country metadata (used by both sides)
data/
  sample/            committed sample output (served until the first ingest)
  index.json, status.json, countries/*.json, regions/*.json, archive/, .cache/   generated, gitignored
deploy/raspberry-pi/ systemd unit for the ingest
```

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

The front end only fetches `${DATA_BASE_URL}/index.json` and `${DATA_BASE_URL}/countries/{CC}.json`. `DATA_BASE_URL` defaults to `/data`. In dev, a small Vite plugin ([apps/web/vite.config.ts](apps/web/vite.config.ts)) serves those two paths from the repo-root `data/` directory and falls back to `data/sample/`. Nothing else is exposed: `data/.cache` returns 404. In production the same two paths are served by a Cloudflare Worker from KV (see [Deploy](#deploy)). To host the data somewhere else instead, upload the same files and build with:

```bash
DATA_BASE_URL=https://dxxxx.cloudfront.net/news pnpm build
```

## Deploy

Live at **https://news-globe.maze-td.workers.dev**.

```
 Raspberry Pi (systemd)                       Cloudflare (free tier)
┌──────────────────────────┐  one KV write   ┌──────────────────────────────────────┐
│ pnpm ingest:watch        │ ──────────────▶ │ KV "news-globe-data"                 │
│  every hour → data/      │  if changed     │   "bundle": index + all countries    │
└──────────────────────────┘                 │ Worker "news-globe"                  │
                                             │   /data/*  → KV (max-age=60)         │
                                             │   anything else → static assets      │
                                             └──────────────────────────────────────┘
```

Why the ingest runs on the Pi rather than on a Cloudflare Cron Trigger: a free-plan Worker gets 10 ms of CPU per invocation, and parsing ~25 feeds and clustering ~400 titles takes far more than that. KV's free tier allows 1,000 writes a day, so the publisher packs `index.json` and every `countries/{CC}.json` into a single `bundle` value (a JSON offset table, then the files back to back; see [bundle.ts](packages/shared/src/bundle.ts)) and uploads it only when its hash changed: at most 24 writes a day, whatever the number of countries. The Worker slices the requested file out of the bundle.

### Front end (Worker + static assets)

Config is in [apps/web/wrangler.jsonc](apps/web/wrangler.jsonc) and the Worker in [apps/web/worker/index.ts](apps/web/worker/index.ts). Static files never invoke the Worker; only `/data/*` does (`run_worker_first`), and it serves only the two public key shapes.

Every push to `main` deploys it: the `deploy` job in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `vite build` and `wrangler deploy` once the `check` job (typecheck, tests, build) has passed. Pull requests are checked but never deployed. To redeploy without a new commit, run the workflow by hand (Actions → CI → Run workflow, on `main`).

It needs two repository secrets (repo → Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: a token made from the **Edit Cloudflare Workers** template at dash.cloudflare.com → My Profile → API Tokens, limited to your account. Keep it separate from the Pi's KV-only token.
- `CLOUDFLARE_ACCOUNT_ID`: the account ID shown on the Workers overview page.

Cloudflare's own Git integration (Workers Builds) should stay disconnected (Worker → Settings → Build), or both would deploy every push.

To deploy from your machine instead:

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
   pnpm ingest                                         # should end with "[publish] uploaded ... as one bundle"
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

Publishing turns on when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` and `CLOUDFLARE_API_TOKEN` are all set, either in the environment or in the repo-root `.env`. If none are set, the ingest only writes local files, as in development. If the upload fails (network, token), the run still writes `data/` but exits with code 1, so it shows as failed (and with `ARCHIVE_AFTER_RUN=1` the watcher skips that run's archive step); the next run retries; [publish.ts](packages/ingest/src/publish.ts) keeps the last bundle's hash in `data/.cache/publish.json`.

### Health check

After each run (not `--offline`), [health.ts](packages/ingest/src/health.ts) writes `data/status.json`, which is published with the other files at `/data/status.json`. It lists every feed whose last request failed (an HTTP error, a timeout, or a body that would not parse) with its last status and last success, plus the **dark** countries and regions: those with no working feed left, whose headlines are therefore frozen.

[.github/workflows/health.yml](.github/workflows/health.yml) checks the live site every hour, at :23, and then adds the latest run to the [history archive](#history-archive) ([check-health.mjs](.github/scripts/check-health.mjs), plain Node). The run **fails** when:

- `index.json` is more than 3 hours old, meaning the Pi is offline or publishing broke, or
- a country or region has been dark for more than 12 hours.

A failed scheduled run makes GitHub email whoever last changed the workflow's schedule (Settings → Notifications → Actions controls this). Shorter outages and single failing feeds show up as warnings and in a table on each run's summary page. Run it on demand with Actions → Health → Run workflow. Set the `SITE_URL` repository variable to check a different deployment.

### History archive

[archive-remote.ts](packages/ingest/src/archive-remote.ts) (`pnpm --filter @news-globe/ingest archive:remote`) reads the published `bundle` from KV, and [archive.ts](packages/ingest/src/archive.ts) folds that run's ranked stories, for every country and region, into one gzipped file per UTC day, stored in the same KV namespace as `archive/YYYY-MM-DD`. Two things run it:
- **The Pi, right after each run**, with `ARCHIVE_AFTER_RUN=1` in its `.env` ([watch.ts](packages/ingest/src/watch.ts)). History, trends, Today and translations then follow every run. Put `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` in the same `.env` for translations. This is the preferred setup: it costs no GitHub Actions minutes, and GitHub often delays or skips scheduled workflows.
- **The [Health workflow](.github/workflows/health.yml)**, as a fallback (and the only archiver until the Pi does it). A run the Pi already archived is skipped, so running both is safe.

Each story gets one record per day and unit (headline, link, outlet ids, first and last run that ranked it, best rank, peak outlet count). A cluster in a later run that shares any article with a story continues that story. Each run also stores its ranked list per unit, so the day can be replayed hour by hour. The format is `ArchiveDay` in [shared](packages/shared/src/index.ts). The Worker serves each day at `/data/archive/YYYY-MM-DD.json` for the History view, and the dev server serves `data/archive/` the same way.

- Derived files: after archiving, the same step writes `trends` (badges, rank histories and change scores for the latest run, about 80 KB gzipped), `search` (every ranked headline with its country or region, about 270 KB gzipped) and `today` (the Today page, about 4 KB gzipped). All three are stored gzipped in KV and served by the Worker as `/data/trends.json`, `/data/search.json` and `/data/today.json`.
- Writes: four KV writes per new run (the day, `trends`, `search`, `today`), plus up to two with translation on (`translations`, `translate-cache`): at most 144 a day on top of the bundle's 24. A run already in the day (the workflow ran twice before the next ingest) is not uploaded again.
- Credentials: the workflow uses the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets of the deploy job. The token's "Edit Cloudflare Workers" template includes Workers KV Storage edit.
- Size: a day built from the sample is about 0.7 MB gzipped, and real days, with new stories every hour, should be about 1.5–2 MB. KV's free 1 GB therefore holds roughly 18 months. Before that, move older days to R2 or start pruning.
- A failed archive step fails the hourly run, so GitHub emails, just like a failed health check.

To update the Pi by hand (e.g. after adding a country; merging it to `main` already redeployed the Worker): `cd ~/news-globe && git pull && pnpm install --frozen-lockfile`. No restart is needed: the watcher starts every run as a fresh `cli.ts` process, so the next run uses the new code and feeds. Only a change to `watch.ts` itself, or to its schedule, needs `sudo systemctl restart news-globe-ingest`.

**Auto-update.** With `AUTO_UPDATE=1` in `.env`, the watcher keeps the Pi on `main` by itself ([update.ts](packages/ingest/src/update.ts)). Before each hourly run it fetches `origin/main` and fast-forwards, then reruns `pnpm install --frozen-lockfile` when `package.json` or the lockfile changed. When the watcher itself changed (`watch.ts`, `update.ts`, `env.ts`, or the schedule, which lives in `watch.ts`), it exits with code 75, so systemd (`Restart=on-failure`) starts it again a minute later on the new code. It never merges, rebases or discards anything: with local changes, a diverged branch, another branch checked out or a failed fetch, it logs why in the journal and runs the code it has. `main` only moves through pull requests whose CI passed. Turning it on takes one last manual update: `git pull && pnpm install --frozen-lockfile`, add `AUTO_UPDATE=1` to `.env`, then `sudo systemctl restart news-globe-ingest`.

**Archive after each run.** With `ARCHIVE_AFTER_RUN=1` in `.env`, the watcher runs the [history archive](#history-archive) step after each successful run (plus translations when the Azure variables are set). A failed archive step is logged and left to the Health workflow.

### Pipeline details

| Step | What it does |
| --- | --- |
| **Fetch** | `HttpCache` ([http.ts](packages/ingest/src/http.ts)) sends `If-None-Match` / `If-Modified-Since` and keeps validators and **parsed items** in `data/.cache/http.json`. A feed requested less than 15 minutes ago is skipped, even on a manual `pnpm ingest`, and its cached items are reused. A 304 also reuses the cached items. A failed feed keeps serving its last good items, and its retry is throttled the same way. Every request in a run is stamped with the run's start time, and the check allows 5 s of slack, so cron jitter never makes a run skip a feed. |
| **Parse** | `rss-parser`. The adapter keeps title, link, the feed's `<description>` (HTML stripped, ~300 chars) and the date (a Google News sitemap gives title, link and date only). Images come from `media:content`, then `media:thumbnail`, then `enclosure`, then the first `<img>`. `content:encoded` (often the full article) is never read into the stored description. |
| **Normalize** | Canonical URL: strip `utm_*`, `fbclid`, `gclid`, `xtor`, `at_*`, `smid` and similar, drop the fragment, lowercase the host, sort the remaining params. `id` is 12 chars of base64url SHA-256 of the canonical URL. Future dates are clamped to now; articles older than 48 h are dropped. |
| **Dedupe** | Exact match on canonical URL. Outlets often list the same article in two section feeds. |
| **Cluster** | Titles are folded (NFD, accents stripped, lowercase, punctuation removed) and FR+EN stopwords and live-blog boilerplate ("EN DIRECT", "LIVE") are dropped. Light suffix folding means *inscrites* ≡ *inscrits* and *lycées* ≡ *lycée*. The pipeline then computes pairwise token-set Jaccard within a country. A cross-outlet pair is a candidate link when similarity ≥ `clusterThreshold` (0.3) **and** the titles share ≥ 2 tokens; two articles from the same outlet are never linked directly. Links are applied strongest first with union-find, and two existing groups only merge if their **average** pairwise similarity is ≥ `clusterMinAverageLink` (0.2). That guard stops one bridging headline from chaining two stories together. |
| **Rank** | First by distinct outlets in the last 24 h, then by most recent article. The representative is the highest-authority outlet, with ties going to the earliest article. "+N other sources" shows one article per other outlet. The top 15 clusters are kept. |
| **Link** | Across countries, without translation: clusters whose headlines share two separate names (people, places, organisations), one of them rare in the run, are the same story. Names are runs of capitalised words, joined across particles ("Corée du Sud") but not punctuation; in title-case headlines, and for a title's first word, only words seen capitalised mid-sentence elsewhere count. Groups merge only on a high average link, as in clustering. Linked clusters get `alsoIn`; the top 20 groups go into `index.json` as `world` ([world.ts](packages/ingest/src/world.ts)). |
| **Write** | Atomic: write to a tmp file, then rename. If every feed for a country fails and nothing is cached, the previous file is kept rather than blanked. |

**Why the threshold is 0.3, not 0.4:** on the live feeds (2026-10-06), headlines about the same story from different outlets mostly scored 0.3–0.5, because French headlines in particular are long and worded differently. On ~200 raw FR feed items, 0.4 produced 5 multi-outlet clusters and 0.3 produced 11. Only one of the 11 was borderline: two different Édouard Philippe pieces. The cluster tests use real headline pairs at the configured threshold.

**Chaining guard (average linkage):** plain union-find is transitive. On the live US feeds, NPR's "Supreme Court's new term kicks off with blockbuster climate change case" scored 0.30 against WaPo's "6 things to watch in the Supreme Court's new term". That one link merged the climate-case story and the new-term story into a single 15-article cluster, headlined by a midterms piece. Requiring an average similarity of 0.2 between the groups being merged splits them back into "climate case" (11) and "new term" (4), while every genuine multi-outlet story (e.g. Hastert, 6 outlets) stays whole. At 0.25, real members started dropping out. [cluster.test.ts](packages/ingest/test/cluster.test.ts) reproduces the chain with those real headlines.

### Headline language

For non-English countries the panel has an **Original / English** toggle. The choice is remembered in `localStorage`.
- **Most-seen headlines, translated hourly** (optional): Today's stories, each country's top story (the globe's tooltips) and the cross-border stories are translated by the [Health workflow](#health-check) with [Azure AI Translator](https://learn.microsoft.com/azure/ai-services/translator/)'s free F0 tier (2M characters a month) and published as `/data/translations.json`. The site shows them wherever English is asked for (Today, the globe's tooltips, a country's list in English mode, story pages), on every device. Each headline is translated once and remembered in KV (`translate-cache`, forgotten after 14 days unused); a monthly budget of 1.8M characters keeps it inside the free tier, and a refused request (quota, key) only stops that run's translating. Without the secrets nothing is translated ([translate.ts](packages/ingest/src/translate.ts)). To set it up:
  1. In the [Azure portal](https://portal.azure.com), create a **Translator** resource with pricing tier **F0 (Free)**. The free tier refuses requests past its limit rather than billing.
  2. From **Keys and Endpoint**, add **Key 1** and the **Location/Region** (e.g. `westeurope`) as repository secrets `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION`.
  3. The next hourly run logs `[translate] N headlines in English`. The first run translates ~250 headlines; later runs only the new ones.
- Other headlines and snippets are translated **in the browser** with the built-in [Translator API](https://developer.chrome.com/docs/ai/translator-api) (Chrome 138+ on desktop). The model runs on-device and nothing is sent to a translation service ([lib/translate.ts](apps/web/src/lib/translate.ts)).
- Where the browser can't translate on-device (phones, Safari, Firefox), foreign headlines get a **Translate ↗** link that opens the headline and snippet in Google Translate (the app on phones that have it): on a country's list in English mode, on every story page, and on Today. Nothing is sent anywhere until the link is tapped.
- Headline links always go to the publisher. A foreign story's page also has **Read in English ↗**, which opens the whole article through Google Translate's web proxy; in a country's list it shows in English mode when the browser translates on-device.
- Browsers without the API (Safari, Firefox, most phones) keep the original for headlines the workflow hasn't translated, with a note pointing to those links.

## Data contract

Types live in [packages/shared/src/index.ts](packages/shared/src/index.ts). `schemaVersion` is currently `1`, and the web app refuses other versions.

`data/index.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-06T08:11:52.000Z",
  "countries": [{
    "code": "FR", "name": "France", "updatedAt": "…", "clusterCount": 15,
    "topTitle": "…",   // the top story's headline        (optional: older files have neither)
    "topOutlets": 4    // its outletCount24h
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

`Article`: `id, url, canonicalUrl, title, description (≤ ~300 chars or null), source {id, name}, sourceCountry, language, publishedAt, imageUrl (or null), countryCode, regionCode (the outlet's region, or null for national outlets)`.

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

**France — regions** (added 2026-10-07)

Regional papers' main feeds carry national and world news too (Sud Ouest's is mostly national), so each outlet uses its local-section feeds. France 3 Régions has one feed per region, so every region has at least one outlet.

| Region | Outlets (feed) | Status |
| --- | --- | --- |
| Auvergne-Rhône-Alpes | France 3, Le Progrès (Rhône), Le Dauphiné libéré (Isère), BFM Lyon, ici (Isère, Pays de Savoie, Saint-Étienne Loire), Lyon Capitale | ✅ (Rue89 Lyon posts about once a day; Lyon Capitale's `actualite` section feed is malformed, so the main feed is used, culture items included; actu.fr 403) |
| Bourgogne-Franche-Comté | France 3, Le Bien Public (Côte-d'Or), Le Journal de Saône-et-Loire, ici (Bourgogne, Besançon), maCommune.info (Besançon, Doubs) | ✅ (the two papers share some regional copy; L'Yonne républicaine and Le Journal du Centre publish no feed; Infos-Dijon's feed is malformed; L'Est Républicain's Doubs section skipped, it is EBRA like the two papers) |
| Brittany | France 3, Le Télégramme (Bretagne), 20 Minutes Rennes, ici (Armorique, Breizh Izel) | ✅ (Ouest-France's only per-place feed, `rss-en-continu.xml?insee=…`, is its national wire; rennes.maville is Ouest-France, the group of 20 Minutes; Le Mensuel de Rennes unreachable; Bretagne Actuelle 403) |
| Centre-Val de Loire | France 3, ici (Orléans, Touraine, Berry), Magcentre, Info Tours | ✅ (La Nouvelle République, 20 Minutes Tours and Orléans 403; La République du Centre, L'Écho républicain, Le Berry 404; La Tribune de Tours unreachable) |
| Corsica | France 3 Corse ViaStella, Corse Net Infos, ici RCFM, Alta Frequenza | ✅ (Corse-Matin has no feed: `/rss`, `/rss.xml`, `/haute-corse/rss`, `/corse-du-sud/rss` 404; Journal de la Corse unreachable) |
| Grand Est | France 3, L'Alsace (Haut-Rhin), L'Est Républicain (Meurthe-et-Moselle), ici (Alsace, Sud Lorraine, Lorraine Nord, Champagne-Ardenne), Rue89 Strasbourg | ✅ (DNA has no section feed; Républicain lorrain's is malformed; L'Union 403; BFM Alsace is mostly programme replays, about one news item a day; Le Journal de la Haute-Marne is mostly mass times and club notices) |
| Hauts-de-France | France 3, ici (Nord, Picardie), BFM Grand Lille | ⚠️ three outlets (La Voix du Nord, Nord Éclair, Courrier picard, Nord Littoral, Wéo, actu.fr 403; BFM Grand Littoral repeats BFM Grand Lille's programmes; 20 Minutes Lille posts every few days and mixes in national news; Le Petit Lillois is LOSC football only; lille.maville has 2 items a day; Mediacités posts a few times a week across four cities) |
| Île-de-France | France 3, BFM Paris, 20 Minutes Paris, ici Paris Île-de-France (`107-1`), 94 Citoyens (Val-de-Marne and inner suburbs) | ✅ (Le Parisien's feeds are undated; actu.fr 403; ici Paris's feed carries some national programme items) |
| Normandy | France 3, ici (Normandie Caen and Rouen, Cotentin), BFM Normandie | ⚠️ three outlets (Paris-Normandie, actu.fr, 20 Minutes Rouen and Caen 403; Tendance Ouest, La Manche Libre 404; Le Poulpe posts every few days; caen.maville has one item a day; rouen.maville unreachable) |
| Nouvelle-Aquitaine | France 3, Sud Ouest (Gironde), La Charente libre (Charente), 20 Minutes Bordeaux, ici (Pays Basque, Gironde, Limousin) | ✅ (Rue89 Bordeaux posts about twice a day) |
| Occitanie | France 3, La Dépêche (Toulouse), Midi Libre (Hérault, Gard), L'Indépendant (Pyrénées-Orientales), 20 Minutes Montpellier, ici (Occitanie (`toulouse`), Hérault, Roussillon) | ✅ |
| Pays de la Loire | France 3, ici (Loire Océan, Maine, Mayenne), Ouest-France (maville Nantes, Angers, Le Mans local feeds), TV Vendée | ✅ (Presse Océan, Courrier de l'Ouest, Maine Libre 404; Ouest-France has no regional feed, but its maville city sites do; BFM Nantes stale, newest item 5 days old; 20 Minutes Nantes and Kernews post every few days; Angers Info unreachable) |
| Provence-Alpes-Côte d'Azur | France 3, Nice-Matin and Var-Matin (Alpes-Maritimes, Var), BFM (Marseille, Côte d'Azur), ici (Provence, Azur, Vaucluse), Made in Marseille | ✅ (La Provence and La Marseillaise publish no feed; Var-Matin's section feed now lives at `nicematin.com/var/rss`; Marsactu posts two or three times a day; BFM Toulon-Var and DICI have no feed) |

The EBRA papers (L'Alsace, L'Est Républicain, Le Bien Public…) sometimes emit an unrendered title, `Vidéo. $content.TitleNoTags`; titles with template placeholders are dropped.

Broadcasters' regional feeds list their programmes next to their articles: BFM's "Le journal de 8h du mercredi 7 octobre 2026", "L'actu du …" and "Le Café …:" / "BFM … et Vous:" segments, and ici's daily fuel-price finder. `isNotNews` drops these (and TV Vendée's "Le journal de la Vendée du …", ici's ticket giveaways), plus items labelled as sponsored. On the 2026-10-07 cache it matched 27 of 33,230 distinct titles, all of them programmes.

Some local outlets post in bursts (TV Vendée, Lyon Capitale) and would fill a region's list with their latest items, so each outlet gets at most 3 single-outlet stories in a top 15 (`maxSoloStoriesPerOutlet`) before the others; the overflow only fills slots left empty. It applies to countries too.

Each region's ici (ex-France Bleu) stations are one outlet with several feeds (their `rubrique/infos.xml` feeds; slugs don't always match the station name: Paris is `107-1`, Occitanie is `toulouse`). The stations share regional stories, so separate entries would make one station's story look like coverage by several outlets. The copies' URLs differ only by `at_locale`, which is stripped as a tracking param so they dedupe. BFM's Marseille and Côte d'Azur channels, and Nice-Matin's Alpes-Maritimes and Var sections, are likewise one outlet each with two feeds. maville's city sites carry Ouest-France copy, so they are one Ouest-France outlet.

**Germany — Länder** (added 2026-10-07)

Each Land has one public-broadcaster outlet: either its own regional feed or tagesschau.de's regional page for it (`tagesschau.de/inland/regional/<land>/index~rss2.xml`), never both, since the page republishes that broadcaster. tagesschau.de is used where the broadcaster's own feed mixes in national news (SWR) or is thin (WDR) or missing (SR). Papers use their local or Land section feeds; the main feeds carry national and world news. Papers of one group (Funke, Madsack, Ippen) share copy, so a Land gets at most one per group unless they cover different areas.

| Land | Outlets (feed) | Status |
| --- | --- | --- |
| Baden-Württemberg | SWR (tagesschau.de BW page), Badische Neueste Nachrichten (`karlsruhe`), Rhein-Neckar-Zeitung (regio ticker), t-online Stuttgart | ✅ (SWR's own BW feed mixes in tagesschau national stories; Stuttgarter Zeitung/Nachrichten, Südkurier, Heilbronner Stimme, gea.de, Schwarzwälder Bote have no feed (404); Badische Zeitung 410; Schwäbische 404/403; Mannheimer Morgen 403; SWP has no feed; ka-news mixes in national news; pz-news 410) |
| Bavaria | BR24 (its seven Regierungsbezirk boards), Süddeutsche Zeitung (`Bayern`), Augsburger Allgemeine (`bayern`), Nürnberger Nachrichten (`region`), Abendzeitung München, Merkur (`bayern`) | ✅ (BR24's homepage feed carries national and world news; tagesschau.de's Bavaria page has about two items a day; SZ München feed 404) |
| Berlin | rbb24 Berlin, Tagesspiegel (`berlin`), Berliner Morgenpost (`berlin`), t-online Berlin | ✅ (B.Z. feeds 404; Berliner Zeitung only has its mixed main feed; Tagesspiegel's Berlin feed carries a few non-Berlin dpa items) |
| Brandenburg | rbb24 Brandenburg, Märkische Allgemeine (`brandenburg`), Tagesspiegel Potsdam, Niederlausitz aktuell | ✅ (MOZ and Lausitzer Rundschau have no feed) |
| Bremen | buten un binnen, Weser-Kurier (`bremen`), Kreiszeitung (`lokales/bremen`), t-online Bremen | ✅ |
| Hamburg | NDR Hamburg, Hamburger Abendblatt (`hamburg`), Hamburger Morgenpost (`hamburg`), t-online Hamburg | ✅ |
| Hesse | hessenschau, FAZ Rhein-Main, Frankfurter Rundschau (`frankfurt`), HNA (`kassel`) | ✅ (FR and HNA are both Ippen, but Frankfurt and North Hesse) |
| Mecklenburg-Vorpommern | NDR MV, Ostsee-Zeitung (`mecklenburg-vorpommern`) | ⚠️ two outlets (Nordkurier and SVZ, which now redirects to it, have no feed found, `.xml` 403; Katapult MV had no item in 24 h; Ostseewelle 404; Antenne MV redirects to another station) |
| Lower Saxony | NDR Niedersachsen, Hannoversche Allgemeine (`lokales/hannover`), Neue Osnabrücker Zeitung (`lokales/osnabrueck`), Braunschweiger Zeitung (`niedersachsen`), t-online Hannover | ✅ (HAZ category feeds empty; Braunschweiger's `braunschweig` feed is stale and the main one mixed; Göttinger Tageblatt category empty; NWZ has no feed found) |
| North Rhine-Westphalia | WDR (tagesschau.de NRW page), Rheinische Post (`nrw`), Kölner Stadt-Anzeiger (`koeln`), Westfälische Nachrichten (`wn_muenster`) | ✅ (WDR's own feeds have 5–11 items a day, the tagesschau.de page several times that; WAZ `rhein-und-ruhr` has two a day; WN's main feed is national and world) |
| Rhineland-Palatinate | SWR (tagesschau.de RP page), Rhein-Zeitung (Koblenz), Trierischer Volksfreund (`region`), Allgemeine Zeitung (`lokales/mainz`), lokalo.de | ✅ (Rheinpfalz has no feed found; Pfalz-Express mixes in national news; the Volksfreund shares some RP Mediengruppe copy with the Saarbrücker Zeitung) |
| Saarland | SR (tagesschau.de Saarland page), Saarbrücker Zeitung (`saarland`), Saarnews | ⚠️ three outlets (SR publishes no news feed of its own; sol.de 403) |
| Saxony | MDR Sachsen, Leipziger Volkszeitung (`lokales/leipzig`), Dresdner Neueste Nachrichten (`lokales/dresden`), Freie Presse (`chemnitz`) | ✅ (LVZ and DNN are both Madsack, but Leipzig and Dresden; Sächsische Zeitung 403; Freie Presse's Sachsen feed has three items a day) |
| Saxony-Anhalt | MDR Sachsen-Anhalt, Altmark Zeitung (`altmark`), Du bist Halle, Halle Spektrum | ✅ (Volksstimme and Mitteldeutsche Zeitung have no feed, only news sitemaps; magdeburg-klickt stale; Halle Spektrum posts about five times a day) |
| Schleswig-Holstein | NDR Schleswig-Holstein, Kieler Nachrichten (`schleswig-holstein`), shz | ⚠️ three outlets (Lübecker Nachrichten works but is Madsack like the KN) |
| Thuringia | MDR Thüringen, Thüringer Allgemeine (`lokales`), inSüdthüringen | ⚠️ three outlets (OTZ and TLZ are Funke like the TA; TA's `thueringen` feed 404) |

Broadcasters' feeds list bulletins and programmes next to stories (NDR's "Nachrichten aus dem Studio Lüneburg", "Regionalnachrichten aus Rostock", "Nordmagazin | 06.10.2026"; buten un binnen's "Dein Audio-Update am …"; MDR Thüringen's section pages "Meldungen", "Region Mitte"), and papers post daily roundups, giveaways and lottery numbers. `isNotNews` drops these; on the 2026-10-07 cache its German patterns matched 58 titles, all from German feeds.

Most of a region's headlines name it, and hyphenated names split into two title tokens ("Sachsen-Anhalt" → `sachsen`, `anhalt`), which alone would meet the two-shared-token minimum. A region's names (English and local, `localNames` in `REGIONS`) still count in the similarity score but not toward that minimum.

**United States — states** (added 2026-10-07)

Each of the 50 states and DC has 3–14 local outlets (257 in all), from public radio, metro and state papers, nonprofit newsrooms and local TV. The full candidate lists, with each rejected feed and why, are in the PRs: [Northeast](https://github.com/benjamin-gaultier/news-globe/pull/41), [Midwest](https://github.com/benjamin-gaultier/news-globe/pull/40), [South](https://github.com/benjamin-gaultier/news-globe/pull/43), [West](https://github.com/benjamin-gaultier/news-globe/pull/42). Sources live in `packages/ingest/src/sources/us-states-*.ts`.

| State | Outlets | Status |
| --- | --- | --- |
| Alabama | AL.com, WSFA 12 News, WKRG News 5, Alabama Daily News, Alabama Political Reporter | ✅ |
| Alaska | Alaska Public Media, KTOO Juneau, Juneau Empire, Alaska's News Source (KTUU) | ✅ |
| Arizona | KJZZ, Arizona Capitol Times, Arizona Luminaria, Tucson Sentinel, Cronkite News, Arizona's Family (KTVK/KPHO), KGUN 9 Tucson | ✅ |
| Arkansas | Arkansas Democrat-Gazette, Little Rock Public Radio (KUAR), Arkansas Times, Talk Business & Politics, KARK 4, KAIT 8 | ✅ |
| California | CalMatters, Los Angeles Times (California), LAist, KTLA 5, KQED, SFGATE, The San Francisco Standard, Mission Local, KRON 4, KPBS, Voice of San Diego, Times of San Diego, FOX 5 San Diego, FOX40 Sacramento | ✅ |
| Colorado | Colorado Public Radio, The Colorado Sun, Denverite, FOX31 Denver (KDVR) | ✅ |
| Connecticut | Connecticut Public, WSHU Public Radio, CT Mirror, CT News Junkie, WTNH News 8, New Haven Independent | ✅ |
| Delaware | Spotlight Delaware, Delaware Public Media, Delaware LIVE, WGMD 92.7 (Sussex County) | ✅ (low volume, few shared stories) |
| District of Columbia | The Washington Post (Local), WTOP News (DC), DC News Now (WDCW), The Washington Informer, The 51st | ✅ |
| Florida | Tampa Bay Times, WUSF, WFLA News Channel 8, WKMG News 6 ClickOrlando, WPLG Local 10, WCTV | ✅ |
| Georgia | Atlanta News First (WANF), WSB-TV, The Current GA, Rough Draft Atlanta | ✅ |
| Hawaii | Hawaiʻi Public Radio, Honolulu Star-Advertiser, Honolulu Civil Beat, KHON2, Maui Now | ✅ |
| Idaho | Boise State Public Radio, Idaho News 6 (KIVI), CBS2 Idaho News (KBOI), KMVT Twin Falls, Idaho Education News | ✅ (Boise State Public Radio and Idaho Education News post 1–3 items a day) |
| Illinois | Chicago Sun-Times, Block Club Chicago, Capitol News Illinois, WCBU Peoria, WGN-TV | ✅ |
| Indiana | Mirror Indy, FOX59, WISH-TV, WANE 15 Fort Wayne | ✅ (WFYI, Indiana Public Media, Indiana Capital Chronicle, IBJ and IndyStar dead or blocked) |
| Iowa | Iowa Public Radio, Quad-City Times, KCRG Cedar Rapids, WHO 13 Des Moines | ✅ |
| Kansas | KMUW Wichita, The Lawrence Times, KSN Wichita, KWCH 12, KSAL Salina | ✅ |
| Kentucky | Louisville Public Media, WKYT, LEX 18, LINK nky | ✅ |
| Louisiana | NOLA.com, The Lens, Verite News, WGNO, KSLA 12 | ✅ |
| Maine | Portland Press Herald, Bangor Daily News, Maine Public, The Maine Monitor, WABI TV5 | ✅ |
| Maryland | The Baltimore Banner, WYPR, WTOP News (Maryland), Baltimore Fishbowl, DC News Now (Maryland) | ✅ |
| Massachusetts | GBH News, Boston.com, CommonWealth Beacon, NBC Boston, Universal Hub | ✅ (GBH local feed about 4 items a day; WBUR and Boston Globe metro have no usable feed) |
| Michigan | Michigan Public, MLive, Bridge Michigan, WDET, WXYZ Detroit | ✅ |
| Minnesota | MPR News, Star Tribune, MinnPost, Sahan Journal, Bring Me The News | ✅ |
| Mississippi | Mississippi Today, Mississippi Free Press, WLBT 3, WJTV 12, SuperTalk Mississippi | ✅ |
| Missouri | St. Louis Public Radio, St. Louis American, Missourinet, KSHB 41 Kansas City, KY3 Springfield | ✅ |
| Montana | Montana Free Press, Flathead Beacon, MTN News (KTVQ / KPAX) | ⚠️ three outlets (Lee papers blocked; Daily Montanan 403; MTPR feed stale). Flathead Beacon reruns Montana Free Press stories |
| Nebraska | Flatwater Free Press, KMTV 3 News Now Omaha, KLKN Lincoln, KOLN 10/11 Lincoln | ✅ (Omaha World-Herald 429; KOLN reruns Flatwater Free Press stories) |
| Nevada | Las Vegas Review-Journal, The Nevada Independent, KUNR Public Radio, 8 News Now (KLAS), This Is Reno | ✅ |
| New Hampshire | New Hampshire Public Radio, Concord Monitor, The Keene Sentinel, InDepthNH, Manchester Ink Link | ✅ |
| New Jersey | New Jersey 101.5, Jersey City Times, Jersey Shore Online, Montclair Local, Morristown Green | ✅ but no statewide daily or public broadcaster (NJ Spotlight News 503, New Jersey Monitor 403, NJ.com feeds mostly national) |
| New Mexico | KUNM, Searchlight New Mexico, KRQE News 13, KTSM Las Cruces | ✅ (low volume: KUNM and KTSM post about once a day; Albuquerque Journal feed malformed; KOB about 40% AP) |
| New York | Gothamist, amNY, THE CITY, Syracuse.com, WXXI News, BTPM (WBFO), WAMC Northeast Public Radio, 7 News WKBW | ✅ |
| North Carolina | WFAE, WBTV, CBS 17 (WNCN), Port City Daily | ✅ |
| North Dakota | KX News, Valley News Live, Minot Daily News | ⚠️ three outlets (Bismarck Tribune 429; KFYR shares copy with Valley News Live). Valley News Live also covers Moorhead, Minnesota |
| Ohio | cleveland.com, WOSU, WVXU, Signal Cleveland, WCPO Cincinnati | ✅ |
| Oklahoma | Oklahoma Watch, NonDoc, Tulsa Flyer, Oklahoma City Free Press, KFOR 4, KTUL 8 | ✅ |
| Oregon | OPB, The Oregonian/OregonLive, KOIN 6, Lookout Eugene-Springfield, Salem Reporter | ✅ |
| Pennsylvania | Pittsburgh Post-Gazette, WHYY, WESA, Spotlight PA, PhillyVoice, PublicSource | ✅ (Philadelphia Inquirer section feeds empty, its news feed mixes in national and world) |
| Rhode Island | WPRI 12, Uprise RI, What'sUpNewp, ecoRI News | ✅ (Rhode Island Current 403; The Public's Radio has no usable feed; ecoRI posts about once a day) |
| South Carolina | WSPA 7News, Live 5 News (WCSC), Charleston City Paper, Greenville Journal | ✅ |
| South Dakota | South Dakota News Watch, KELOLAND, Dakota News Now | ⚠️ three outlets (KOTA shares copy with Dakota News Now) |
| Tennessee | Chattanooga Times Free Press, WPLN, Nashville Banner, WSMV 4, WREG News Channel 3 | ✅ |
| Texas | Houston Public Media, The Texas Tribune, San Antonio Report, Fort Worth Report, El Paso Matters, KXAN, KSAT 12, FOX 4 Dallas-Fort Worth, KWTX 10 | ✅ |
| Utah | KUER, The Salt Lake Tribune, Deseret News, ABC4 Utah (KTVX), FOX 13 Salt Lake City | ✅ |
| Vermont | Vermont Public, Valley News, VTDigger, WCAX | ✅ |
| Virginia | WHRO, WTOP News (Virginia), WRIC 8News, WDBJ7, Cardinal News | ✅ |
| Washington | The Seattle Times, KNKX, KOMO News, The Everett Herald, The Columbian | ✅ |
| West Virginia | The Dominion Post, Parkersburg News and Sentinel, WOWK 13 News, WSAZ | ✅ (the two newspaper feeds carry some obituaries and opinion) |
| Wisconsin | Wisconsin Public Radio, Wisconsin Watch, Urban Milwaukee, TMJ4 Milwaukee | ✅ |
| Wyoming | WyoFile, Oil City News, Buckrail, SweetwaterNOW, Sheridan Media | ✅ |

Whole groups are unreachable to our User-Agent: every States Newsroom site (the state "Mirror", "Current", "Lookout" papers) returns 403, MediaNews papers 403, Hearst TV stations 451, Lee/TownNews BLOX papers 429 or 451, Gannett feeds are dead, and Tegna's syndication feeds don't parse. Feeds that work:

- NPR member stations on the Grove CMS accept `.rss` after any section page (`/local-news.rss`); the station-wide `/news.rss` mixes in NPR national stories.
- Gray TV and Nexstar stations' main feeds carry group-wide national stories; their `category/news/local` (or `category/news`) feeds don't.
- Sister stations and papers share copy (Gray stations in one state, Bridge Michigan and BridgeDetroit, Oil City News and County 17), so a state gets at most one of each pair.

Partners also rerun each other's stories under the same headline (CT Mirror on Connecticut Public and WSHU, Spotlight PA on WESA, NHPR on the Concord Monitor). In region files only the earliest copy of a headline is kept (`dropRepublished`), so a rerun doesn't count as a second outlet covering the story. An outlet's own repeats go too (ANSA posting a story twice under two URLs, Pamplona Actual one press release four times), since stories from one outlet never cluster and each copy would take its own place in the top stories.

US local feeds carry recurring segments next to stories: forecasts ("Q2 Billings Area Weather: …", "Your Mississippi forecast for Wednesday, October 7"), newscasts ("WHYY Newscast for Tuesday 5:00 p.m."), daily headline digests, opinion and letters, obituaries and death notices, arrest reports, lottery numbers, "things to do" lists, restaurant inspections, photo galleries and podcast episodes. `isNotNews` drops these; on the 2026-10-07 cache the English patterns matched 182 US titles, and outside the US only the Globe and Mail's "Morning Update" newsletter, a few editorials and one NDR podcast.

**Spain — autonomous communities** (added 2026-10-07)

Each of the 17 autonomous communities (Ceuta and Melilla are left out) has 3–8 regional outlets (98 in all): regional public broadcasters, the main regional papers' local section feeds, and digital outlets, with elDiario.es's regional edition in all of them and Europa Press's regional desk in the centre and south. Catalan, Galician and Basque outlets are tagged `ca`, `gl` and `eu`, with their own stopwords. The candidate lists, with each rejected feed and why, are in the PRs: [north](https://github.com/benjamin-gaultier/news-globe/pull/49), [centre, south and islands](https://github.com/benjamin-gaultier/news-globe/pull/50). Sources live in `packages/ingest/src/sources/es-regions-*.ts`.

| Community | Outlets | Status |
| --- | --- | --- |
| Andalusia | Canal Sur, Diario de Sevilla, Diario de Cádiz, ABC Sevilla, Sur (Málaga), Ideal (Granada), elDiario.es Andalucía, Europa Press Andalucía | ✅ (two Joly and three Vocento titles, each for a different city) |
| Aragon | Heraldo de Aragón, Diario del AltoAragón, Aragón Digital, El Español Aragón, COPE Aragón, elDiario.es Aragón | ✅ (Aragón TV and Diario de Teruel have no usable feed) |
| Asturias | El Comercio, La Voz de Asturias, Nortes, miGijón, COPE Asturias, elDiario.es Asturias | ✅ (RTPA's feed swaps day and month) |
| Balearic Islands | IB3, Última Hora, Ara Balears, Noudiari (Eivissa), elDiario.es Illes Balears, Europa Press Illes Balears | ✅ |
| Basque Country | El Correo (Bizkaia, Álava), Diario Vasco (Gipuzkoa), Berria, Naiz, elDiario.es Euskadi | ⚠️ few shared stories: the outlets cover different provinces in two languages (EITB's feeds stopped in June 2025) |
| Canary Islands | Canarias7, Diario de Avisos, Canarias Ahora (elDiario.es), Atlántico Hoy, Europa Press Canarias | ✅ (RTVC has no usable feed) |
| Cantabria | El Diario Montañés, Alerta, El Diario Cantabria, El Faradio, elDiario.es Cantabria | ✅ |
| Castile and León | El Norte de Castilla, Diario de León, Diario de Burgos, La Gaceta de Salamanca, Heraldo-Diario de Soria, El Español Castilla y León, elDiario.es Castilla y León | ✅ (RTVCyL refuses connections) |
| Castilla-La Mancha | El Digital Castilla-La Mancha, Lanza (Ciudad Real), Nueva Alcarria (Guadalajara), encastillalamancha.es, elDiario.es Castilla-La Mancha, Europa Press Castilla-La Mancha | ✅ (Castilla-La Mancha Media has no usable feed) |
| Catalonia | 3Cat, La Vanguardia, El Punt Avui, Segre, betevé, Nació Digital, elDiario.es Catalunya | ✅ (Segre and Nació Digital carry some Catalan-politics stories; a story covered in Catalan and in Spanish stays two clusters) |
| Extremadura | Hoy, elDiario.es Extremadura, Europa Press Extremadura | ⚠️ three outlets (Canal Extremadura's feed has no dates; Región Digital reruns Europa Press copy) |
| Galicia | La Voz de Galicia, Nós Diario, El Progreso (Lugo), Diario de Pontevedra, Praza, Galiciapress, elDiario.es Galicia | ✅ (CRTVG has no usable feed) |
| La Rioja | La Rioja, Rioja2 (elDiario.es La Rioja), COPE La Rioja | ⚠️ three outlets (NueveCuatroUno 403; Noticias de La Rioja's feed doesn't parse) |
| Madrid | Telemadrid, El País (Madrid), El Mundo (Madrid), ABC (Madrid), Madridiario, elDiario.es Madrid, 20minutos (Madrid), Europa Press Madrid | ✅ (city and Comunidad desks; some national stories set in Madrid get through) |
| Murcia | La Verdad, Murcia Plaza, Murcia Diario, Cartagena Actualidad, elDiario.es Murcia, Europa Press Región de Murcia | ✅ (Onda Regional's feed is empty) |
| Navarre | Diario de Navarra, Navarra.com, Pamplona Actual, COPE Navarra, elDiario.es Navarra | ✅ |
| Valencian Community | À Punt, Las Provincias, Valencia Plaza / Alicante Plaza, elDiario.es Comunitat Valenciana, Europa Press Comunitat Valenciana | ⚠️ few shared stories (Levante-EMV and Información blocked, see below) |

Prensa Ibérica (Faro de Vigo, La Nueva España, El Periódico, Levante-EMV, Información, Diario de Mallorca, La Provincia, El Día, La Opinión de Murcia…) and Grupo Noticias (Deia, Noticias de Navarra, Noticias de Gipuzkoa) return 406 to any User-Agent that names itself as a bot, so they are left out rather than fetched with a browser's. RTVE's per-community feeds stopped in 2022. Vocento's feeds are per section (`/rss/2.0/?section=…`); its Madrid and national sections are left out.

**Italy — regions** (added 2026-10-07)

Each of the 20 regions has 5–9 outlets (123 in all): RAI TGR's regional newsroom (`rainews.it/tgr/<region>/rss/tutti`; Trento and Bolzano as one source) and ANSA's regional desk in every region, the local editions of Corriere della Sera, la Repubblica, the QN papers and the regional dailies, and digital locals (Citynews and others). salto.bz is tagged `de`. The candidate lists, with each rejected feed and why, are in the PRs: [north](https://github.com/benjamin-gaultier/news-globe/pull/52), [centre, south and islands](https://github.com/benjamin-gaultier/news-globe/pull/51). Sources live in `packages/ingest/src/sources/it-regions-*.ts`.

| Region | Outlets | Status |
| --- | --- | --- |
| Abruzzo | TGR Abruzzo, ANSA Abruzzo, Rete8, AbruzzoLive, Ekuonews | ✅ (Il Centro has no feed; Il Messaggero's feeds have no dates) |
| Aosta Valley | TGR Valle d'Aosta, ANSA Valle d'Aosta, AostaSera, Valle d'Aosta Glocal, AostaNews24, Gazzetta Matin | ✅ |
| Apulia | TGR Puglia, ANSA Puglia, La Gazzetta del Mezzogiorno, Corriere del Mezzogiorno (Bari), la Repubblica Bari, LeccePrima, Telenorba | ✅ (Quotidiano di Puglia's feeds have no dates) |
| Basilicata | TGR Basilicata, ANSA Basilicata, SassiLive, Basilicata24, Potenza News, ivl24 | ✅ (TRM carries Bari stories) |
| Calabria | TGR Calabria, ANSA Calabria, Gazzetta del Sud (Calabria), Corriere della Calabria, CatanzaroInforma | ✅ |
| Campania | TGR Campania, ANSA Campania, Corriere del Mezzogiorno (Napoli), la Repubblica Napoli, Irpinianews, Il Meridiano News, Anteprima24 | ✅ (Il Mattino's feeds have no dates; NapoliToday 403) |
| Emilia-Romagna | TGR Emilia-Romagna, ANSA Emilia-Romagna, Corriere di Bologna, la Repubblica Bologna, il Resto del Carlino (city editions), BolognaToday / ParmaToday, Estense.com (Ferrara), newsRimini, Reggionline (Telereggio) | ✅ (Carlino's `/rss/bologna.xml` is all editions, Marche included; its city feeds are `/{city}/rss`) |
| Friuli-Venezia Giulia | TGR Friuli Venezia Giulia, ANSA Friuli Venezia Giulia, Il Friuli, Friuli Oggi, Trieste News, Pordenone Oggi | ✅ (Messaggero Veneto and Il Piccolo have no feeds) |
| Lazio | TGR Lazio, ANSA Lazio, la Repubblica Roma, RomaToday, Latina Oggi / Ciociaria Oggi, Il Faro online | ✅ (Corriere's Roma section mixes in national politics) |
| Liguria | TGR Liguria, ANSA Liguria, la Repubblica Genova, GenovaToday, Genova24 / IVG / Riviera24, Città della Spezia, Levante News (Tigullio) | ✅ (Il Secolo XIX 429) |
| Lombardy | TGR Lombardia, ANSA Lombardia, Corriere della Sera (Milano, Bergamo, Brescia), la Repubblica Milano, Il Giorno, L'Eco di Bergamo, MilanoToday / BresciaToday | ✅ |
| Marche | TGR Marche, ANSA Marche, il Resto del Carlino (Marche editions), Cronache Maceratesi, CentroPagina | ✅ (Corriere Adriatico's feeds have no dates) |
| Molise | TGR Molise, ANSA Molise, isNews, TermoliOnLine, Molise Network | ✅ (small outlets) |
| Piedmont | TGR Piemonte, ANSA Piemonte, Corriere Torino, la Repubblica Torino, Quotidiano Piemontese, NovaraToday | ✅ (La Stampa's local feeds redirect to its national front page; TorinoToday 403) |
| Sardinia | TGR Sardegna, ANSA Sardegna, Casteddu Online, Vistanet Cagliari, Gallura Oggi | ⚠️ no regional daily (L'Unione Sarda's only feed is about 40% national and world; La Nuova Sardegna has no feed) |
| Sicily | TGR Sicilia, ANSA Sicilia, la Repubblica Palermo, Giornale di Sicilia (Palermo), Gazzetta del Sud (Messina), CataniaToday, BlogSicilia, NewSicilia | ✅ (GdS and Gazzetta del Sud share a publisher but cover different cities) |
| Trentino-South Tyrol | TGR Trento and Bolzano, ANSA Trentino-Alto Adige, Corriere del Trentino / Corriere dell'Alto Adige, il Dolomiti, TrentoToday, salto.bz | ✅ (L'Adige's and Alto Adige's feeds are mostly national wire copy; stol.it/Dolomiten mixes in world news) |
| Tuscany | TGR Toscana, ANSA Toscana, la Repubblica Firenze, Corriere Fiorentino, La Nazione (Firenze) | ✅ (Il Tirreno has no feed; FirenzeToday is mostly listings) |
| Umbria | TGR Umbria, ANSA Umbria, La Nazione Umbria, PerugiaToday, Umbria 24, TuttOggi | ✅ |
| Veneto | TGR Veneto, ANSA Veneto, Corriere del Veneto, VeneziaToday / TrevisoToday, TViWeb (Vicenza), Il Nuovo Terraglio (Treviso) | ✅ (Il Gazzettino's feeds have no dates; the NEM papers have no feeds) |

Citynews sites (MilanoToday, RomaToday…) return 403 to our User-Agent on and off, and some never let it through, so the ones kept may miss a run. The Caltagirone papers' feeds (Il Messaggero, Il Mattino, Il Gazzettino, Corriere Adriatico, Quotidiano di Puglia) have no item dates. Corriere's working local feeds are `corriere.it/dynamic-feed/rss/section/<City>.xml`; the old `xml2.corriereobjects.it` ones are years stale.

Spanish, Catalan and Italian feeds list episodes and service pieces next to stories: RAI TGR's dated bulletins ("GR Lazio del 07/10/2026 ore 12:10", "Meteo …", "Buongiorno Regione …"), about a third of each TGR feed; IB3's and À Punt's bulletin recaps; press reviews ("Rassegna stampa 07-10-2026 edizioni Calabria"); most-read and daily digests ("Estas son las noticias más leídas este lunes en El Progreso", which two sister papers both publish); live-blog recaps; daily forecasts; horoscopes; what's-on agendas ("Què fer a Barcelona?", "Cosa fare a Milano oggi"); TV listings; and opinion. `isNotNews` drops these; on the 2026-10-07 cache its new patterns matched 274 Spanish and Italian regional titles (242 of them TGR bulletins), and elsewhere only a few Latin American horoscopes and one Colombian digest. Weather news such as storm warnings stays.

**Canada — provinces and territories** (added 2026-10-07)

Each of the 10 provinces and 3 territories has 1–8 regional outlets (56 in all): Radio-Canada's regional desk (`ici.radio-canada.ca/info/rss/<region>/en-continu`, French) in every province, the main papers' local section feeds, and the Global, CTV and CityNews city sites (one source per group and province). CBC's regional feeds hang until timeout for our User-Agent, so CBC is missing everywhere. The candidate lists, with each rejected feed and why, are in [the PR](https://github.com/benjamin-gaultier/news-globe/pull/55). Sources live in `packages/ingest/src/sources/ca-provinces.ts`.

| Province or territory | Outlets | Status |
| --- | --- | --- |
| Alberta | Radio-Canada Alberta, Calgary Herald, Edmonton Journal, Global News Calgary / Edmonton, CTV News Calgary / Edmonton | ✅ (CityNews Calgary and Edmonton are about half wire copy) |
| British Columbia | Radio-Canada Colombie-Britannique, Vancouver Sun, Global News BC, CTV News Vancouver, CHEK News, Castanet | ✅ (Times Colonist 403; Castanet appends a place tag to titles) |
| Manitoba | Radio-Canada Manitoba, Winnipeg Free Press, Global News Winnipeg, CTV News Winnipeg | ✅ (Winnipeg Sun 429; the Free Press's `/rss/?path=…` ignores the path, so its `/local/feed` is used) |
| New Brunswick | Radio-Canada Acadie (Nouveau-Brunswick), Telegraph-Journal, Acadie Nouvelle, CTV News Atlantic (New Brunswick) | ✅ |
| Newfoundland and Labrador | Radio-Canada Acadie (Terre-Neuve-et-Labrador), SaltWire / The Telegram, NTV News | ⚠️ three outlets (VOCM and The Rover 403; The Independent stale) |
| Northwest Territories | Cabin Radio, NWT News/North (NNSL), CKLB Radio | ⚠️ three outlets (L'Aquilon's feed is HTML) |
| Nova Scotia | Radio-Canada Acadie (Nouvelle-Écosse), SaltWire / The Chronicle Herald, CTV News Atlantic (Nova Scotia), Global News Halifax, Halifax Examiner | ✅ (Global Halifax and the Halifax Examiner post 1–2 items a day) |
| Nunavut | Nunatsiaq News, Nunavut News | ⚠️ two outlets (Radio-Canada Grand Nord mixes all three territories and Nunavik) |
| Ontario | Radio-Canada Ontario, Ottawa Citizen, Toronto Sun, Global News Toronto, CTV News Ontario, CityNews Toronto, Le Droit (Ottawa), ONFR | ✅ (Toronto Star and Hamilton Spectator 429; Global's other Ontario city pages mirror Global Toronto) |
| Prince Edward Island | Radio-Canada Acadie (Île-du-Prince-Édouard), SaltWire / The Guardian, CTV News Atlantic (P.E.I.) | ⚠️ three outlets (PEI Canada / Eastern Graphic 429) |
| Quebec | Radio-Canada Québec, La Presse (Grand Montréal), Le Devoir (Politique québécoise), Le Soleil, Le Journal de Montréal / de Québec, CTV News Montreal, Global News Montreal, CityNews Montreal | ✅ (the Montreal Gazette has no local feed; Le Soleil's and Le Devoir's section feeds are used, as their main feeds carry press releases or national news) |
| Saskatchewan | Radio-Canada Saskatchewan, Global News Regina / Saskatoon, CTV News Regina / Saskatoon, Prince Albert Daily Herald | ✅ (Leader-Post and StarPhoenix have no local feed; paNOW and CJME 403) |
| Yukon | Yukon News | ⚠️ one outlet (Whitehorse Star's certificate has expired; CKRW 403) |

**Australia — states and territories** (added 2026-10-07)

Each of the 6 states and 2 mainland territories has 3–7 outlets (39 in all): ABC's state desk (each state channel's "latest stories" collection; the state "top stories" feeds mix in national and world news), the Nine papers' state sections, 7NEWS's state feeds, ACM and Star News Group regional papers, and digital locals. Every News Corp feed (Daily Telegraph, Herald Sun, Courier-Mail, The Advertiser, The Mercury, NT News and the regional dailies) answers with an empty body, so News Corp is missing everywhere. The candidate lists are in [the PR](https://github.com/benjamin-gaultier/news-globe/pull/54). Sources live in `packages/ingest/src/sources/au-states.ts`.

| State or territory | Outlets | Status |
| --- | --- | --- |
| Australian Capital Territory | ABC News Canberra, The Canberra Times, Region Canberra, Canberra Daily | ✅ (CityNews 403) |
| New South Wales | ABC News NSW, Sydney Morning Herald (NSW), Guardian Australia (NSW), 7NEWS Sydney, Newcastle Herald, Illawarra Mercury, The Echo (Byron Shire) | ✅ |
| Northern Territory | ABC News NT, 7NEWS Darwin, Katherine Times | ⚠️ three outlets, about one story a day each from 7NEWS and the Katherine Times (NT News empty; NT Independent's feed doesn't parse) |
| Queensland | ABC News Queensland, Brisbane Times, 7NEWS Brisbane, Noosa Today, Gympie Today, North Queensland Register | ✅ but no regional daily: every News Corp regional paper returns an empty feed (InQueensland 403) |
| South Australia | ABC News SA, 7NEWS Adelaide, Stock Journal, Glam Adelaide | ⚠️ light: Glam Adelaide is mostly food and events (The Advertiser empty; InDaily has no feed; the ACM country papers 403) |
| Tasmania | ABC News Tasmania, The Examiner, Pulse Tasmania, Tasmanian Times | ✅ (The Mercury empty; The Advocate shares The Examiner's copy) |
| Victoria | ABC News Victoria, The Age (Victoria), 7NEWS Melbourne, Bendigo Advertiser, Sunraysia Daily, Gippsland Times | ✅ (Herald Sun and Geelong Advertiser empty) |
| Western Australia | ABC News WA, The West Australian (WA), WAtoday, Business News (WA), Farm Weekly | ✅ (The West's WA section has some national lifestyle and business copy) |

**Brazil — states** (added 2026-10-07)

Each of the 26 states and the Federal District has 3–6 outlets (119 in all): g1's state section (one source per state, with its interior editions as extra feeds), the main dailies' local sections, and state news portals. Apart from g1, every outlet is independent of Globo, so Globo's affiliates' own sites (NSC, Gazetaweb, iBahia, Jornal da Paraíba…) are left out. The candidate lists, with each rejected feed and why, are in the PRs: [North and Northeast](https://github.com/benjamin-gaultier/news-globe/pull/57), [Centre-West, Southeast and South](https://github.com/benjamin-gaultier/news-globe/pull/58). Sources live in `packages/ingest/src/sources/br-states-*.ts`.

| State | Outlets | Status |
| --- | --- | --- |
| Acre | g1 Acre, A Gazeta do Acre, ac24horas, ContilNet (Polícia), O Alto Acre | ✅ (ContilNet's police desk only; its main feed is national) |
| Alagoas | g1 Alagoas, TNH1, Cada Minuto, Alagoas 24 Horas, 7Segundos | ✅ |
| Amapá | g1 Amapá, Diário do Amapá, Portal SelesNafes | ⚠️ three outlets |
| Amazonas | g1 Amazonas, Em Tempo, Amazonas1, Manaus Alerta | ⚠️ Amazonas1 and Manaus Alerta mix in national news (A Crítica has no feed; D24AM 403) |
| Bahia | g1 Bahia, A Tarde, Bahia Notícias (Municípios), Acorda Cidade (Feira de Santana), Jornal Grande Bahia | ✅ (Correio's feed is stale; BNews 403) |
| Ceará | g1 Ceará, O Povo, CN7, Site Miséria (Cariri) | ✅ (Diário do Nordeste's feeds are stale) |
| Espírito Santo | g1 Espírito Santo, A Gazeta, A Tribuna (Tribuna Online), Folha Vitória (TV Vitória), ES Hoje | ✅ |
| Federal District | g1 Distrito Federal, Metrópoles (Distrito Federal), Jornal de Brasília | ⚠️ three outlets, all DF news rather than national politics (Correio Braziliense's feed stopped in 2023; Agência Brasília 403) |
| Goiás | g1 Goiás, A Redação, Goiás 24 Horas, Portal Contexto (Anápolis), Folha Z | ✅ (O Popular, Mais Goiás and Jornal Opção 403) |
| Maranhão | g1 Maranhão, O Imparcial, Jornal Pequeno, Blog do Gilberto Léda | ✅ |
| Mato Grosso | g1 Mato Grosso, Só Notícias, HiperNotícias, Leia Agora | ✅ (Olhar Direto's XML is malformed; MidiaNews and RD News 403) |
| Mato Grosso do Sul | g1 Mato Grosso do Sul, Campo Grande News, JD1 Notícias, Investiga MS | ✅ (Midiamax 403; Correio do Estado has no feed) |
| Minas Gerais | g1 Minas Gerais, Tribuna de Minas (Juiz de Fora), Diário do Comércio, Metrópoles (Minas Gerais), BHAZ | ✅ (Estado de Minas's only feed is mostly national; O Tempo and Itatiaia have no feed) |
| Paraná | g1 Paraná, Gazeta do Povo (Paraná), Bem Paraná, Folha de Londrina, Banda B, Massa News | ✅ (Gazeta do Povo's Paraná feed posts about two a day) |
| Paraíba | g1 Paraíba, Portal Correio, ClickPB, WSCOM, MaisPB | ✅ |
| Pará | g1 Pará, Diário do Pará (DOL), Correio de Carajás, Ver-o-Fato | ✅ (O Liberal's only feed is mostly entertainment) |
| Pernambuco | g1 Pernambuco, Jornal do Commercio, Blog do Carlos Britto (Petrolina), Blog do Nill Júnior (Pajeú) | ⚠️ few newspapers (Diario de Pernambuco 403; Folha de Pernambuco's feed 404s) |
| Piauí | g1 Piauí, O Dia (Piauí), Cidadeverde.com | ⚠️ three outlets (Meio Norte has no feed; GP1's items have no dates) |
| Rio Grande do Norte | g1 Rio Grande do Norte, Tribuna do Norte, Agora RN, Saiba Mais | ✅ |
| Rio Grande do Sul | g1 Rio Grande do Sul, O Sul, Sul21, Rádio Guaíba, ABC+ (Vale do Sinos) | ✅ (GZH's XML is malformed; Correio do Povo's feeds are a day stale) |
| Rio de Janeiro | g1 Rio de Janeiro, O Dia, O São Gonçalo, Agenda do Poder, Enfoco (Niterói) | ✅ (O Globo and Extra are Globo's, like g1; Jornal do Brasil and Diário do Rio 403) |
| Rondônia | g1 Rondônia, Rondoniagora, Extra de Rondônia, Expressão Rondônia | ⚠️ Expressão Rondônia mixes in national news (Rondônia ao Vivo's item dates are wrong) |
| Roraima | g1 Roraima, Folha de Boa Vista, Roraima 1, Roraima em Foco | ✅ |
| Santa Catarina | g1 Santa Catarina, OCP News (Jaraguá do Sul), O Município (Brusque), O Blumenauense, ClicRDC (Chapecó) | ✅ but no statewide daily besides g1 (NSC produces g1 SC; ND+ is mostly national) |
| Sergipe | g1 Sergipe, Infonet, Portal A8 (TV Atalaia), Fan F1, NE Notícias | ✅ |
| São Paulo | g1 São Paulo, Estadão (São Paulo), Folha de S.Paulo (Cotidiano), Metrópoles (São Paulo), Agência Mural, Guarulhos Hoje | ✅ (Folha Cotidiano is about half national; the Sampi papers' feeds return HTML) |
| Tocantins | g1 Tocantins, Gazeta do Cerrado, Atitude Tocantins | ⚠️ three outlets (Jornal do Tocantins 403) |

Many Brazilian portals answer 403 to our User-Agent, and many dailies have no feed or one that is mostly national news; the feeds were captured in the week after the first round of the 2026 elections, so national campaign stories leak into some states as singletons.

Canadian, Australian and Brazilian feeds list episodes and service pieces next to stories: Radio-Canada's and Global's newscasts ("Le téléjournal Acadie du 6 octobre", "WATCH: Global News Hour at 6 BC: Oct. 6"), La Presse's "Transports en direct" traffic updates, live-blog wraps ("As it happened: WA news on …"), dated podcasts and galleries, columns shared across SaltWire's papers, and Canberra Daily's property listings ("5 Berra Close, Ngunnawal"). g1 publishes a programme page per bulletin per day ("VÍDEOS: Bom Dia PE de quarta-feira, …", "Assista ao GR1") and, after the election, one result page per municipality and polling place ("Resultado das eleições 2026 em Torres (RS): …"), about 1,400 titles on the 2026-10-07 cache; portals add lottery results, job listings, "onde assistir" TV guides, legal notices, obituary lists and dated bulletins ("07/10/2026 - Assista agora ao Tribuna Notícias", "Cartórios - 07/10/2026", which formed a fake cluster on the shared date alone). `isNotNews` drops these; elsewhere its new patterns matched only one Italian magazine issue.

**Mexico — states** (added 2026-10-07)

Each of the 31 states and Mexico City has 1–6 regional outlets (119 in all): OEM's local Soles (`oem.com.mx/<paper>/rss`), El Universal's and La Jornada's state editions, Quadratín's state sites, Posta's state sections (through their Google News sitemaps), and local dailies and portals. The candidate lists, with each rejected feed and why, are in the PRs: [Mexico City, centre and south](https://github.com/benjamin-gaultier/news-globe/pull/62), [north, west and Bajío](https://github.com/benjamin-gaultier/news-globe/pull/63). Sources live in `packages/ingest/src/sources/mx-states-*.ts`.

| State | Outlets | Status |
| --- | --- | --- |
| Aguascalientes | El Sol del Centro, El Heraldo de Aguascalientes | ⚠️ two outlets |
| Baja California | El Sol de Tijuana / La Voz de la Frontera, La Jornada Baja California, Punto Norte | ✅ |
| Baja California Sur | El Sudcaliforniano, BCS Noticias | ⚠️ two outlets |
| Campeche | Tribuna Campeche | ⚠️ one outlet |
| Chiapas | El Heraldo de Chiapas, Diario del Sur (Tapachula), Diario de Chiapas, Alerta Chiapas, Chiapas Paralelo | ✅ |
| Chihuahua | El Heraldo de Chihuahua / El Heraldo de Juárez, Entrelíneas, Norte Digital (Juárez), Canal 44 (Juárez) | ✅ (Canal 44 masks crime words in its titles) |
| Coahuila | El Sol de la Laguna, El Heraldo de Saltillo, Posta Coahuila | ✅ |
| Colima | AF Medios | ⚠️ one outlet |
| Durango | El Sol de Durango, Contexto de Durango, Contacto Hoy, Posta Durango | ✅ |
| Guanajuato | AM, El Sol de León / El Sol del Bajío / El Sol de Irapuato / El Sol de Salamanca, Notus | ✅ |
| Guerrero | El Sol de Acapulco, Quadratín Guerrero, Enfoque Informativo | ⚠️ three outlets |
| Hidalgo | El Sol de Hidalgo, El Universal Hidalgo, Quadratín Hidalgo, Plaza Juárez | ✅ |
| Jalisco | El Informador, Mural, El Occidental, Notisistema, Partidero, Conciencia Pública | ✅ |
| Mexico City | El Universal (Metrópoli), Reforma (Ciudad), La Jornada (Capital), La Prensa, 24 Horas (CDMX), Posta (CDMX) | ✅ (Milenio has no regional feeds; the metro sections also cover the State of Mexico's suburbs) |
| Michoacán | El Sol de Morelia, La Voz de Michoacán, Quadratín Michoacán, Primera Plana, Respuesta, Changoonga | ✅ |
| Morelos | Diario de Morelos, El Sol de Cuernavaca, La Jornada Morelos, Quadratín Morelos | ✅ |
| Nayarit | Meridiano de Nayarit, Enfoque Nayarit | ⚠️ two outlets |
| Nuevo León | El Norte, Posta Nuevo León, Hora Cero | ⚠️ three outlets (Milenio Monterrey has no feed; Posta is read through its Google News sitemap) |
| Oaxaca | El Imparcial de Oaxaca, NVI Noticias, Quadratín Oaxaca, Página 3 | ✅ |
| Puebla | El Sol de Puebla, El Universal Puebla, La Jornada de Oriente, Poblanerías, Urbano Puebla, Status Puebla | ✅ |
| Querétaro | Diario de Querétaro, El Universal Querétaro, Quadratín Querétaro, Códice Informativo, Plaza de Armas | ✅ |
| Quintana Roo | Noticaribe, Quadratín Quintana Roo, Quintana Roo Hoy, Quinta Fuerza | ✅ |
| San Luis Potosí | El Sol de San Luis, La Jornada San Luis, La Orquesta, Metrópoli San Luis | ✅ |
| Sinaloa | El Sol de Sinaloa / El Sol de Mazatlán, Línea Directa, Los Noticieristas | ✅ |
| Sonora | El Sol de Hermosillo, Tribuna (Sonora), Proyecto Puente | ✅ |
| State of Mexico | El Sol de Toluca, Alfa Diario, Así Sucede, Quadratín Estado de México, Plana Mayor | ✅ |
| Tabasco | El Heraldo de Tabasco, Tabasco Hoy, Quadratín Tabasco | ⚠️ three outlets |
| Tamaulipas | El Sol de Tampico, Expreso (Ciudad Victoria), Posta Tamaulipas | ✅ |
| Tlaxcala | El Sol de Tlaxcala, Quadratín Tlaxcala, Gente Tlx, Línea de Contraste | ✅ |
| Veracruz | Diario de Xalapa, La Jornada Veracruz, Quadratín Veracruz, Plumas Libres, Golpe Político, Formato 7 | ✅ |
| Yucatán | Diario de Yucatán (Mérida), Posta Yucatán, Infolliteras, Quadratín Yucatán, Yucatán en Corto | ✅ |
| Zacatecas | El Sol de Zacatecas, Zacatecas Online | ⚠️ two outlets |

**Argentina — provinces** (added 2026-10-07)

Each of the 23 provinces and the City of Buenos Aires has 1–8 outlets (94 in all): the main provincial daily, Página/12's regional editions, and local papers, radios and portals. Many provincial portals publish only site-wide feeds, so national stories (on 2026-10-07, Messi's farewell) form multi-outlet clusters in several provinces next to the local ones. The candidate lists are in [the PR](https://github.com/benjamin-gaultier/news-globe/pull/64). Sources live in `packages/ingest/src/sources/ar-provinces.ts`.

| Province | Outlets | Status |
| --- | --- | --- |
| Buenos Aires City | Clarín (Ciudades), Perfil (Ciudad de Buenos Aires), Palermo Online | ⚠️ three outlets; most city news is in the national papers, so the city sections are thin |
| Buenos Aires Province | El Día (La Plata), La Nueva (Bahía Blanca), Buenos Aires/12 (Página/12), El Eco de Tandil, 0223 (Mar del Plata), La Noticia 1 (Conurbano), El Diario Sur (Conurbano sur), Infoeme (Olavarría) | ✅ |
| Catamarca | El Ancasti, El Esquiú, Radio Valle Viejo | ⚠️ three outlets |
| Chaco | Diario Norte, Primera Línea, Chaco Día por Día, Radio Sudamericana (Chaco) | ✅ |
| Chubut | El Patagónico (Comodoro Rivadavia), El Chubut, El Diario de Madryn, ADN Sur | ✅ |
| Corrientes | El Litoral (Corrientes), El Libertador, Radio Sudamericana (Corrientes) | ⚠️ three outlets |
| Córdoba | Puntal (Río Cuarto), El Diario de Carlos Paz, Perfil Córdoba, Hoy Día Córdoba, Cba24n (SRT), La Nueva Mañana | ✅ (La Voz del Interior 403) |
| Entre Ríos | Uno Entre Ríos, El Entre Ríos, El Heraldo (Concordia), Diario Río Uruguay, Elonce, Entre Ríos Ahora | ✅ |
| Formosa | Diario Formosa | ⚠️ one outlet |
| Jujuy | Todo Jujuy, Somos Jujuy, Jujuy al Momento | ⚠️ three outlets |
| La Pampa | La Arena, Diario Textual, Infopico, Plan B Noticias | ✅ |
| La Rioja | Nueva Rioja, Medios Rioja, Rioja Virtual, Rioja Libre | ✅ (Rioja Virtual writes its titles in capitals) |
| Mendoza | Los Andes, Diario Uno (Mendoza), Diario San Rafael, Sitio Andino | ✅ (MDZ's RSS 403 and its news sitemap is mostly national) |
| Misiones | El Territorio, Primera Edición, Canal 12 Misiones, Misiones Opina, Noticias del 6 | ✅ |
| Neuquén | LMNeuquén, Neuquén al Instante, La Angostura Digital, Diario Andino (Villa La Angostura) | ✅ |
| Río Negro | LM Cipolletti, El Cordillerano (Bariloche), ADN Río Negro, Bariloche Opina, ANB (Agencia de Noticias Bariloche) | ✅ |
| Salta | El Tribuno (Salta), Salta/12 (Página/12), Informate Salta, FM 89.9 Salta | ✅ |
| San Juan | Diario de Cuyo, Diario La Provincia SJ, Canal 13 San Juan, 0264 Noticias, San Juan 8 | ✅ but all four larger outlets publish site-wide feeds, so national stories cluster next to local ones |
| San Luis | El Diario de la República, La Voz de San Luis, San Luis 24 | ⚠️ three outlets (El Chorrillero 403) |
| Santa Cruz | La Opinión Austral, Ahora Calafate | ⚠️ two outlets (La Opinión Austral's sitemap stamps every item 16:00) |
| Santa Fe | La Capital (Rosario), Rosario/12 (Página/12), Aire de Santa Fe, El Ciudadano (Rosario), Rosario Plus | ✅ (El Litoral's feeds are mostly national) |
| Santiago del Estero | Nuevo Diario, Diario Panorama | ⚠️ two outlets (El Liberal 403; Diario Panorama has some future-dated items, and its feed needs the token its robots.txt publishes) |
| Tierra del Fuego | Diario Prensa, Infofueguina, Actualidad TDF, Sur54 | ✅ |
| Tucumán | Los Primeros, Tucumán a las 7 | ⚠️ two outlets (La Gaceta's feeds are mostly national; Primera Fuente stale) |

**India — states and union territories** (added 2026-10-07)

Each of the 28 states and 8 union territories except Sikkim, Lakshadweep and Dadra and Nagar Haveli and Daman and Diu has 1–7 outlets (98 in all): the state sections of The Hindu, the Times of India, the Hindustan Times, The Indian Express and The New Indian Express, The Tribune in the north-west, Northeast Now in the Northeast, and regional papers. Feeds are in English (and Bengali in West Bengal), since clustering has no stopwords for Hindi or the other Indian languages. Many regional papers answer 403 to our User-Agent. The candidate lists, with each rejected feed and why, are in the PRs: [east, Northeast and south](https://github.com/benjamin-gaultier/news-globe/pull/60), [north and west](https://github.com/benjamin-gaultier/news-globe/pull/61). Sources live in `packages/ingest/src/sources/in-states-*.ts`.

| State or union territory | Outlets | Status |
| --- | --- | --- |
| Andaman and Nicobar Islands | Andaman Sheekha, Andaman Chronicle | ⚠️ two outlets |
| Andhra Pradesh | The Hindu (Andhra Pradesh), The New Indian Express (Andhra Pradesh), The South First (Andhra Pradesh) | ✅ |
| Arunachal Pradesh | Arunachal24, Northeast Now (Arunachal Pradesh), Arunachal Observer | ✅ |
| Assam | Times of India (Guwahati), Northeast Now (Assam) | ⚠️ two outlets (The Assam Tribune and EastMojo 403) |
| Bihar | Times of India (Patna) | ⚠️ one outlet |
| Chandigarh | The Tribune (Chandigarh) | ⚠️ one outlet, whose Chandigarh section shares Panchkula stories with its Haryana one |
| Chhattisgarh | Naidunia English (Chhattisgarh), The Hindu (Chhattisgarh) | ⚠️ two outlets |
| Dadra and Nagar Haveli and Daman and Diu | — | ❌ no outlet with a usable feed (shape kept; hidden in the list) |
| Delhi | Times of India (Delhi), Hindustan Times (Delhi), The Indian Express (Delhi), India TV (Delhi) | ✅ |
| Goa | Herald Goa, Times of India (Goa) | ⚠️ two outlets |
| Gujarat | Times of India (Gujarat), The Indian Express (Ahmedabad), Vibes of India | ✅ |
| Haryana | The Tribune (Haryana), Times of India (Gurgaon), Hindustan Times (Gurugram), The Hindu (Haryana) | ✅ |
| Himachal Pradesh | The Tribune (Himachal) | ⚠️ one outlet |
| Jammu and Kashmir | Greater Kashmir, The Tribune (J&K), The Hindu (Jammu and Kashmir), Kashmir Life | ✅ (Daily Excelsior 403) |
| Jharkhand | Times of India (Ranchi) | ⚠️ one outlet |
| Karnataka | The Hindu (Karnataka), Deccan Herald (Karnataka), Times of India (Bengaluru), The Indian Express (Bengaluru), The New Indian Express (Karnataka), Star of Mysore, The South First (Karnataka) | ✅ |
| Kerala | The Hindu (Kerala), Times of India (Thiruvananthapuram), The New Indian Express (Kerala), Onmanorama, The South First (Kerala) | ✅ |
| Ladakh | Greater Kashmir (Ladakh), The Hindu (Ladakh) | ⚠️ two outlets |
| Lakshadweep | — | ❌ no outlet with a usable feed (shape kept; hidden in the list) |
| Madhya Pradesh | Naidunia English (Madhya Pradesh), The Hindu (Madhya Pradesh) | ⚠️ two outlets |
| Maharashtra | Times of India (Maharashtra), Hindustan Times (Mumbai, Pune), The Indian Express (Mumbai, Pune), The Hindu (Maharashtra), Mid-Day | ✅ |
| Manipur | Imphal Times, Northeast Now (Manipur) | ⚠️ two outlets |
| Meghalaya | Syllad, Highland Post, Northeast Now (Meghalaya) | ✅ |
| Mizoram | Northeast Now (Mizoram) | ⚠️ one outlet |
| Nagaland | The Morung Express, Northeast Now (Nagaland) | ⚠️ two outlets |
| Odisha | Times of India (Bhubaneswar), The New Indian Express (Odisha), OdishaTV, Odisha Bytes | ✅ |
| Puducherry | The Hindu (Puducherry) | ⚠️ one outlet |
| Punjab | The Tribune (Punjab), The Indian Express (Chandigarh and Punjab), The Hindu (Punjab), Yes Punjab | ✅ |
| Rajasthan | Times of India (Jaipur), The Hindu (Rajasthan) | ⚠️ two outlets |
| Sikkim | — | ❌ no outlet with a usable feed (shape kept; hidden in the list) |
| Tamil Nadu | The Hindu (Tamil Nadu), Times of India (Chennai), The New Indian Express (Tamil Nadu), DT Next (Tamil Nadu), The South First (Tamil Nadu) | ✅ |
| Telangana | The Hindu (Telangana), Times of India (Hyderabad), The New Indian Express (Telangana), Telangana Today, The Siasat Daily (Telangana), The South First (Telangana) | ✅ (Deccan Chronicle 403) |
| Tripura | Tripura Chronicle, Northeast Now (Tripura) | ⚠️ two outlets |
| Uttar Pradesh | Times of India (Uttar Pradesh), Hindustan Times (Lucknow, Noida), The Indian Express (Lucknow), The Hindu (Uttar Pradesh), India TV (Uttar Pradesh) | ✅ |
| Uttarakhand | The Hindu (Uttarakhand), Garhwal Post | ⚠️ two outlets |
| West Bengal | The Hindu (Kolkata), Times of India (Kolkata), The Indian Express (Kolkata), TV9 Bangla, ABP Ananda | ✅ (The Telegraph and The Statesman 403) |

Mexican, Argentine and Indian feeds list service pieces next to stories: legal notices ("EDICTO 455/2024", "Edicto sucesorio: …"), city weather ("Clima en Monterrey hoy: …", "Pronostican cielo despejado para este jueves") and exchange rates, dated editions and gossip columns ("Diario digital | 7 de octubre de 2026", "Bajo Reserva Hidalgo 7/10/26", "Crónica del poder / …"), obituaries and death notices ("… (Q.E.P.D)"), lottery draws ("Quiniela de Mendoza: estos son los resultados…", "Tómbola Santiagueña: los números…"), bank-discount items, casino ads, and Indian job listings ("Meghalaya Jobs 2026 : …", "Raipur Job Fair 2026: …") and live-blog headers. `isNotNews` drops these; storm news in a weather title is kept, and elsewhere the new patterns matched only a Cuban paper's edition and casino ad.

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
| Folha de S.Paulo | poder (cotidiano is the São Paulo source) | 9 | ✅ (ISO-8859-1 encoded, see below) |
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
| Excélsior | portada | 8 | ✅ (fixed 2026-10-07: titles come as escaped CDATA, `&lt;![CDATA[…]]&gt;`, which stripped them to nothing, so the feed gave 0 items; every `/rss/*` path, `nacional` included, now serves the front-page feed, culture and entertainment mixed in) |
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
| Correio da Manhã | main feed | 6 | ✅ (fixed 2026-10-07: titles come as escaped CDATA, so the feed gave 0 items until they were unwrapped) |
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
| SenePlus | main feed | 7 | ➕ **added** 2026-10-07, replacing Le Quotidien (fr) |
| Dakaractu | main feed | 8 | ✅ (fr) |
| PressAfrik | main feed | 7 | ✅ (fr) |
| E-Media | main feed | 7 | ✅ (fr) |
| Senego | main feed | 6 | ✅ (fr) |
| ~~Le Quotidien~~ | — | — | ❌ **dropped** 2026-10-07: every URL on `lequotidien.sn` (`/feed/`, `/rss`, `www.`) returns **403** to bots since 2026-10-06 |
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

**Russia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| TASS | main feed | 10 | ✅ (ru) |
| Interfax | main feed | 10 | ✅ (ru) |
| Kommersant | main feed | 9 | ✅ (ru) |
| RBC | main feed | 9 | ✅ (ru) |
| Vedomosti | main feed | 9 | ✅ (ru) |
| Meduza | main feed | 8 | ✅ (in exile, ru) |
| Novaya Gazeta Europe | main feed | 8 | ✅ (in exile, ru) |
| ~~RIA Novosti~~, ~~Lenta.ru~~, ~~Rossiyskaya Gazeta~~, ~~Izvestia~~ | — | — | ❌ **dropped**: no answer (likely geo-blocked) |

Russia mixes state wire agencies, business dailies and two outlets publishing from exile, so stories that only state media carry and stories that only independent media carry both reach the top.

**Kazakhstan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Kazinform | ru | 10 | ✅ (ru) |
| Tengrinews | main feed | 9 | ✅ (ru) |
| NUR.KZ | main feed | 8 | ✅ (ru) |
| Kursiv | main feed | 8 | ✅ (ru) |
| ~~Zakon.kz~~, ~~Vlast~~, ~~Informburo~~ | — | — | ❌ **dropped**: 403 / 404 |
| ~~Orda~~ | — | — | ❌ **dropped**: stale feed |

**Kosovo** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Koha | main feed | 10 | ✅ (20 items, sq) |
| Telegrafi | main feed | 8 | ✅ (sq) |
| RTV Dukagjini | main feed | 7 | ➕ **added** 2026-10-07, replacing Gazeta Express (10 items, sq) |
| ~~Gazeta Express~~ | — | — | ❌ **dropped** 2026-10-07: the whole site returns **403** to bots since 2026-10-06 |
| ~~Insajderi~~ | — | — | ❌ **skipped**: titles copy Telegrafi's |
| ~~Kallxo~~, ~~Periskopi~~ | — | — | ❌ **dropped**: 403 / 404 |

**North Macedonia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Nova Makedonija | main feed | 9 | ✅ (10 items, mk) |
| Sitel | main feed | 8 | ✅ (10 items, mk) |
| 360 Stepeni | main feed | 8 | ✅ (10 items, mk) |
| Meta.mk | main feed | 8 | ✅ (mk) |
| Libertas | main feed | 7 | ✅ (10 items, mk) |
| Kurir | main feed | 7 | ✅ (10 items, mk) |
| Plusinfo | main feed | 6 | ✅ (all-caps titles, mk) |
| ~~MIA~~, ~~Sloboden Pečat~~, ~~Fokus~~ | — | — | ❌ **dropped**: 403 / 404 |

**Indonesia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Antara | latest | 10 | ✅ (id) |
| CNN Indonesia | nasional | 9 | ✅ (id) |
| Republika | main feed | 8 | ✅ (id) |
| Liputan6 | news | 8 | ✅ (id) |
| CNBC Indonesia | news | 8 | ✅ (id) |
| Sindonews | nasional | 7 | ✅ (id) |
| Okezone | main feed | 7 | ✅ (some titles carry a stray "amp;nbsp;", repaired, id) |
| ~~Detik~~, ~~Tribunnews~~, ~~Suara~~, ~~Merdeka~~ | — | — | ❌ **dropped**: unreachable / 403 / 404 |
| ~~Tempo~~ | — | — | ❌ **dropped**: stale feed |

**Vietnam** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Tuổi Trẻ | thời sự | 10 | ✅ (dates ~3h ahead, clamped, vi) |
| Thanh Niên | thời sự | 9 | ✅ (titles escaped twice, decoded, vi) |
| Nhân Dân | chính trị | 9 | ✅ (vi) |
| VietNamNet | thời sự | 8 | ✅ (vi) |
| Tiền Phong | xã hội | 8 | ✅ (vi) |
| VTC News | thời sự | 7 | ✅ (vi) |
| ~~VnExpress~~, ~~Lao Động~~ | — | — | ❌ **dropped**: 404 / not RSS |
| ~~Dân Trí~~ | — | — | ❌ **dropped**: stale feed |

Vietnamese is tokenised on folded syllables (tones removed); the stopword list covers the commonest function syllables, including "việt nam" itself.

**Taiwan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Liberty Times | main feed | 10 | ✅ (zh) |
| PTS News | main feed | 9 | ✅ (zh) |
| ETtoday | realtime | 8 | ✅ (zh) |
| ~~CNA~~, ~~Storm Media~~, ~~China Times~~ | — | — | ❌ **dropped**: 404 / 403 |
| ~~UDN~~, ~~SETN~~ | — | — | ❌ **dropped**: empty feed / unparseable |

Chinese titles are split into overlapping character pairs, as for Japanese, after cutting at grammatical characters (的, 了, 是…). With three outlets Taiwan has few multi-outlet stories, so its list leans on recency.

**Hong Kong** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| RTHK | local | 10 | ✅ (zh) |
| Ming Pao | instant | 9 | ✅ (zh) |
| Sing Tao | main feed | 8 | ✅ (zh) |
| South China Morning Post | Hong Kong | 9 | ✅ (en) |
| Hong Kong Free Press | main feed | 8 | ✅ (en) |
| ~~HK01~~, ~~inmediahk~~ | — | — | ❌ **dropped**: 404 / 403 |
| ~~The Standard~~ | — | — | ❌ **dropped**: malformed XML |

Hong Kong has no outline on the 110m map; pick it from the country list.

**Armenia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| News.am | main feed | 9 | ✅ (hy) |
| Hetq | main feed | 9 | ✅ (hy) |
| Aravot | main feed | 8 | ✅ (10 items, hy) |
| 168 Zham | main feed | 8 | ✅ (hy) |
| Factor | main feed | 7 | ✅ (10 items, hy) |
| ~~Armenpress~~, ~~CivilNet~~ | — | — | ❌ **dropped**: 403 |
| ~~Azatutyun~~ | — | — | ❌ **dropped**: not XML |

**Azerbaijan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| AZERTAC | main feed | 10 | ✅ (az) |
| Report | main feed | 9 | ✅ (az) |
| Qafqazinfo | main feed | 7 | ✅ (az) |
| Trend | main feed | 8 | ✅ (en) |
| ~~Oxu.az~~ | — | — | ❌ **dropped**: 403 |
| ~~APA~~, ~~Musavat~~ | — | — | ❌ **dropped**: unparseable feed |

**Uzbekistan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| UzA | main feed | 10 | ✅ (Cyrillic, uz) |
| Kun.uz | main feed | 9 | ✅ (uz) |
| Daryo | main feed | 8 | ✅ (uz) |
| Gazeta.uz | main feed | 9 | ✅ (ru) |
| Podrobno.uz | main feed | 7 | ✅ (ru) |
| Spot | main feed | 7 | ✅ (ru) |

Uzbek outlets write oʻ/gʻ with different apostrophes (ʻ, ', ‘); the mark is dropped inside words so their titles match.

**Iran** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| IRNA | main feed | 10 | ✅ (fa) |
| ISNA | main feed | 9 | ✅ (fa) |
| Mehr | main feed | 8 | ✅ (fa) |
| Hamshahri | main feed | 8 | ✅ (fa) |
| Khabar Online | main feed | 8 | ✅ (fa) |
| Donya-e-Eqtesad | all news | 8 | ✅ (fa) |
| Entekhab | all news | 7 | ✅ (fa) |
| Iran International | main feed | 8 | ✅ (London-based, fa) |
| ~~Tasnim~~, ~~Fars~~ | — | — | ❌ **dropped**: unreachable / unparseable |

Persian titles get the Arabic letter forms unified (ي → ی, ك → ک) and Persian digits converted; Solar Hijri years (14xx) are ignored like 20xx.

**Nepal** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Onlinekhabar | main feed | 9 | ✅ (ne) |
| Nagarik | main feed | 9 | ✅ (ne) |
| Ratopati | main feed | 8 | ✅ (ne) |
| Desh Sanchar | main feed | 7 | ✅ (12 items, ne) |
| ~~Kantipur~~, ~~Naya Patrika~~, ~~Setopati~~ | — | — | ❌ **dropped**: 404 / unreachable |
| ~~Annapurna Post~~, ~~Himal Khabar~~ | — | — | ❌ **dropped**: undated / stale |

Devanagari vowel signs are combining marks, so Nepali titles skip the accent folding used elsewhere (it would reduce words to bare consonants).

**Syria** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| SANA | main feed | 10 | ✅ (state agency, 10 items, ar) |
| Al-Watan | main feed | 8 | ✅ (ar) |
| Syria TV | main feed | 8 | ✅ (ar) |
| North Press | main feed | 7 | ✅ (9 items, ar) |
| Halab Today | main feed | 7 | ✅ (10 items, ar) |
| Zaman al-Wasl | main feed | 7 | ✅ (ar) |
| ~~Enab Baladi~~, ~~Al-Jumhuriya~~, ~~Al-Souria~~ | — | — | ❌ **dropped**: 403 / unreachable |

**Sudan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Sudan Tribune | main feed | 9 | ✅ (10 items, ar) |
| Dabanga | main feed | 8 | ✅ (12 items, ar) |
| Al-Taghyeer | main feed | 7 | ✅ (ar) |
| Al-Nilin | main feed | 7 | ✅ (10 items, ar) |
| ~~Al-Rakoba~~, ~~Sudan Akhbar~~ | — | — | ❌ **dropped**: 403 |

**Cuba** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Granma | main feed | 9 | ✅ (state daily, es) |
| 14ymedio | main feed | 8 | ✅ (es) |
| Diario de Cuba | main feed | 8 | ✅ (10 items, es) |
| ~~Cubadebate~~, ~~Radio Rebelde~~, ~~Cubanet~~ | — | — | ❌ **dropped**: unreachable / 500 / 403 |
| ~~CiberCuba~~ | — | — | ❌ **dropped**: stale feed |

**Puerto Rico** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Nuevo Día | main feed | 10 | ✅ (es) |
| Primera Hora | main feed | 8 | ✅ (es) |
| Noticel | main feed | 8 | ✅ (10 items, es) |
| ~~El Vocero~~, ~~WAPA~~ | — | — | ❌ **dropped**: rate-limited (429) |
| ~~Metro~~, ~~Telemundo PR~~ | — | — | ❌ **dropped**: 404 / empty feed |

**Israel** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Ynet | main feed | 10 | ✅ (he) |
| Israel Hayom | main feed | 9 | ✅ (he) |
| Maariv | news | 9 | ✅ (he) |
| Globes | news | 8 | ✅ (business, he) |
| Arutz Sheva | main feed | 7 | ✅ (10 items, he) |
| Srugim | main feed | 7 | ✅ (he) |
| ~~Haaretz~~, ~~Times of Israel~~, ~~Kan~~, ~~Davar~~, ~~Zman Israel~~ | — | — | ❌ **dropped**: 403 |
| ~~Walla~~, ~~N12 (Mako)~~ | — | — | ❌ **dropped**: stale feeds |

With Haaretz and Kan blocked, the mix leans right (Israel Hayom, Arutz Sheva, Srugim). Hebrew titles keep acronyms whole (צה"ל, שב"כ) and drop one prefix letter (ו ה ב ל מ ש כ) from longer words.

**Tajikistan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Khovar | main feed | 9 | ✅ (state agency, 10 items, tg) |
| Asia-Plus | main feed | 9 | ✅ (ru) |
| Avesta | main feed | 8 | ✅ (10 items, ru) |

**Afghanistan** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Hasht-e Subh | main feed | 9 | ✅ (Dari, in exile, 10 items, fa) |
| Afghanistan International | main feed | 9 | ✅ (Dari, London-based, fa) |
| Khaama Press | main feed | 8 | ✅ (en) |
| ~~TOLOnews~~ | — | — | ❌ **dropped**: stale feed |
| ~~Pajhwok~~ | — | — | ❌ **dropped**: feed removed (410) |

**South Korea** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Yonhap | main feed | 10 | ✅ (ko) |
| Chosun Ilbo | main feed | 9 | ✅ (ko) |
| Dong-A Ilbo | main feed | 9 | ✅ (ko) |
| Kyunghyang Shinmun | main feed | 9 | ✅ (ko) |
| SBS News | politics | 8 | ✅ (ko) |
| ~~Newsis~~ | — | — | ❌ **skipped**: Dong-A's feed carries its wire copy under the same titles |
| ~~Hankyoreh~~ | — | — | ❌ **dropped**: undated items |
| ~~JoongAng~~, ~~OhmyNews~~, ~~JTBC~~ | — | — | ❌ **dropped**: unparseable / 404 / stale |

Korean words carry their particles (대통령이, 대통령은), so Hangul words are split into overlapping syllable pairs, as for Japanese.

**Thailand** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Thairath | main feed | 9 | ✅ (th) |
| Matichon | main feed | 9 | ✅ (th) |
| Khaosod | main feed | 8 | ✅ (th) |
| Prachachat | main feed | 7 | ✅ (th) |
| ~~Thai PBS~~, ~~Bangkok Biz News~~, ~~Naew Na~~ | — | — | ❌ **dropped**: 404 |
| ~~Daily News~~ | — | — | ❌ **dropped**: empty feed |

Thai is written without spaces between words; titles are split with the ICU word segmenter built into Node (`Intl.Segmenter`).

**Bangladesh** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Prothom Alo | main feed | 10 | ✅ (bn) |
| Bangla Tribune | main feed | 8 | ✅ (bn) |
| Dhaka Post | main feed | 7 | ✅ (bn) |
| ~~Kaler Kantho~~, ~~Samakal~~, ~~Ittefaq~~ | — | — | ❌ **dropped**: 403 |
| ~~bdnews24~~, ~~Jugantor~~ | — | — | ❌ **dropped**: unparseable feed |

**Guinea** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Guinéenews | main feed | 9 | ✅ (fr) |
| Africaguinée | main feed | 9 | ✅ (fr) |
| Guinée360 | main feed | 8 | ✅ (fr) |
| Vision Guinée | main feed | 7 | ✅ (fr) |
| Mosaïque Guinée | main feed | 7 | ✅ (fr) |
| ~~Guinéematin~~ | — | — | ❌ **dropped**: HTTP 507 |

**Gabon** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Gabonreview | main feed | 9 | ✅ (fr) |
| AGP Gabon | main feed | 9 | ✅ (state news agency, fr) |
| Gabonactu | main feed | 8 | ✅ (fr) |
| Direct Infos Gabon | main feed | 7 | ✅ (fr) |
| Gabonclic | main feed | 7 | ✅ (fr) |
| ~~L'Union~~, ~~Gabon 24~~, ~~Info241~~ | — | — | ❌ **dropped**: unreachable / 403 |

**Chad** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Alwihda Info | main feed | 9 | ✅ (fr) |
| Tchadinfos | main feed | 8 | ✅ (fr) |
| Le Pays | main feed | 7 | ✅ (fr) |
| ~~Ialtchad~~, ~~Journal du Tchad~~, ~~Toumaï Web~~ | — | — | ❌ **dropped**: 404 / unreachable |
| ~~Tchadone~~ | — | — | ❌ **dropped**: stale |

**Mauritania** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Sahara Medias | main feed | 9 | ✅ (French edition, fr) |
| Le Calame | main feed | 8 | ✅ (fr) |
| Kassataya | main feed | 7 | ✅ (fr) |
| Rimweb | main feed | 7 | ✅ (fr) |
| ~~Cridem~~, ~~Alakhbar~~, ~~Essirage~~ | — | — | ❌ **dropped**: 404 |

**The Gambia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Standard | main feed | 9 | ✅ (en) |
| Foroyaa | main feed | 9 | ✅ (en) |
| Kerr Fatou | main feed | 7 | ✅ (en) |
| ~~The Point~~, ~~Gainako~~, ~~Freedom~~ | — | — | ❌ **dropped**: 404 |
| ~~The Fatu Network~~ | — | — | ❌ **dropped**: HTTP 522 |

**Liberia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| FrontPage Africa | main feed | 9 | ✅ (en) |
| The New Dawn | main feed | 8 | ✅ (en) |
| Smart News Liberia | main feed | 7 | ✅ (en) |
| The Analyst | main feed | 7 | ✅ (en) |
| ~~Liberian Observer~~ | — | — | ❌ **dropped**: HTTP 429 |
| ~~New Republic~~, ~~Bush Chicken~~ | — | — | ❌ **dropped**: unreachable / 404 |

**Somalia** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Caasimada Online | main feed | 9 | ✅ (so) |
| Goobjoog News | main feed | 8 | ✅ (so) |
| Horseed Media | main feed | 8 | ✅ (so) |
| Puntland Post | main feed | 7 | ✅ (so) |
| ~~Somali Guardian~~ | — | — | ❌ **skipped**: English, and its newest item was a day old |
| ~~Hiiraan~~, ~~Garowe Online~~, ~~Radio Shabelle~~ | — | — | ❌ **dropped**: 404 / 500 / unreachable |
| ~~Radio Dalsan~~ | — | — | ❌ **dropped**: stale |

Somali gets its own stopword list: particles such as *oo*, *ayaa* and *lagu* sit between almost every pair of words.

**Guyana** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Guyana Chronicle | main feed | 9 | ✅ (state-owned, en) |
| Kaieteur News | main feed | 9 | ✅ (en) |
| iNews Guyana | main feed | 8 | ✅ (en) |
| Demerara Waves | main feed | 7 | ✅ (en) |
| ~~Stabroek News~~, ~~News Room~~ | — | — | ❌ **dropped**: 404 / 403 |

**Suriname** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Starnieuws | main feed | 9 | ✅ (nl) |
| De Ware Tijd | main feed | 9 | ✅ (nl) |
| Waterkant | main feed | 8 | ✅ (nl) |
| Suriname Herald | main feed | 8 | ✅ (nl) |
| ~~Sun Times~~ | — | — | ❌ **dropped**: unreachable |

**Yemen** (added 2026-10-06)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Aden al-Ghad | main feed | 8 | ✅ (ar) |
| Yemen Monitor | main feed | 8 | ✅ (ar) |
| Al-Sahwa Net | main feed | 7 | ✅ (Islah party, ar) |
| ~~Al-Masdar Online~~, ~~Saba~~, ~~Yemen Akhbar~~ | — | — | ❌ **dropped**: 403 |
| ~~Al-Ayyam~~, ~~26 September~~ | — | — | ❌ **dropped**: 404 |

**China** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| China News Service | China, society | 9 | ✅ (state agency, zh) |
| CGTN | main feed | 8 | ✅ (state broadcaster, en) |
| South China Morning Post | main feed | 8 | ✅ (China section; SCMP is Hong Kong-based, en) |
| VOA Chinese | main feed | 7 | ✅ (US government broadcaster, zh) |
| RFA Mandarin | main feed | 7 | ✅ (US government broadcaster, low volume, zh) |

China News Service is the only mainland outlet with a current feed (China Daily, Xinhua, People's Daily and Global Times are 404 or months old), so VOA and RFA's Chinese services, CGTN and SCMP's China section fill it out.

**Belarus** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| BelTA | main feed | 9 | ✅ (state agency, ru) |
| Onliner | main feed | 8 | ✅ (ru) |
| Radio Svaboda | main feed | 8 | ✅ (RFE/RL, be) |

Not used: Zerkalo and Euroradio 403; Nasha Niva malformed; Belsat 404.

**Georgia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Netgazeti | main feed | 8 | ✅ (ka) |
| Publika | main feed | 8 | ✅ (ka) |
| Radio Tavisupleba | main feed | 8 | ✅ (RFE/RL, ka) |
| Civil.ge | main feed | 7 | ✅ (en) |

Not used: 1TV, Imedi, Tabula and BM.ge 403; Interpressnews and Georgia Today serve HTML.

**Montenegro** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Vijesti | main feed | 9 | ✅ (sr) |
| CdM | main feed | 8 | ✅ (sr) |
| MINA | main feed | 8 | ✅ (sr) |
| Aktuelno | main feed | 7 | ✅ (sr) |
| Borba | main feed | 7 | ✅ (sr) |

Not used: RTCG and Dan 404; Pobjeda and Standard serve HTML. IN4S works but writes in Cyrillic, which never clusters with the others.

**Albania** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Euronews Albania | main feed | 9 | ✅ (sq) |
| BalkanWeb | main feed | 8 | ✅ (sq) |
| ABC News Albania | main feed | 8 | ✅ (sq) |
| Vizion Plus | main feed | 7 | ✅ (sq) |
| Gazeta Shqiptare | main feed | 7 | ✅ (sq) |
| Reporter.al | main feed | 7 | ✅ (investigative, low volume, sq) |

Not used: Top Channel, Panorama, Tema and Ora News 403; A2 and Report TV 404.

**Palestine** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Al-Quds | main feed | 9 | ✅ (ar) |
| Quds News Network | main feed | 8 | ✅ (ar) |
| Felesteen | main feed | 7 | ✅ (Hamas-aligned, ar) |
| Palestinian Information Center | main feed | 7 | ✅ (Hamas-aligned, ar) |

Not used: WAFA and Paltoday 404, Maan 403, Al-Ayyam unreachable.

**Libya** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Al Marsad | main feed | 8 | ✅ (close to the eastern government, ar) |
| Ean Libya | main feed | 8 | ✅ (ar) |
| Libya Herald | main feed | 8 | ✅ (low volume, en) |

Not used: Al-Wasat 403; Libya Observer 404; Libya Al-Ahrar and Afrigate unreachable.

**Iraq** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Baghdad Today | main feed | 8 | ✅ (ar) |
| Al-Mada | main feed | 8 | ✅ (ar) |
| Al-Masalah | main feed | 7 | ✅ (ar) |
| Iraqi News | main feed | 7 | ✅ (en) |

Not used: INA and Al-Sabaah 403; Shafaq, Alsumaria, Rudaw and Kurdistan24 serve HTML or malformed XML.

**Myanmar** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Irrawaddy | main feed | 9 | ✅ (en) |
| DVB | main feed | 8 | ✅ (en) |
| Myanmar Now | main feed | 8 | ✅ (en) |
| The Global New Light of Myanmar | main feed | 7 | ✅ (state paper, en) |

Not used: Mizzima 403; the Burmese editions of The Irrawaddy and DVB are 403 or malformed; Eleven Myanmar stale.

**Kyrgyzstan** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Kabar | main feed | 9 | ✅ (state agency, ky) |
| Azattyk | main feed | 8 | ✅ (RFE/RL, ky) |
| Sputnik Kyrgyzstan | main feed | 7 | ✅ (Russian state media, ru) |

Not used: Kaktus and AKIpress 404; 24.kg stale; Kloop posts a few items a week.

**Namibia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| The Namibian | main feed | 9 | ✅ (en) |
| New Era | main feed | 8 | ✅ (en) |
| Windhoek Observer | main feed | 8 | ✅ (en) |

Not used: Namibian Sun serves HTML; NBC 404.

**Honduras** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Proceso Digital | main feed | 8 | ✅ (es) |
| HCH | main feed | 7 | ✅ (es) |
| Hondudiario | main feed | 7 | ✅ (es) |
| Criterio.hn | main feed | 7 | ✅ (low volume, es) |

Not used: La Tribuna and Radio América 403; La Prensa and El Heraldo 404.

**Bolivia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| El Deber | main feed | 9 | ✅ (es) |
| Opinión | main feed | 8 | ✅ (es) |
| El Diario | main feed | 7 | ✅ (es) |
| EJU! | main feed | 6 | ✅ (low volume, es) |

Not used: La Razón and El Potosí 403; Los Tiempos and Correo del Sur 404; Página Siete times out.

**El Salvador** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Diario Co Latino | main feed | 8 | ✅ (es) |
| La Página | main feed | 7 | ✅ (es) |
| YSUCA | main feed | 7 | ✅ (es) |

Not used: La Prensa Gráfica and El Diario de Hoy 403; El Faro and Diario El Mundo serve HTML.

**DR Congo** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Radio Okapi | main feed | 9 | ✅ (fr) |
| Actualite.cd | main feed | 8 | ✅ (fr) |
| Politico.cd | main feed | 7 | ✅ (fr) |
| Actu30 | main feed | 6 | ✅ (fr) |

Not used: 7sur7.cd, Mediacongo and Deskeco 404; Zoom Eco 403.

**Cameroon** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Camer.be | main feed | 8 | ✅ (fr) |
| Lebledparle | main feed | 7 | ✅ (fr) |
| 237online | main feed | 7 | ✅ (fr) |
| Investir au Cameroun | main feed | 6 | ✅ (business news, fr) |

Not used: Cameroon Tribune, Actu Cameroun and Mimi Mefo Info 403; Journal du Cameroun unreachable.

**Tanzania** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Daily News | main feed | 9 | ✅ (en) |
| HabariLeo | main feed | 8 | ✅ (sw) |
| Jamhuri | main feed | 7 | ✅ (sw) |
| Global Publishers | main feed | 6 | ✅ (sw) |

Not used: The Citizen and Mwananchi 404; IPP Media 403.

**Rwanda** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Kigali Today | main feed | 8 | ✅ (rw) |
| Umuseke | main feed | 7 | ✅ (rw) |
| Taarifa | main feed | 7 | ✅ (en) |
| KT Press | main feed | 7 | ✅ (low volume, en) |

Not used: The New Times serves HTML; IGIHE 404.

**Haiti** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Le Nouvelliste | main feed | 9 | ✅ (English edition, low volume, en) |
| AlterPresse | main feed | 8 | ✅ (low volume, fr) |
| Juno7 | main feed | 7 | ✅ (low volume, fr) |

Le Nouvelliste's feed is its English edition. Not used: HaitiLibre 403; Loop Haiti unreachable.

**Paraguay** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ABC Color | main feed | 9 | ✅ (es) |
| La Nación | main feed | 8 | ✅ (es) |
| El Nacional | main feed | 7 | ✅ (es) |
| La Clave | main feed | 7 | ✅ (es) |

ABC Color and La Nación are Arc sites, read with `?outputType=xml`. Not used: Última Hora 404.

**Panama** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| La Prensa | main feed | 9 | ✅ (es) |
| TVN | main feed | 8 | ✅ (es) |
| Crítica | main feed | 7 | ✅ (es) |

La Prensa is an Arc site, read with `?outputType=xml`.

**Cambodia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| VOD | main feed | 8 | ✅ (km) |
| Kampuchea Thmey | main feed | 7 | ✅ (km) |
| DAP News | main feed | 7 | ✅ (km) |
| Khmer Times | main feed | 8 | ✅ (en) |
| CambojaNews | main feed | 7 | ✅ (en) |

Not used: Phnom Penh Post, Post Khmer and Fresh News 403.

**Mozambique** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Notícias | main feed | 9 | ✅ (pt) |
| O País | main feed | 8 | ✅ (low volume, pt) |
| Carta de Moçambique | main feed | 8 | ✅ (pt) |
| Evidências | main feed | 7 | ✅ (pt) |
| Club of Mozambique | main feed | 7 | ✅ (en) |
| AIM | main feed | 8 | ✅ (state agency, en) |

**Bahamas** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| ZNS | main feed | 8 | ✅ (state broadcaster, en) |
| The Tribune | main feed | 9 | ✅ (en) |
| Our News | main feed | 7 | ✅ (en) |
| Bahamas Press | main feed | 6 | ✅ (en) |

Not used: Nassau Guardian 404.

**Belize** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Breaking Belize News | main feed | 8 | ✅ (en) |
| Amandala | main feed | 8 | ✅ (en) |
| Love FM | main feed | 7 | ✅ (en) |
| The San Pedro Sun | main feed | 6 | ✅ (en) |

Not used: Channel 5 unreachable.

**Togo** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| iciLome | main feed | 8 | ✅ (fr) |
| Le Temps | main feed | 7 | ✅ (fr) |
| 24heureinfo | main feed | 7 | ✅ (fr) |
| Togo Top News | main feed | 6 | ✅ (fr) |
| Togoweb | main feed | 6 | ✅ (fr) |

**South Sudan** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Radio Tamazuj | main feed | 9 | ✅ (en) |
| Eye Radio | main feed | 8 | ✅ (en) |
| Sudans Post | main feed | 7 | ✅ (en) |

**Central African Republic** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Radio Ndeke Luka | main feed | 9 | ✅ (fr) |
| Corbeau News | main feed | 7 | ✅ (opposition-leaning, fr) |
| Oubangui Médias | main feed | 7 | ✅ (fr) |

**Ethiopia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Fana | main feed | 9 | ✅ (close to the ruling party, am) |
| The Reporter | main feed | 8 | ✅ (am) |
| BBC Amharic | main feed | 8 | ✅ (low volume, am) |
| Ethio FM | main feed | 6 | ✅ (am) |

Fana's English feed is not used, so the country clusters in one language.

**United Arab Emirates** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Gulf News | main feed | 9 | ✅ (en) |
| The National | main feed | 9 | ✅ (en) |
| Khaleej Times | main feed | 8 | ✅ (en) |

The National is an Arc site, read with `?outputType=xml`. Not used: Sky News Arabia (pan-Arab); Al Bayan and Emarat Al Youm 404; Al Khaleej, Al Ittihad and Emirates 24|7 serve no items; Gulf Today and Arabian Business 403.

**Jordan** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Roya News | main feed | 9 | ✅ (ar) |
| Hala Akhbar | main feed | 7 | ✅ (ar) |
| Al Wakeel News | main feed | 7 | ✅ (ar) |

Al Wakeel's dates run about three hours ahead, so the newest are clamped to the fetch time. Not used: Al-Ghad, Addustour, Al-Rai and Jordan Times 403; Ammon, Petra and Assawsana serve no items; Al-Mamlaka 404.

**Nicaragua** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Confidencial | main feed | 9 | ✅ (in exile, es) |
| Divergentes | main feed | 8 | ✅ (in exile, es) |
| Despacho 505 | main feed | 7 | ✅ (in exile, es) |
| Nicaragua Investiga | main feed | 7 | ✅ (es) |

The domestic independent press has been shut down, so three of the four work from exile. Not used: La Prensa, El 19 and Artículo 66 403; 100% Noticias unreachable.

**Sierra Leone** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Calabash Newspaper | main feed | 8 | ✅ (en) |
| Sierraloaded | main feed | 7 | ✅ (en) |
| Sierra Leone Telegraph | main feed | 7 | ✅ (low volume, en) |

Not used: Awoko and SLBC unreachable; AYV stale; Sierra Leone Live 403.

**Mongolia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| iKon | main feed | 8 | ✅ (mn) |
| Eguur | main feed | 7 | ✅ (mn) |
| Ugluu | main feed | 6 | ✅ (low volume, mn) |

Mongolian gets a short stopword list (*ба* "and", *нь*, *энэ* "this", dates, the country's name). Eguur's feed lists its whole archive (about 10,000 items, 3 MB), so every feed is now cut to its 200 newest items before caching. Not used: Montsame and Olloo 403; News.mn and Zindaa serve no items; Gogo, iSee, Unuudur and Baabar 404.

**New Caledonia** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Nouvelle-Calédonie La 1ère | main feed | 9 | ✅ (fr) |
| Les Nouvelles Calédoniennes | main feed | 8 | ✅ (fr) |

Two outlets only. Not used: RRB and Caledonia 404; NCI and RNC unreachable.

**Timor-Leste** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Tatoli | main feed | 9 | ✅ (tet) |
| Timor Post | main feed | 8 | ✅ (tet) |

Two outlets only, both in Tetum, which gets a short stopword list (*ba*, *iha*, *no*, *ho*, *sira*, *kona-ba*, the country's name). Not used: Independente 404; Tempo Timor malformed; GMN TV and RTTL unreachable.

**Fiji** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Fiji One | main feed | 8 | ✅ (en) |
| FBC News | main feed | 7 | ✅ (mostly sport, en) |

Two outlets only. FBC's main feed is mostly sport, and it has no news-only feed. Not used: Fiji Times serves no items; Fiji Sun 404; Fiji Village malformed.

**Solomon Islands** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Island Sun | main feed | 8 | ✅ (en) |
| SIBC | main feed | 8 | ✅ (en) |

Two outlets only. Not used: Solomon Star 403; Solomon Times 404.

**Djibouti** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| La Nation | main feed | 8 | ✅ (state paper, fr) |
| RTD | main feed | 8 | ✅ (state broadcaster, low volume, fr) |

Two outlets only, both state media, a few items a day. Not used: ADI 404.

**Congo-Brazzaville** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Vox | main feed | 7 | ✅ (low volume, fr) |
| Journal de Brazza | main feed | 7 | ✅ (low volume, fr) |

Two outlets only, a few items a day. Not used: Adiac's feed only lists its e-paper; Les Echos du Congo-Brazzaville unreachable.

**Burundi** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Iwacu | main feed | 8 | ✅ (low volume, fr) |
| SOS Médias Burundi | main feed | 7 | ✅ (in exile, low volume, fr) |

Two outlets only, a few items a day. Not used: Isanganiro and Burundi Eco stale; RTNB, Ikiriho and Radio Culture unreachable.

**Lesotho** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Newsday | main feed | 7 | ✅ (mostly culture and lifestyle, en) |
| The Reporter | main feed | 7 | ✅ (low volume, en) |
| Public Eye | main feed | 6 | ✅ (low volume, en) |

Small feeds only. Not used: Lesotho Times malformed; The Post 403; Sunday Express 404.

**Qatar** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Qatar Tribune | news sitemap | 8 | ✅ (en) |
| Al Raya | news sitemap | 8 | ✅ (ar) |
| Doha News | main feed | 6 | ✅ (en) |

Qatar Tribune and Al Raya publish Google News sitemaps (titles and dates, no summaries) rather than RSS. Gulf Times sitemap stale since May; Peninsula and Al Sharq serve HTML; Lusail 403.

**Kuwait** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Kuwait Times | news sitemap | 8 | ✅ (en) |
| Arab Times | news sitemap | 7 | ✅ (en) |
| Al Jarida | news sitemap | 8 | ✅ (ar) |
| Times Kuwait | main feed | 6 | ✅ (en) |

Kuwait Times, Arab Times and Al Jarida via news sitemaps. Al Rai and Al Qabas 404; KUNA unreachable.

**Oman** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Oman Observer | news sitemap | 8 | ✅ (en) |
| Oman Daily | news sitemap | 8 | ✅ (ar) |
| Al Roya | main feed | 7 | ✅ (ar) |

Oman Observer and Oman Daily via news sitemaps. Times of Oman has only plain sitemaps (no titles); Muscat Daily malformed; Atheer and ONA 403.

**Trinidad and Tobago** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Trinidad Express | news sitemap | 8 | ✅ (en) |

One outlet only, via its news sitemap. Newsday unreachable; Guardian 404; CNC3 403; TV6 429.

**Angola** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Correio da Kianda | main feed | 7 | ✅ (pt) |
| Expansão | main feed | 8 | ✅ (pt) |
| Maka Angola | main feed | 7 | ✅ (low volume, pt) |

Maka Angola posts a few investigations a week. Novo Jornal, Jornal de Angola, ANGOP, O País and Ver Angola serve HTML or malformed feeds; Angola24Horas and Club-K 403.

**Botswana** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Sunday Standard | main feed | 8 | ✅ (weekly, en) |
| Botswana Gazette | main feed | 7 | ✅ (en) |
| Weekend Post | main feed | 7 | ✅ (weekly, en) |
| The Voice | main feed | 6 | ✅ (en) |

Small feeds; Sunday Standard and Weekend Post are weeklies. Mmegi news sitemap stale; Patriot 500; Daily News unreachable.

**Papua New Guinea** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Post-Courier | main feed | 8 | ✅ (en) |
| FM100 | main feed | 6 | ✅ (en) |

Two outlets. The National 403 (its news sitemap is empty); EMTV serves no items to our User-Agent; Loop PNG unreachable.

**Eswatini** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Times of Eswatini | main feed | 8 | ✅ (en) |

One outlet only. Eswatini Observer and Eswatini Post unreachable; Eswatini Daily News stale.

**Laos** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Lao Economic Daily | main feed | 7 | ✅ (Lao, lo) |
| RFA Lao | main feed | 7 | ✅ (Lao, lo) |

Both in Lao, split into words with Intl.Segmenter. Laotian Times now mostly carries press releases; Vientiane Times 404; KPL malformed.

**Bhutan** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| BBS | main feed | 8 | ✅ (en) |
| The Bhutanese | main feed | 7 | ✅ (en) |
| The Bhutan Live | main feed | 6 | ✅ (en) |

Small feeds. Kuensel 404.

**Turkmenistan** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Azatlyk Radiosy | main feed | 7 | ✅ (RFE/RL, tk) |
| Turkmen.news | main feed | 7 | ✅ (in exile, ru) |
| Chronicles of Turkmenistan | main feed | 7 | ✅ (in exile, ru) |

No independent press inside the country: Azatlyk (RFE/RL, in Turkmen) and two exile outlets in Russian, a few items a day each. Turkmenportal 403; Orient 404.

**Niger** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Le Sahel | main feed | 7 | ✅ (state daily, fr) |
| Tamtaminfo | main feed | 7 | ✅ (fr) |
| Niger Inter | main feed | 6 | ✅ (fr) |
| Aïr Info | main feed | 6 | ✅ (fr) |

A few items a day or less each. ActuNiger and Niger Diaspora 404.

**Guinea-Bissau** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Conosaba do Porto | main feed | 6 | ✅ (news blog, pt) |

One outlet only, a news blog. O Democrata, Capital News and gbissau.com 404.

**Equatorial Guinea** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Real Equatorial Guinea | main feed | 6 | ✅ (es) |
| Diario Rombe | main feed | 6 | ✅ (in exile, low volume, es) |

Two outlets; Diario Rombe works from exile and posts a few items a week. Ahora EG 403; Guinea Ecuatorial Press 404.

**Eritrea** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Shabait | main feed | 7 | ✅ (state media, en) |

State media only (the Information Ministry). Assenna and Madote unreachable; Eritrea Hub malformed.

**Vanuatu** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Vanuatu Daily Post | news sitemap | 8 | ✅ (en) |

One outlet only, via its news sitemap.

**Greenland** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| KNR | main feed | 8 | ✅ (undated items, da) |

One outlet only; its Danish feed has no dates. Sermitsiaq 404.

**North Korea** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| NK News | main feed | 8 | ✅ (based in Seoul, en) |
| Daily NK | main feed | 7 | ✅ (based in Seoul, en) |

No reachable domestic media; both outlets report on the country from Seoul.

**Malta** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Newsbook | main feed | 8 | ✅ (en) |
| Lovin Malta | main feed | 7 | ✅ (en) |

Two outlets; Newsbook through its English feed. Times of Malta 403; Malta Today 404; Malta Independent malformed; TVM serves no items.

**Mauritius** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Defimedia | main feed | 8 | ✅ (fr) |
| ION News | main feed | 7 | ✅ (fr) |
| NewsMoris | main feed | 6 | ✅ (en) |

L Express 403; Le Mauricien stale.

**Maldives** (added 2026-10-07)

| Outlet | Feeds | Authority | Status |
| --- | --- | --- | --- |
| Sun Online | main feed | 8 | ✅ (en) |
| Atoll Times | main feed | 7 | ✅ (en) |

English editions only: the Dhivehi feeds (Sun, PSM) would need their own tokenizer, since folding strips the vowel signs Thaana words are written with. Edition and Avas 404.

Some outlets publish a Google News sitemap (`<urlset>` with `<news:news>` entries) instead of RSS. `parseFeed` recognises one by its namespace and reads each entry's `<loc>`, `<news:title>`, `<news:publication_date>` and `<image:loc>`; there is no summary. Plain sitemaps (URLs only, as Times of Oman's) are not used.

Lao is split into words with `Intl.Segmenter('lo')`, as Khmer is, with Lao digits made ASCII and a short stopword list (*ແລະ* "and", *ໃນ* "in", *ຂອງ* "of", *ການ*, the country's name).

Countries too small for the 110m map (Malta, Mauritius, the Maldives, Singapore) get a round marker 0.6° across at their `COUNTRIES` centre, so they can be hovered and clicked like any other country.

Khmer is split into words with `Intl.Segmenter('km')`, as Thai is, after dropping the zero-width spaces some outlets put between words; vowel signs are kept and Khmer digits made ASCII. It gets a short stopword list (*និង* "and", *ក្នុង* "in", *ការ*, the country's name).

Swahili, Kinyarwanda, Kyrgyz and Belarusian get short stopword lists: class-agreement particles (*ya*, *wa*, *za*), Kinyarwanda's elided *n'*, *z'*, *cy'*, and the country's own name, as for Somali. Kyrgyz also drops *млрд*, *сом* and *түздү* ("amounted to"): two different nine-month revenue stories had been joined on them.

`isNotNews` also drops Honduran front-page items ("Portada Digital, Miércoles 07.10.2026"), The Global New Light of Myanmar's daily e-paper entry (a bare "7 October 2026"), and VOA Chinese's broadcast episodes ("美国之音中文广播 (2026年10月7日) …").

Not added yet, for lack of usable feeds: Bahrain (feeds 404 or malformed, and no news sitemap found) and Brunei (Borneo Bulletin and Media Permata 403; The Bruneian carries press releases).

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
5. Merge. CI redeploys the Worker (`COUNTRIES` is bundled into the front end).
6. Hand your probe history to the Pi, so it won't fetch a feed you probed less than 15 minutes ago: copy your `data/.cache/http.json` to the Pi (e.g. `scp data/.cache/http.json pi:/tmp/probe-cache.json`) and run `pnpm cache:merge /tmp/probe-cache.json` there, between two runs (not at the top of the hour). Then `git pull && pnpm install --frozen-lockfile`. The next run publishes the new country.

## Next steps

**GDELT adapter.** Interface and stub are in [adapters/gdelt.ts](packages/ingest/src/adapters/gdelt.ts). The plan is to query the free GDELT DOC 2.0 API (`mode=ArtList`, `sourcecountry:<FIPS>`, `sourcelang:`, 6 h timespan) through the same `HttpCache` throttle. Each article's domain would count as its outlet, with a domain → authority table. GDELT uses FIPS 10-4 codes rather than ISO, so an ISO→FIPS map is needed. This is the path to covering most countries without curating feeds one by one. It returns no snippets, so `description` would be `null`.

**More regions.** France, Germany, Spain, Italy, the US, Canada, Australia, Brazil, Mexico, Argentina and India have regions (see Sources). Adding a country means adding its entries to `REGIONS` ([shared](packages/shared/src/index.ts)), sources with `region`, and an outline file next to `regions-fr.json`, registered in `REGION_SHAPES` ([GlobeView.tsx](apps/web/src/components/GlobeView.tsx)). Natural Earth 10m admin-1 has states and provinces for most countries. Later, tag national outlets' stories with a region from place names in titles.

**Cross-border stories.** Use the history archive as a background corpus, so words that make the news every day (ministries, leaders' names) weigh less than this week's names. Link regions too, and match names across scripts (Трамп ↔ Trump) with a small transliteration table.

**Clustering.** Use the snippet's top tokens as a weaker second signal, and add a time-decay so a story from 40 hours ago doesn't absorb today's follow-up.

**Ops.** Done: the hourly health check (see [Health check](#health-check)). Later, move the ingest off the Pi, e.g. to a Workers Paid cron trigger with feeds fanned out across invocations.

## Notes

- Country shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:110m admin-0 (public domain), bundled locally, coordinates rounded to 0.01°. In Natural Earth, `ISO_A2` is `-99` for France and Norway, so the build script uses `ISO_A2_EH`.
- French region shapes: IGN Admin Express (2018), via [france-geojson](https://github.com/gregoiredavid/france-geojson), under the [Licence Ouverte / Etalab](https://www.etalab.gouv.fr/licence-ouverte-open-licence/); coordinates rounded to 0.01°. Loaded only when France is opened.
- German Länder shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-1 (public domain), coordinates rounded to 0.01°. Loaded only when Germany is opened.
- US state shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:50m admin-1 (public domain), coordinates rounded to 0.01°. Loaded only when the United States is opened.
- Spanish and Italian region shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-1 (public domain), whose provinces are merged into regions along their shared borders (topojson), coordinates rounded to 0.01°. Ceuta and Melilla are left out. Loaded only when Spain or Italy is opened.
- Canadian, Australian and Brazilian region shapes: [Natural Earth](https://www.naturalearthdata.com/) 1:50m admin-1 (public domain), coordinates rounded to 0.01°. Australia's Jervis Bay Territory is left out. Loaded only when Canada, Australia or Brazil is opened.
- Mexican, Argentine and Indian region shapes: [Natural Earth](https://www.naturalearthdata.com/) admin-1 (public domain), 1:10m for Mexico and Argentina and 1:50m for India, coordinates rounded to 0.01°. Mexico City is relabelled from MX-DIF to MX-CMX and four Indian codes to ISO 3166-2's current ones (IN-CG, IN-OD, IN-TS, IN-UK); Mexico's unassigned islet MX-X01~ is left out. Loaded only when Mexico, Argentina or India is opened.
- `data/sample/` is a real `pnpm ingest` output from 2026-10-06. Its relative times will read "days ago" until you run an ingest.
