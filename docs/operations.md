# Operations

How the site is deployed and kept running. The overview is in the [README](../README.md).

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

Why the ingest runs on the Pi rather than on a Cloudflare Cron Trigger: a free-plan Worker gets 10 ms of CPU per invocation, and parsing ~25 feeds and clustering ~400 titles takes far more than that. KV's free tier allows 1,000 writes a day, so the publisher packs `index.json` and every country and region file, section files included, into a single `bundle` value (a JSON offset table, then the files back to back; see [bundle.ts](../packages/shared/src/bundle.ts)) and uploads it only when its hash changed: at most 24 writes a day, whatever the number of countries. The Worker slices the requested file out of the bundle.

## Front end (Worker + static assets)

Config is in [apps/web/wrangler.jsonc](../apps/web/wrangler.jsonc) and the Worker in [apps/web/worker/index.ts](../apps/web/worker/index.ts). Static files never invoke the Worker; only `/data/*` does (`run_worker_first`), and it serves only the public files: the bundle's, the history days and the derived files. Each response carries a weak `ETag` (from its body's hash; for a finished history day, from its date, as it never changes and is too big to hash on every request), and the front end fetches with `cache: 'no-cache'`, so revalidating an unchanged file gets a body-less 304. Today's and yesterday's history days still grow and get none.

