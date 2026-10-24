import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type CountryFile, type IndexFile } from '@news-globe/shared';
import type { RawItem } from '../src/adapters';
import { runIngest } from '../src/pipeline';
import { FETCHED_CATEGORIES, feedUrlsOf, INGEST_SETTINGS, type Category, type SourceConfig } from '../src/sources.config';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'news-globe-pipeline-'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

function source(id: string, country: string, extra: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id,
    name: id.toUpperCase(),
    type: 'rss',
    country,
    language: 'fr',
    feeds: { top: [`https://${id}.example/rss`] },
    authority: 5,
    ...extra,
  };
}

function item(outlet: string, slug: string, title: string, publishedAt: string | null): RawItem {
  return { title, url: `https://${outlet}.example/${slug}`, description: null, publishedAt, imageUrl: null };
}

/** Seed the HTTP cache so an offline run reads these items as each feed's last retrieval. */
async function seedCache(feeds: Record<string, RawItem[]>, retrievedAt = hoursAgo(0.25)) {
  const entries = Object.fromEntries(
    Object.entries(feeds).map(([url, items]) => [url, { lastAttemptAt: retrievedAt, retrievedAt, items }]),
  );
  await mkdir(join(dir, '.cache'), { recursive: true });
  await writeFile(join(dir, '.cache', 'http.json'), JSON.stringify({ version: 1, entries }));
}

const readJson = async <T>(...parts: string[]): Promise<T> => JSON.parse(await readFile(join(dir, ...parts), 'utf8')) as T;

const exists = (...parts: string[]) =>
  readFile(join(dir, ...parts)).then(
    () => true,
    () => false,
  );

function ingest(sources: SourceConfig[], { offline = true, categories }: { offline?: boolean; categories?: readonly Category[] } = {}) {
  const lines: string[] = [];
  const run = runIngest({ dataDir: dir, sources, offline, categories, now: () => NOW, log: (m) => lines.push(m) });
  return run.then((summary) => ({ summary, log: lines.join('\n') }));
}

const STORY = 'Le gouvernement présente le budget de la sécurité sociale au Parlement';

