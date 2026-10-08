import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type CountryFile, type IndexFile } from '@news-globe/shared';
import type { RawItem } from '../src/adapters';
import { runIngest } from '../src/pipeline';
import { INGEST_SETTINGS, type SourceConfig } from '../src/sources.config';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'news-globe-pipeline-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function source(id: string, country: string, extra: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id,
    name: id.toUpperCase(),
    type: 'rss',
    country,
    language: 'fr',
    feedUrls: [`https://${id}.example/rss`],
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

const readJson = async <T>(...parts: string[]): Promise<T> =>
  JSON.parse(await readFile(join(dir, ...parts), 'utf8')) as T;

const exists = (...parts: string[]) =>
  readFile(join(dir, ...parts)).then(
    () => true,
    () => false,
  );

function ingest(sources: SourceConfig[]) {
  const lines: string[] = [];
  const run = runIngest({ dataDir: dir, sources, offline: true, now: () => NOW, log: (m) => lines.push(m) });
  return run.then((summary) => ({ summary, log: lines.join('\n') }));
}

const STORY = 'Le gouvernement présente le budget de la sécurité sociale au Parlement';

describe('runIngest', () => {
  it('clusters each country, writes its file and an index with the top story', async () => {
    const lemonde = source('lemonde', 'FR', { authority: 10 });
    const figaro = source('figaro', 'FR', { authority: 8 });
    const nyt = source('nyt', 'US', { language: 'en' });
    await seedCache({
      [lemonde.feedUrls[0]!]: [
        item('lemonde', 'budget', STORY, hoursAgo(2)),
        item('lemonde', 'tempete', 'Tempête Alex : des milliers de foyers privés d’électricité en Bretagne', hoursAgo(3)),
      ],
      [figaro.feedUrls[0]!]: [
        item('figaro', 'budget', `${STORY} ce mercredi`, hoursAgo(1)),
        // Same canonical URL twice (tracking parameter): kept once.
        item('figaro', 'greve?utm_source=rss', 'Grève à la SNCF : le trafic sera très perturbé jeudi', hoursAgo(4)),
        item('figaro', 'greve', 'Grève à la SNCF : le trafic sera très perturbé jeudi', hoursAgo(4)),
      ],
      [nyt.feedUrls[0]!]: [item('nyt', 'senate', 'Senate passes the spending bill after a long night of votes', hoursAgo(1))],
    });

    const { summary, log } = await ingest([lemonde, figaro, nyt]);

    expect(summary.countries).toEqual([
      { code: 'FR', articles: 4, clusters: 3, written: true },
      { code: 'US', articles: 1, clusters: 1, written: true },
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
      { code: 'FR', name: 'France', updatedAt: index.updatedAt, clusterCount: 3, topTitle: STORY, topOutlets: 2 },
      expect.objectContaining({ code: 'US', clusterCount: 1 }),
    ]);
    expect(index.regions).toEqual([]);
    expect(Array.isArray(index.world)).toBe(true);
  });

  it('drops stale, templated, misdecoded and non-news items', async () => {
    const lemonde = source('lemonde', 'FR');
    await seedCache({
      [lemonde.feedUrls[0]!]: [
        item('lemonde', 'fresh', 'Le Sénat adopte la réforme des retraites en première lecture', hoursAgo(1)),
        item('lemonde', 'old', 'Une très vieille histoire publiée il y a plusieurs jours déjà', hoursAgo(INGEST_SETTINGS.maxArticleAgeHours + 1)),
        item('lemonde', 'tpl', 'Vidéo. $content.TitleNoTags', hoursAgo(1)),
        item('lemonde', 'bad', 'Pol�cia prende suspeito em opera��o', hoursAgo(1)),
      ],
    });

    const { summary } = await ingest([lemonde]);

    expect(summary.countries).toEqual([{ code: 'FR', articles: 1, clusters: 1, written: true }]);
    const fr = await readJson<CountryFile>('countries', 'FR.json');
    expect(fr.clusters.map((c) => c.representative.title)).toEqual([
      'Le Sénat adopte la réforme des retraites en première lecture',
    ]);
  });

  it('routes regional outlets to their region file and drops republished copies', async () => {
    const ouest = source('ouestfrance', 'FR', { region: 'FR-BRE' });
    const telegramme = source('letelegramme', 'FR', { region: 'FR-BRE' });
    const title = 'Rennes : le nouveau métro attire déjà des milliers de voyageurs';
    await seedCache({
      [ouest.feedUrls[0]!]: [item('ouestfrance', 'metro', title, hoursAgo(3))],
      // A partner rerunning the same headline later is not a second outlet covering it.
      [telegramme.feedUrls[0]!]: [item('letelegramme', 'metro', title.toUpperCase(), hoursAgo(1))],
    });

    const { summary } = await ingest([ouest, telegramme]);

    expect(summary.countries).toEqual([]);
    expect(summary.regions).toEqual([{ code: 'FR-BRE', articles: 1, clusters: 1, written: true }]);
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

    expect(summary.countries).toEqual([{ code: 'FR', articles: 0, clusters: 0, written: false }]);
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

    expect(summary.countries).toEqual([{ code: 'FR', articles: 0, clusters: 0, written: false }]);
    expect(log).toContain('FR: no articles — nothing to write');
    expect(await exists('countries', 'FR.json')).toBe(false);
    expect((await readJson<IndexFile>('index.json')).countries).toEqual([]);
  });

  it('ignores sources whose country or region is unknown', async () => {
    const nowhere = source('nowhere', 'ZZ');
    const lost = source('lost', 'FR', { region: 'FR-ZZZ' });
    await seedCache({
      [nowhere.feedUrls[0]!]: [item('nowhere', 'a', 'A story from a country the globe does not know', hoursAgo(1))],
      [lost.feedUrls[0]!]: [item('lost', 'a', 'A story from a region the globe does not know', hoursAgo(1))],
    });

    const { summary } = await ingest([nowhere, lost]);

    expect(summary).toEqual({ countries: [], regions: [] });
    const index = await readJson<IndexFile>('index.json');
    expect(index.countries).toEqual([]);
    expect(index.regions).toEqual([]);
  });

  it('dates undated items by their retrieval and never into the future', async () => {
    const lemonde = source('lemonde', 'FR');
    const retrievedAt = hoursAgo(2);
    await seedCache(
      {
        [lemonde.feedUrls[0]!]: [
          item('lemonde', 'undated', 'Le Conseil constitutionnel valide la loi sur l’immigration', null),
          item('lemonde', 'future', 'Les agriculteurs manifestent à nouveau devant les préfectures', new Date(NOW + 3_600_000).toISOString()),
        ],
      },
      retrievedAt,
    );

    await ingest([lemonde]);

    const fr = await readJson<CountryFile>('countries', 'FR.json');
    const published = Object.fromEntries(fr.clusters.map((c) => [c.representative.url.split('/').pop(), c.representative.publishedAt]));
    expect(published).toEqual({ undated: retrievedAt, future: new Date(NOW).toISOString() });
  });
});
