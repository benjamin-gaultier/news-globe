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

**LLM review.** [.github/workflows/claude-review.yml](.github/workflows/claude-review.yml) has Claude (Opus 5.5) review every pull request, with inline comments marked 🔴 (blocking) or 🟡 (not blocking) and a summary that ends with `Verdict: ✅ no blocking issues` or `Verdict: ❌ blocking issues`. It only comments: it never pushes, approves or merges. Until the secret below exists, it skips with a notice instead of failing. It signs in with a Claude subscription. Run `claude setup-token` on a machine logged in to Claude Code and save the token as the `CLAUDE_CODE_OAUTH_TOKEN` repository secret. Each review counts against that plan's usage. The workflow needs the Claude GitHub App installed on the repo. It is the only LLM in the project, and it reviews code only: the pipeline and the app still make no LLM calls.

**Shading.** Each country on the globe is shaded by how many outlets covered its top story in the last 24 hours (≤1, 2, 3, 4, 5+; a legend sits in the corner), and hovering shows that headline. The regions of an open country get the same treatment in amber. Both read `topTitle` and `topOutlets` from `index.json`, so no country file is fetched until a click ([lib/heat.ts](apps/web/src/lib/heat.ts)).

**Search.** The search bar at the top (`/` jumps to it) searches every current headline of every country and region as you type; Escape clears it. Matching ignores accents and case, every word must match, and the place name counts too ("budget brittany"). Results are grouped by place, most widely covered first. A result opens its country or region panel, scrolled to that story and highlighted, so the publisher link is one tap away. The index, `/data/search.json` (about 270 KB gzipped, no links), comes from the hourly workflow and loads on the first search ([lib/search.ts](apps/web/src/lib/search.ts)).

**Today.** The **Today** button (or `/#today`) opens the day at a glance: the most widely covered national stories (at most two per country), the stories new or rising this hour, the first cross-border stories, and the stories that have stayed in a country's top 3 for 6 hours or more. Each opens its story page. Headlines are translated on the device where the browser can. The page reads `/data/today.json` (about 4 KB gzipped), which the hourly workflow derives with `trends` and `search` ([derived.ts](packages/ingest/src/derived.ts)).

**Story pages.** A story's **+N other sources** (or **Story details**) button opens its page in the panel: the headline and snippet, a link to the publisher and a **Share** button, its rank at each of today's runs, every outlet covering it in the order they published (the first is marked), and the same story in other countries, each opening its page there. **Also in** chips and the **Across borders** list open these pages too. A page has its own link, `/#FR/<story id>`; if that story has since left the top list, the page says so ([StoryDetail.tsx](apps/web/src/components/StoryDetail.tsx)).

**Rising.** Stories in a country or region panel carry a **New** badge (first ranked this hour) or a **↑ Rising** badge (up 3 or more places since the previous run), and a sparkline of their rank over today's runs. The legend's **Change** switch shades the globe by how many of each place's top 5 stories are new or rising this hour, which shows where the news is moving rather than how widely it's covered. Countries whose #1 story is new or rising this hour, and covered by 2 or more outlets, pulse with an orange ring (the 10 best-covered at most; none while a country is open, in history, or with reduced motion; with reduced motion the globe doesn't spin on its own either), and their tooltip says so. All of this comes from `/data/trends.json`, which the hourly workflow derives from the [history archive](#history-archive) ([derived.ts](packages/ingest/src/derived.ts)). Badges only appear when the file describes the run on screen.

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
  src/kv.ts                        the Cloudflare KV REST client publish.ts and archive-remote.ts share
packages/shared/     Types for the data contract + country metadata (used by both sides)
data/
  sample/            committed sample output (served until the first ingest)
  index.json, status.json, countries/*.json, regions/*.json, .cache/   generated, gitignored
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

Config is in [apps/web/wrangler.jsonc](apps/web/wrangler.jsonc) and the Worker in [apps/web/worker/index.ts](apps/web/worker/index.ts). Static files never invoke the Worker; only `/data/*` does (`run_worker_first`), and it serves only the public files: the bundle's, the history days and the derived files. Each response but the history days (too big to hash on every request) carries a weak `ETag` from its body's hash, so a browser revalidating after `max-age` gets a body-less 304 when the file hasn't changed.

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

[archive-remote.ts](packages/ingest/src/archive-remote.ts) (`pnpm --filter @news-globe/ingest archive:remote`) reads the published `bundle` from KV, and [archive.ts](packages/ingest/src/archive.ts) folds that run's ranked stories, for every country and region, into one gzipped value per UTC day, stored in the same KV namespace as `archive/YYYY-MM-DD`. Two things run it:
- **The Pi, right after each run**, with `ARCHIVE_AFTER_RUN=1` in its `.env` ([watch.ts](packages/ingest/src/watch.ts)). History, trends, Today and translations then follow every run. Put `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` in the same `.env` for translations. This is the preferred setup: it costs no GitHub Actions minutes, and GitHub often delays or skips scheduled workflows.
- **The [Health workflow](.github/workflows/health.yml)**, as a fallback (and the only archiver until the Pi does it). A run the Pi already archived is skipped, so running both is safe.

Each story gets one record per day and unit (headline, link, outlet ids, first and last run that ranked it, best rank, peak outlet count). A cluster in a later run that shares any article with a story continues that story. Each run also stores its ranked list per unit, so the day can be replayed hour by hour. The format is `ArchiveDay` in [shared](packages/shared/src/index.ts). The Worker serves each day at `/data/archive/YYYY-MM-DD.json` for the History view. Nothing writes the archive locally; to try History with `vite dev`, save a day from KV as `data/archive/YYYY-MM-DD.json.gz` and the dev server serves it the same way.

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

Every outlet, by country and region, with what probing each candidate feed found (status, dropped feeds and why), is in [docs/sources.md](docs/sources.md). The config itself is [sources.config.ts](packages/ingest/src/sources.config.ts).

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

**More regions.** France, Germany, Spain, Italy, the US, Canada, Australia, Brazil, Mexico, Argentina and India have regions (see [docs/sources.md](docs/sources.md)). Adding a country means adding its entries to `REGIONS` ([shared](packages/shared/src/index.ts)), sources with `region`, and an outline file next to `regions-fr.json` (named `regions-xx.json`; [GlobeView.tsx](apps/web/src/components/GlobeView.tsx) picks it up by name). Natural Earth 10m admin-1 has states and provinces for most countries. Later, tag national outlets' stories with a region from place names in titles.

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