describe('runIngest', () => {
  it('clusters each country, writes its file and an index with the top story', async () => {
    const lemonde = source('lemonde', 'FR', { authority: 10 });
    const figaro = source('figaro', 'FR', { authority: 8 });
    const nyt = source('nyt', 'US', { language: 'en' });
    await seedCache({
      [lemonde.feeds.top![0]!]: [
        item('lemonde', 'budget', STORY, hoursAgo(2)),
        item('lemonde', 'tempete', 'Tempête Alex : des milliers de foyers privés d’électricité en Bretagne', hoursAgo(3)),
      ],
      [figaro.feeds.top![0]!]: [
        item('figaro', 'budget', `${STORY} ce mercredi`, hoursAgo(1)),
        // Same canonical URL twice (tracking parameter): kept once.
        item('figaro', 'greve?utm_source=rss', 'Grève à la SNCF : le trafic sera très perturbé jeudi', hoursAgo(4)),
        item('figaro', 'greve', 'Grève à la SNCF : le trafic sera très perturbé jeudi', hoursAgo(4)),
      ],
      [nyt.feeds.top![0]!]: [item('nyt', 'senate', 'Senate passes the spending bill after a long night of votes', hoursAgo(1))],
    });

    const { summary, log } = await ingest([lemonde, figaro, nyt]);

    expect(summary.countries).toEqual([
      { code: 'FR', category: 'top', articles: 4, clusters: 3, written: true },
      { code: 'US', category: 'top', articles: 1, clusters: 1, written: true },
    ]);
    expect(summary.regions).toEqual([]);
    expect(log).toContain('FR: 4 articles → 3 clusters (1 multi-outlet), wrote top 3');

    const fr = await readJson<CountryFile>('countries', 'FR.json');
    expect(fr).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      countryCode: 'FR',
      countryName: 'France',
      updatedAt: new Date(NOW).toISOString(),
    });
    // The story two outlets cover ranks first, headed by the higher-authority outlet.
    const [top] = fr.clusters;
    expect(top!.outletCount).toBe(2);
    expect(top!.representative.source.id).toBe('lemonde');
    expect(top!.related.map((a) => a.source.id)).toEqual(['figaro']);
    expect(top!.latestPublishedAt).toBe(hoursAgo(1));

    const index = await readJson<IndexFile>('index.json');
    expect(index.schemaVersion).toBe(SCHEMA_VERSION);
    expect(index.updatedAt).toBe(new Date(NOW).toISOString());
    expect(index.countries).toEqual([
      { code: 'FR', name: 'France', updatedAt: index.updatedAt, clusterCount: 3, topTitle: STORY, topOutlets: 2, activeOutlets: 2 },
      expect.objectContaining({ code: 'US', clusterCount: 1 }),
    ]);
    expect(index.regions).toEqual([]);
    expect(Array.isArray(index.world)).toBe(true);
  });

  it('drops stale, templated, misdecoded and non-news items', async () => {
    const lemonde = source('lemonde', 'FR');
    await seedCache({
      [lemonde.feeds.top![0]!]: [
        item('lemonde', 'fresh', 'Le Sénat adopte la réforme des retraites en première lecture', hoursAgo(1)),
        item(
          'lemonde',
          'old',
          'Une très vieille histoire publiée il y a plusieurs jours déjà',
          hoursAgo(INGEST_SETTINGS.maxArticleAgeHours + 1),
        ),
        item('lemonde', 'tpl', 'Vidéo. $content.TitleNoTags', hoursAgo(1)),
        item('lemonde', 'bad', 'Pol�cia prende suspeito em opera��o', hoursAgo(1)),
      ],
    });

    const { summary } = await ingest([lemonde]);

    expect(summary.countries).toEqual([{ code: 'FR', category: 'top', articles: 1, clusters: 1, written: true }]);
    const fr = await readJson<CountryFile>('countries', 'FR.json');
    expect(fr.clusters.map((c) => c.representative.title)).toEqual(['Le Sénat adopte la réforme des retraites en première lecture']);
  });

  it('routes regional outlets to their region file and drops republished copies', async () => {
    const ouest = source('ouestfrance', 'FR', { region: 'FR-BRE' });
    const telegramme = source('letelegramme', 'FR', { region: 'FR-BRE' });
    const title = 'Rennes : le nouveau métro attire déjà des milliers de voyageurs';
    await seedCache({
      [ouest.feeds.top![0]!]: [item('ouestfrance', 'metro', title, hoursAgo(3))],
      // A partner rerunning the same headline later is not a second outlet covering it.
      [telegramme.feeds.top![0]!]: [item('letelegramme', 'metro', title.toUpperCase(), hoursAgo(1))],
    });

    const { summary } = await ingest([ouest, telegramme]);

    expect(summary.countries).toEqual([]);
    expect(summary.regions).toEqual([{ code: 'FR-BRE', category: 'top', articles: 1, clusters: 1, written: true }]);
    expect(await exists('countries', 'FR.json')).toBe(false);

    const bre = await readJson<CountryFile>('regions', 'FR-BRE.json');
    expect(bre).toMatchObject({ countryCode: 'FR', countryName: 'France', regionCode: 'FR-BRE', regionName: 'Brittany' });
    expect(bre.clusters).toHaveLength(1);
    expect(bre.clusters[0]!.representative.source.id).toBe('ouestfrance');
    expect(bre.clusters[0]!.representative.regionCode).toBe('FR-BRE');

    const index = await readJson<IndexFile>('index.json');
    expect(index.countries).toEqual([]);
    expect(index.regions).toEqual([expect.objectContaining({ code: 'FR-BRE', name: 'Brittany', topTitle: title })]);
  });

  it('keeps the previous file when every feed of a unit comes back empty', async () => {
    const lemonde = source('lemonde', 'FR');
    const previous: CountryFile = {
      schemaVersion: SCHEMA_VERSION,
      countryCode: 'FR',
      countryName: 'France',
      updatedAt: hoursAgo(5),
      clusters: [],
    };
    await mkdir(join(dir, 'countries'), { recursive: true });
    await writeFile(join(dir, 'countries', 'FR.json'), JSON.stringify(previous));
    await seedCache({});

    const { summary, log } = await ingest([lemonde]);

    expect(summary.countries).toEqual([{ code: 'FR', category: 'top', articles: 0, clusters: 0, written: false }]);
    expect(log).toContain('FR: no articles — keeping previous file');
    expect(await readJson<CountryFile>('countries', 'FR.json')).toEqual(previous);
    const index = await readJson<IndexFile>('index.json');
    // The index carries the previous file's own timestamp, not this run's.
    expect(index.countries).toEqual([{ code: 'FR', name: 'France', updatedAt: hoursAgo(5), clusterCount: 0 }]);
  });

  it('writes nothing for a unit with no articles and no previous file', async () => {
    const lemonde = source('lemonde', 'FR');
    await seedCache({});

    const { summary, log } = await ingest([lemonde]);

    expect(summary.countries).toEqual([{ code: 'FR', category: 'top', articles: 0, clusters: 0, written: false }]);
    expect(log).toContain('FR: no articles — nothing to write');
    expect(await exists('countries', 'FR.json')).toBe(false);
    expect((await readJson<IndexFile>('index.json')).countries).toEqual([]);
  });

  it('ignores sources whose country or region is unknown', async () => {
    const nowhere = source('nowhere', 'ZZ');
    const lost = source('lost', 'FR', { region: 'FR-ZZZ' });
    await seedCache({
      [nowhere.feeds.top![0]!]: [item('nowhere', 'a', 'A story from a country the globe does not know', hoursAgo(1))],
      [lost.feeds.top![0]!]: [item('lost', 'a', 'A story from a region the globe does not know', hoursAgo(1))],
    });

    const { summary } = await ingest([nowhere, lost]);

    expect(summary).toEqual({ countries: [], regions: [] });
    const index = await readJson<IndexFile>('index.json');
    expect(index.countries).toEqual([]);
    expect(index.regions).toEqual([]);
  });

  it('dates undated and future-dated items by when they were first seen, and never into the future', async () => {
    const lemonde = source('lemonde', 'FR');
    const retrievedAt = hoursAgo(2);
    await seedCache(
      {
        [lemonde.feeds.top![0]!]: [
          item('lemonde', 'undated', 'Le Conseil constitutionnel valide la loi sur l’immigration', null),
          {
            ...item('lemonde', 'evergreen', 'Les chiffres clés du budget de l’État expliqués', null),
            firstSeenAt: hoursAgo(30),
          },
          item(
            'lemonde',
            'future',
            'Les agriculteurs manifestent à nouveau devant les préfectures',
            new Date(NOW + 3_600_000).toISOString(),
          ),
          // Dated ahead by a feed whose URLs carry tomorrow's local date: first seen wins over the URL's.
          {
            ...item(
              'lemonde',
              '2026/10/09/ahead',
              'Le Sénat rejette la réforme des retraites en commission',
              new Date(NOW + 5 * 3_600_000).toISOString(),
            ),
            firstSeenAt: hoursAgo(5),
          },
          // Its URL carries the day it was first seen, at 21:00 UTC: the URL's midday is less precise.
          {
            ...item(
              'lemonde',
              '2026/10/07/evening',
              'Le gouvernement présente son plan pour le logement',
              new Date(NOW + 2 * 3_600_000).toISOString(),
            ),
            firstSeenAt: hoursAgo(15),
          },
          // A preview first seen 10 hours ago, dated at a kick-off that has since passed.
          {
            ...item('lemonde', 'kickoff', 'Le XV de France dévoile sa composition pour le Tournoi', hoursAgo(1)),
            firstSeenAt: hoursAgo(10),
          },
        ],
      },
      retrievedAt,
    );

    await ingest([lemonde]);

    const fr = await readJson<CountryFile>('countries', 'FR.json');
    const published = Object.fromEntries(fr.clusters.map((c) => [c.representative.url.split('/').pop(), c.representative.publishedAt]));
    // The evergreen item, listed by every fetch for 30 hours, ranks by that age rather than as new.
    expect(published).toEqual({
      undated: retrievedAt,
      evergreen: hoursAgo(30),
      future: retrievedAt,
      ahead: hoursAgo(5),
      evening: hoursAgo(15),
      kickoff: hoursAgo(10),
    });
  });

  it('leaves sports stories out of top files: in a sports section, filed under a sports category, or in the outlet’s sport feed', async () => {
    const lemonde = source('lemonde', 'FR', {
      feeds: { top: ['https://lemonde.example/rss'], sport: ['https://lemonde.example/sport/rss'] },
    });
    const aps = source('aps', 'FR');
    const punch = source('punch', 'FR');
    const match = 'Premier League : Nicolas Jackson signe un doublé face à Manchester City';
    await seedCache({
      'https://lemonde.example/rss': [item('lemonde', 'budget', STORY, hoursAgo(2)), item('lemonde', 'jackson', match, hoursAgo(1))],
      'https://lemonde.example/sport/rss': [item('lemonde', 'jackson', match, hoursAgo(1))],
      [aps.feeds.top![0]!]: [
        item('aps', 'sports/football/jackson', `${match} à Birmingham`, hoursAgo(1)),
        item('aps', 'budget', `${STORY} ce mercredi`, hoursAgo(1)),
      ],
      [punch.feeds.top![0]!]: [
        { ...item('punch', 'jackson-brace', `${match} : le doublé`, hoursAgo(1)), categories: ['Sports', 'Aston Villa'] },
        { ...item('punch', 'budget', `${STORY} jeudi`, hoursAgo(1)), categories: ['News'] },
      ],
    });

    const { log } = await ingest([lemonde, aps, punch]);

    const top = await readJson<CountryFile>('countries', 'FR.json');
    expect(top.clusters.map((c) => [c.representative.title, c.outletCount])).toEqual([[STORY, 3]]);
    const sport = await readJson<CountryFile>('countries', 'FR.sport.json');
    expect(sport.clusters.map((c) => c.representative.title)).toEqual([match]);
    expect(log).toContain('top files: 3 sports stories dropped');
  });

  it('counts as active only the outlets with a story in the last 24 hours', async () => {
    const lemonde = source('lemonde', 'FR');
    const figaro = source('figaro', 'FR');
    const stale = source('stale', 'FR');
    await seedCache({
      [lemonde.feeds.top![0]!]: [item('lemonde', 'budget', STORY, hoursAgo(2))],
      [figaro.feeds.top![0]!]: [item('figaro', 'budget', `${STORY} ce mercredi`, hoursAgo(1))],
      // A feed that still answers but stopped updating a day and a half ago.
      [stale.feeds.top![0]!]: [item('stale', 'greve', 'Grève à la SNCF : le trafic sera très perturbé jeudi', hoursAgo(36))],
    });

    await ingest([lemonde, figaro, stale]);

    const index = await readJson<IndexFile>('index.json');
    expect(index.countries).toEqual([expect.objectContaining({ code: 'FR', activeOutlets: 2 })]);
  });

  it('writes each category to a file of its own, and none for a category without feeds', async () => {
    const lemonde = source('lemonde', 'FR', {
      authority: 10,
      feeds: { top: ['https://lemonde.example/rss'], sport: ['https://lemonde.example/sport/rss'] },
    });
    const figaro = source('figaro', 'FR', {
      feeds: { top: ['https://figaro.example/rss'], sport: ['https://figaro.example/sport/rss'] },
    });
    const match = 'Le PSG s’impose face à Marseille au Parc des Princes et prend la tête';
    await seedCache({
      'https://lemonde.example/rss': [item('lemonde', 'budget', STORY, hoursAgo(2))],
      'https://figaro.example/rss': [item('figaro', 'greve', 'Grève à la SNCF : le trafic sera très perturbé jeudi', hoursAgo(1))],
      'https://lemonde.example/sport/rss': [
        item('lemonde', 'psg', match, hoursAgo(3)),
        item('lemonde', 'tour', 'Le parcours du Tour de France 2027 dévoilé à Paris', hoursAgo(4)),
      ],
      'https://figaro.example/sport/rss': [item('figaro', 'psg', `${match} de la Ligue 1`, hoursAgo(2))],
    });

    const { summary, log } = await ingest([lemonde, figaro]);

    expect(summary.countries).toEqual([
      { code: 'FR', category: 'top', articles: 2, clusters: 2, written: true },
      { code: 'FR', category: 'sport', articles: 3, clusters: 2, written: true },
    ]);
    expect(log).toContain('FR.sport: 3 articles → 2 clusters (1 multi-outlet), wrote top 2');

    // The sport file is clustered and ranked on its own; top stories stay in the top file.
    const sport = await readJson<CountryFile>('countries', 'FR.sport.json');
    expect(sport).toMatchObject({ countryCode: 'FR', countryName: 'France', category: 'sport', updatedAt: new Date(NOW).toISOString() });
    expect(sport.clusters.map((c) => [c.representative.title, c.outletCount])).toEqual([
      [match, 2],
      ['Le parcours du Tour de France 2027 dévoilé à Paris', 1],
    ]);
    const top = await readJson<CountryFile>('countries', 'FR.json');
    expect(top.category).toBeUndefined();
    expect(top.clusters.map((c) => c.representative.title)).toEqual(['Grève à la SNCF : le trafic sera très perturbé jeudi', STORY]);

    // No outlet has a business feed: no business file, and the index lists only what exists.
    expect(await exists('countries', 'FR.business.json')).toBe(false);
    const index = await readJson<IndexFile>('index.json');
    expect(index.countries).toEqual([expect.objectContaining({ code: 'FR', clusterCount: 2, categories: ['top', 'sport'] })]);
  });

  it('lets a sport-only outlet make a sport file without creating or touching the top file', async () => {
    const kicker = source('kicker', 'DE', { language: 'de', feeds: { sport: ['https://kicker.example/rss'] } });
    const stale = '{"stale":true}';
    await mkdir(join(dir, 'countries'), { recursive: true });
    await writeFile(join(dir, 'countries', 'DE.json'), stale);
    await seedCache({
      'https://kicker.example/rss': [item('kicker', 'bayern', 'Bayern schießt sich gegen Leipzig den Frust von der Seele', hoursAgo(1))],
    });

    const { summary, log } = await ingest([kicker]);

    expect(summary.countries).toEqual([{ code: 'DE', category: 'sport', articles: 1, clusters: 1, written: true }]);
    expect(log).not.toMatch(/^DE:/m);
    expect((await readJson<CountryFile>('countries', 'DE.sport.json')).clusters).toHaveLength(1);
    expect(await readFile(join(dir, 'countries', 'DE.json'), 'utf8')).toBe(stale);
    // The index lists top files only: a section with no top file to hang from isn't offered.
    expect((await readJson<IndexFile>('index.json')).countries).toEqual([]);
  });

  it('keeps the previous section file, and its place in the index, when its feeds come back empty', async () => {
    const lemonde = source('lemonde', 'FR', {
      feeds: { top: ['https://lemonde.example/rss'], business: ['https://lemonde.example/eco/rss'] },
    });
    const previous: CountryFile = {
      schemaVersion: SCHEMA_VERSION,
      countryCode: 'FR',
      countryName: 'France',
      category: 'business',
      updatedAt: hoursAgo(5),
      clusters: [],
    };
    await mkdir(join(dir, 'countries'), { recursive: true });
    await writeFile(join(dir, 'countries', 'FR.business.json'), JSON.stringify(previous));
    await seedCache({ 'https://lemonde.example/rss': [item('lemonde', 'budget', STORY, hoursAgo(1))] });

    const { summary, log } = await ingest([lemonde]);

    expect(summary.countries).toEqual([
      { code: 'FR', category: 'top', articles: 1, clusters: 1, written: true },
      { code: 'FR', category: 'business', articles: 0, clusters: 0, written: false },
    ]);
    expect(log).toContain('FR.business: no articles — keeping previous file');
    expect(await readJson<CountryFile>('countries', 'FR.business.json')).toEqual(previous);
    expect((await readJson<IndexFile>('index.json')).countries).toEqual([
      expect.objectContaining({ code: 'FR', updatedAt: new Date(NOW).toISOString(), categories: ['top', 'business'] }),
    ]);
  });

  it('writes a region’s section files next to its top file', async () => {
    const ouest = source('ouestfrance', 'FR', {
      region: 'FR-BRE',
      feeds: { top: ['https://ouestfrance.example/rss'], sport: ['https://ouestfrance.example/sport/rss'] },
    });
    await seedCache({
      'https://ouestfrance.example/rss': [
        item('ouestfrance', 'metro', 'Rennes : le nouveau métro attire déjà des milliers de voyageurs', hoursAgo(1)),
      ],
      'https://ouestfrance.example/sport/rss': [
        item('ouestfrance', 'srfc', 'Le Stade Rennais s’offre une victoire de prestige à Lyon', hoursAgo(1)),
      ],
    });

    const { summary } = await ingest([ouest]);

    expect(summary.regions.map((u) => `${u.code} ${u.category}`)).toEqual(['FR-BRE top', 'FR-BRE sport']);
    expect(await readJson<CountryFile>('regions', 'FR-BRE.sport.json')).toMatchObject({ regionCode: 'FR-BRE', category: 'sport' });
    expect((await readJson<IndexFile>('index.json')).regions).toEqual([
      expect.objectContaining({ code: 'FR-BRE', categories: ['top', 'sport'] }),
    ]);
  });

  describe('requests', () => {
    const topUrl = 'https://lemonde.example/rss';
    const sportUrl = 'https://lemonde.example/sport/rss';
    const businessUrl = 'https://lemonde.example/eco/rss';
    const lemonde = source('lemonde', 'FR', { feeds: { top: [topUrl], sport: [sportUrl], business: [businessUrl] } });
    const handelsblatt = source('handelsblatt', 'DE', { language: 'de', feeds: { business: ['https://handelsblatt.example/rss'] } });
    // Every feed serves a story of its own, so any feed that is read shows up as an article.
    const stories: Record<string, string> = {
      [topUrl]: STORY,
      [sportUrl]: 'Le PSG s’impose face à Marseille au Parc des Princes',
      [businessUrl]: 'La Bourse de Paris termine la semaine en nette hausse',
      'https://handelsblatt.example/rss': 'Die Bundesbank senkt ihre Prognose für das Wachstum',
    };

    /** Serves each feed live; returns the URLs requested so far. */
    function serveFeeds() {
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        return new Response(
          `<?xml version="1.0"?><rss version="2.0"><channel><title>${url}</title><item><title>${stories[url]}</title>` +
            `<link>${url}/story</link><pubDate>${new Date(NOW - 3_600_000).toUTCString()}</pubDate></item></channel></rss>`,
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      return () => fetchMock.mock.calls.map(([input]) => String(input));
    }

    it('go to every feed in FETCHED_CATEGORIES by default', async () => {
      const requested = serveFeeds();

      const { summary } = await ingest([lemonde], { offline: false });

      expect(requested()).toEqual(feedUrlsOf(lemonde, FETCHED_CATEGORIES));
      expect(summary.countries.map((u) => u.category)).toEqual([...FETCHED_CATEGORIES]);
    });

    it('leave out feeds in a category the run doesn’t fetch, and outlets with only those', async () => {
      const requested = serveFeeds();

      const { summary } = await ingest([lemonde, handelsblatt], { offline: false, categories: ['top', 'sport'] });

      expect(requested()).toEqual([topUrl, sportUrl]);
      const cache = await readJson<{ entries: Record<string, unknown> }>('.cache', 'http.json');
      expect(Object.keys(cache.entries)).toEqual([topUrl, sportUrl]);
      // The business-only outlet adds no unit, and the business feed no file.
      expect(summary).toEqual({
        countries: [
          { code: 'FR', category: 'top', articles: 1, clusters: 1, written: true },
          { code: 'FR', category: 'sport', articles: 1, clusters: 1, written: true },
        ],
        regions: [],
      });
      expect(await exists('countries', 'FR.business.json')).toBe(false);
      expect(await exists('countries', 'DE.business.json')).toBe(false);
    });
  });
});