Every push to `main` deploys it: the `deploy` job in [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs `vite build` and `wrangler deploy` once the `check` job (typecheck, tests, build) has passed. Pull requests are checked but never deployed. To redeploy without a new commit, run the workflow by hand (Actions → CI → Run workflow, on `main`).

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

## Ingest on a Raspberry Pi

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
3. Clone the repo and fill in `.env`:
   ```bash
   git clone https://github.com/benjamin-gaultier/news-globe.git ~/news-globe
   cd ~/news-globe && pnpm install --frozen-lockfile
   cp .env.example .env && chmod 600 .env && nano .env   # the account ID, the KV namespace ID and the token
   pnpm ingest                                         # should end with "[publish] uploaded ... as one bundle"
   ```
   Running from a private fork? Give the Pi a **read-only deploy key** for that repo only, and clone through it:
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
   git clone github-news-globe:<you>/news-globe.git ~/news-globe
   ```
   When moving the ingest from another machine, copy its `data/.cache/` over first. The Pi then knows when each feed was last fetched (and its ETag), so the 15-minute limit holds across the switch.
4. Install the service. [deploy/raspberry-pi/news-globe-ingest.service](../deploy/raspberry-pi/news-globe-ingest.service) assumes user `pi`; replace `pi` with your user name:
   ```bash
   sed "s#/home/pi#$HOME#g; s#^User=pi#User=$USER#" deploy/raspberry-pi/news-globe-ingest.service > /tmp/news-globe-ingest.service
   sudo cp /tmp/news-globe-ingest.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now news-globe-ingest
   journalctl -u news-globe-ingest -f
   ```

Only one machine should run the ingest. Two pollers would double the requests to every feed.

Publishing turns on when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` and `CLOUDFLARE_API_TOKEN` are all set, either in the environment or in the repo-root `.env`. If none are set, the ingest only writes local files, as in development. If the upload fails (network, token), the run still writes `data/` but exits with code 1, so it shows as failed (and with `ARCHIVE_AFTER_RUN=1` the watcher skips that run's archive step); the next run retries; [publish.ts](../packages/ingest/src/publish.ts) keeps the last bundle's hash in `data/.cache/publish.json`.

## Health check

After each run (not `--offline`), [health.ts](../packages/ingest/src/health.ts) writes `data/status.json`, which is published with the other files at `/data/status.json`. It lists every feed whose last request failed (an HTTP error, a timeout, or a body that would not parse) with its last status and last success, plus the **dark** files: a country's or region's top or section file (`DE`, `DE.sport`) with no working feed left, whose headlines are therefore frozen.

[.github/workflows/health.yml](../.github/workflows/health.yml) checks the live site every hour, at :23, and then adds the latest run to the [history archive](#history-archive) ([check-health.mjs](../.github/scripts/check-health.mjs), plain Node). The run **fails** when:

- `index.json` is more than 3 hours old, meaning the Pi is offline or publishing broke, or
- a country's or region's file (top or section) has been dark for more than 12 hours.

A failed scheduled run makes GitHub email whoever last changed the workflow's schedule (Settings → Notifications → Actions controls this). Shorter outages and single failing feeds show up as warnings and in a table on each run's summary page. Run it on demand with Actions → Health → Run workflow. Set the `SITE_URL` repository variable to check a different deployment.

## History archive

[archive-remote.ts](../packages/ingest/src/archive-remote.ts) (`pnpm --filter @news-globe/ingest archive:remote`) reads the published `bundle` from KV, and [archive.ts](../packages/ingest/src/archive.ts) folds that run's ranked stories, for every country and region, into one gzipped value per UTC day, stored in the same KV namespace as `archive/YYYY-MM-DD`. Two things run it:
- **The Pi, right after each run**, with `ARCHIVE_AFTER_RUN=1` in its `.env` ([watch.ts](../packages/ingest/src/watch.ts)). History, trends, Today and translations then follow every run. Put `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` in the same `.env` for translations. This is the preferred setup: it costs no GitHub Actions minutes, and GitHub often delays or skips scheduled workflows.
- **The [Health workflow](../.github/workflows/health.yml)**, as a fallback (and the only archiver until the Pi does it). A run the Pi already archived is skipped, so running both is safe.

Each story gets one record per day and unit (headline, link, outlet ids, first and last run that ranked it, best rank, peak outlet count). A cluster in a later run that shares any article with a story continues that story. Each run also stores its ranked list per unit, so the day can be replayed hour by hour. The format is `ArchiveDay` in [shared](../packages/shared/src/index.ts). The Worker serves each day at `/data/archive/YYYY-MM-DD.json` for the History view. Nothing writes the archive locally; to try History with `vite dev`, save a day from KV as `data/archive/YYYY-MM-DD.json.gz` and the dev server serves it the same way.

- Derived files: after archiving, the same step writes `trends` (badges, rank histories and change scores for the latest run, about 80 KB gzipped), `search` (every ranked headline with its country or region, about 270 KB gzipped) and `today` (the Today page, about 4 KB gzipped). All three are stored gzipped in KV and served by the Worker as `/data/trends.json`, `/data/search.json` and `/data/today.json`.
- Writes: four KV writes per new run (the day, `trends`, `search`, `today`), plus up to two with translation on (`translations`, `translate-cache`): at most 144 a day on top of the bundle's 24. A run already in the day (the workflow ran twice before the next ingest) is not uploaded again.
- Credentials: the workflow uses the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets of the deploy job. The token's "Edit Cloudflare Workers" template includes Workers KV Storage edit.
- Size: a day built from the sample is about 0.7 MB gzipped, and real days, with new stories every hour, should be about 1.5–2 MB. KV's free 1 GB therefore holds roughly 18 months. Before that, move older days to R2 or start pruning.
- A failed archive step fails the hourly run, so GitHub emails, just like a failed health check.

To update the Pi by hand (e.g. after adding a country; merging it to `main` already redeployed the Worker): `cd ~/news-globe && git pull && pnpm install --frozen-lockfile`. No restart is needed: the watcher starts every run as a fresh `cli.ts` process, so the next run uses the new code and feeds. Only a change to `watch.ts` itself, or to its schedule, needs `sudo systemctl restart news-globe-ingest`.

**Auto-update.** With `AUTO_UPDATE=1` in `.env`, the watcher keeps the Pi on `main` by itself ([update.ts](../packages/ingest/src/update.ts)). Before each hourly run it fetches `origin/main` and fast-forwards, then reruns `pnpm install --frozen-lockfile` when `package.json` or the lockfile changed. When the watcher itself changed (`watch.ts`, `update.ts`, `env.ts`, or the schedule, which lives in `watch.ts`), it exits with code 75, so systemd (`Restart=on-failure`) starts it again a minute later on the new code. It never merges, rebases or discards anything: with local changes, a diverged branch, another branch checked out or a failed fetch, it logs why in the journal and runs the code it has. `main` only moves through pull requests whose CI passed. Turning it on takes one last manual update: `git pull && pnpm install --frozen-lockfile`, add `AUTO_UPDATE=1` to `.env`, then `sudo systemctl restart news-globe-ingest`.

**Archive after each run.** With `ARCHIVE_AFTER_RUN=1` in `.env`, the watcher runs the [history archive](#history-archive) step after each successful run (plus translations when the Azure variables are set). A failed archive step is logged and left to the Health workflow.

## Headline translation

For non-English countries the panel has an **Original / English** toggle. The choice is remembered in `localStorage`.
- **Most-seen headlines, translated hourly** (optional): Today's stories, each country's top story (the globe's tooltips) and the cross-border stories are translated by the [Health workflow](#health-check) with [Azure AI Translator](https://learn.microsoft.com/azure/ai-services/translator/)'s free F0 tier (2M characters a month) and published as `/data/translations.json`. The site shows them wherever English is asked for (Today, the globe's tooltips, a country's list in English mode, story pages), on every device. Each headline is translated once and remembered in KV (`translate-cache`, forgotten after 14 days unused); a monthly budget of 1.8M characters keeps it inside the free tier, and a refused request (quota, key) only stops that run's translating. Without the secrets nothing is translated ([translate.ts](../packages/ingest/src/translate.ts)). To set it up:
  1. In the [Azure portal](https://portal.azure.com), create a **Translator** resource with pricing tier **F0 (Free)**. The free tier refuses requests past its limit rather than billing.
  2. From **Keys and Endpoint**, add **Key 1** and the **Location/Region** (e.g. `westeurope`) as repository secrets `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION`.
  3. The next hourly run logs `[translate] N headlines in English`. The first run translates ~250 headlines; later runs only the new ones.
- Other headlines and snippets are translated **in the browser** with the built-in [Translator API](https://developer.chrome.com/docs/ai/translator-api) (Chrome 138+ on desktop). The model runs on-device and nothing is sent to a translation service ([lib/translate.ts](../apps/web/src/lib/translate.ts)).
- Where the browser can't translate on-device (phones, Safari, Firefox), foreign headlines get a **Translate ↗** link that opens the headline and snippet in Google Translate (the app on phones that have it): on a country's list in English mode, on every story page, and on Today. Nothing is sent anywhere until the link is tapped.
- Headline links always go to the publisher. A foreign story's page also has **Read in English ↗**, which opens the whole article through Google Translate's web proxy; in a country's list it shows in English mode when the browser translates on-device.
- Browsers without the API (Safari, Firefox, most phones) keep the original for headlines the workflow hasn't translated, with a note pointing to those links.

## LLM review

**LLM review.** [.github/workflows/claude-review.yml](../.github/workflows/claude-review.yml) has Claude (Opus 5.5) review every pull request, with inline comments marked 🔴 (blocking) or 🟡 (not blocking) and a summary that ends with `Verdict: ✅ no blocking issues` or `Verdict: ❌ blocking issues`. It only comments: it never pushes, approves or merges. Until the secret below exists, it skips with a notice instead of failing. It signs in with a Claude subscription. Run `claude setup-token` on a machine logged in to Claude Code and save the token as the `CLAUDE_CODE_OAUTH_TOKEN` repository secret. Each review counts against that plan's usage. The workflow needs the Claude GitHub App installed on the repo. It is the only LLM in the project, and it reviews code only: the pipeline and the app still make no LLM calls.
