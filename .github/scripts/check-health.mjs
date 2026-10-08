// Hourly health check of the live site (see .github/workflows/health.yml).
// Fails, so GitHub emails the repo owner, when the data has stopped updating
// (the Pi is offline or publishing broke) or a country or region has had no
// working feed for too long. Feeds failing on their own are listed as warnings.
// Plain Node (fetch is built in), no dependencies.

const SITE = (process.env.SITE_URL || 'https://news-globe.maze-td.workers.dev').replace(/\/+$/, '');
/** The ingest runs hourly: two missed runs plus slack. */
const MAX_DATA_AGE_H = Number(process.env.MAX_DATA_AGE_H || 3);
/** A unit dark this long fails the check; shorter outages are only warnings. */
const MAX_DARK_H = Number(process.env.MAX_DARK_H || 12);

const now = Date.now();
const hoursSince = (iso) => (iso ? (now - Date.parse(iso)) / 3_600_000 : Infinity);
const fmt = (h) => (Number.isFinite(h) ? `${h.toFixed(1)} h` : 'never worked');
const problems = [];
const summary = [`## News Globe health — ${new Date(now).toISOString()}`, '', `Site: ${SITE}`, ''];

async function getJson(path) {
  const res = await fetch(`${SITE}/data/${path}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

try {
  const index = await getJson('index.json');
  if (!index) {
    problems.push('index.json is missing: nothing has been published.');
  } else {
    const age = hoursSince(index.updatedAt);
    summary.push(`- Data updated ${fmt(age)} ago (${index.updatedAt}), ${index.countries.length} countries, ${index.regions?.length ?? 0} regions`);
    if (age > MAX_DATA_AGE_H) {
      problems.push(`Data is ${fmt(age)} old (limit ${MAX_DATA_AGE_H} h): is the Pi's ingest running and publishing?`);
    }
  }

  const status = await getJson('status.json');
  if (!status) {
    summary.push('- status.json not published yet (needs an ingest run with the health report)');
  } else {
    const { total, failing } = status.feeds;
    summary.push(`- ${failing.length} of ${total} feeds failing, ${status.darkUnits.length} countries/regions with no working feed`);
    for (const unit of status.darkUnits) {
      const h = hoursSince(unit.since);
      const line = `${unit.code} has had no working feed for ${fmt(h)}`;
      if (h > MAX_DARK_H) problems.push(line);
      else console.log(`::warning::${line}`);
    }
    if (failing.length) {
      summary.push('', '| Feed | Unit | Last status | Failing for |', '| --- | --- | --- | --- |');
      for (const f of failing) {
        summary.push(`| ${f.source} | ${f.unit} | ${String(f.lastStatus).replace(/\|/g, '/')} | ${fmt(hoursSince(f.lastOkAt))} |`);
      }
    }
  }
} catch (err) {
  problems.push(`Could not read the site: ${err instanceof Error ? err.message : err}`);
}

if (problems.length) {
  summary.splice(4, 0, '### ❌ Problems', '', ...problems.map((p) => `- ${p}`), '');
  for (const p of problems) console.log(`::error::${p}`);
} else {
  summary.splice(4, 0, '### ✅ Healthy', '');
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
} else {
  console.log(summary.join('\n'));
}
process.exitCode = problems.length ? 1 : 0;
