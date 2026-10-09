import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, type IndexFile, type TodayFile, type TodayStory } from '@news-globe/shared';
import { buildCluster } from '../src/rank';
import {
  azureConfigFromEnv,
  azureTranslator,
  emptyCache,
  headlinesToTranslate,
  translateHeadlines,
  type Headline,
} from '../src/translate';
import { article } from './helpers';

const RUN = '2026-10-09T10:00:00.000Z';
const fake = () => vi.fn(async (texts: string[]) => texts.map((t) => `EN:${t}`));
const quiet = () => {};
const h = (text: string, language = 'fr'): Headline => ({ text, language });

describe('translateHeadlines', () => {
  it('translates new headlines once and remembers them', async () => {
    const translator = fake();
    const first = await translateHeadlines([h('Le budget'), h('La grève')], null, translator, { runAt: RUN, log: quiet });
    expect(first.file.items).toEqual({ 'Le budget': 'EN:Le budget', 'La grève': 'EN:La grève' });
    expect(first.sent).toBe('Le budget'.length + 'La grève'.length);
    expect(first.cache.usage).toEqual({ month: '2026-10', chars: first.sent });
    expect(first.changed).toBe(true);

    // Next hour: only the new headline is sent; the old one comes from the cache.
    translator.mockClear();
    const next = await translateHeadlines([h('Le budget'), h('Il pleut')], first.cache, translator, {
      runAt: '2026-10-09T11:00:00.000Z',
      log: quiet,
    });
    expect(translator).toHaveBeenCalledWith(['Il pleut']);
    // Only the headlines in use are published.
    expect(next.file.items).toEqual({ 'Le budget': 'EN:Le budget', 'Il pleut': 'EN:Il pleut' });
  });

  it('stays within the month’s budget, most-seen headlines first, and resets it each month', async () => {
    const translator = fake();
    const cache = { ...emptyCache(), usage: { month: '2026-10', chars: 95 } };
    const result = await translateHeadlines([h('aaaa'), h('bbbbbb'), h('c')], cache, translator, {
      runAt: RUN,
      budget: 100,
      log: quiet,
    });
    expect(translator).toHaveBeenCalledWith(['aaaa']); // 6 more would go over; the queue stops there
    expect(result.cache.usage.chars).toBe(99);

    const november = await translateHeadlines([h('bbbbbb')], result.cache, fake(), {
      runAt: '2026-11-01T00:00:00.000Z',
      budget: 100,
      log: quiet,
    });
    expect(november.cache.usage).toEqual({ month: '2026-11', chars: 6 });
  });

  it('keeps going with what it has when the service refuses', async () => {
    const translator = vi.fn(async () => {
      throw new Error('Azure Translator HTTP 403: quota exceeded');
    });
    const cache = { ...emptyCache(), entries: { 'Le budget': { en: 'The budget', used: '2026-10-08' } } };
    const log = vi.fn();
    const result = await translateHeadlines([h('Le budget'), h('La grève')], cache, translator, { runAt: RUN, log });
    expect(result.file.items).toEqual({ 'Le budget': 'The budget' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('quota exceeded'));
  });

  it('forgets translations unused for two weeks', async () => {
    const cache = {
      ...emptyCache(),
      entries: { Ancien: { en: 'Old', used: '2026-09-20' }, Récent: { en: 'Recent', used: '2026-10-01' } },
    };
    const result = await translateHeadlines([], cache, fake(), { runAt: RUN, log: quiet });
    expect(Object.keys(result.cache.entries)).toEqual(['Récent']);
  });

  it('sends large runs in batches', async () => {
    const translator = fake();
    const many = Array.from({ length: 250 }, (_, i) => h(`Titre ${i}`));
    const result = await translateHeadlines(many, null, translator, { runAt: RUN, log: quiet });
    expect(translator).toHaveBeenCalledTimes(3);
    expect(Object.keys(result.file.items)).toHaveLength(250);
  });
});

describe('headlinesToTranslate', () => {
  const story = (unit: string, title: string, language: string): TodayStory => ({
    unit,
    clusterId: title,
    title,
    url: 'https://x',
    source: 'X',
    language,
    imageUrl: null,
    outlets: 1,
    rank: 1,
    firstSeen: RUN,
    state: null,
  });

  it('picks Today, cross-border and each country’s top story, skipping English and duplicates', () => {
    const today: TodayFile = {
      schemaVersion: SCHEMA_VERSION,
      runAt: RUN,
      top: [story('FR', 'Le budget', 'fr'), story('US', 'Senate vote', 'en')],
      rising: [story('DE', 'Sturm', 'de')],
      lasting: [story('FR', 'Le budget', 'fr')],
      countries: 3,
      stories: 3,
    };
    const index: IndexFile = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: RUN,
      countries: [],
      world: [
        {
          id: 'w',
          names: [],
          countries: [{ code: 'JP', clusterId: 'j', title: '選挙', url: 'https://x', outletCount24h: 1, language: 'ja' }],
          latestPublishedAt: RUN,
        },
      ],
    };
    const cluster = (title: string, language: string) =>
      buildCluster([article('o', title, RUN, { language })], () => 0, Date.parse(RUN), 24);
    const units = [
      { code: 'ES', clusters: [cluster('La economía', 'es'), cluster('Segundo', 'es')] },
      { code: 'ES-MD', clusters: [cluster('Madrid', 'es')] }, // regions are not translated
    ];
    expect(headlinesToTranslate(today, index, units).map((x) => x.text)).toEqual(['Le budget', 'Sturm', '選挙', 'La economía']);
  });
});

describe('Azure', () => {
  it('reads its key and region from the environment', () => {
    expect(azureConfigFromEnv({})).toBeNull();
    expect(azureConfigFromEnv({ AZURE_TRANSLATOR_KEY: 'k', AZURE_TRANSLATOR_REGION: 'westeurope' })).toEqual({
      key: 'k',
      region: 'westeurope',
    });
    expect(() => azureConfigFromEnv({ AZURE_TRANSLATOR_KEY: 'k' })).toThrow(/REGION/);
  });

  it('calls Translator v3 and reads the English back in order', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json([{ translations: [{ text: 'The budget', to: 'en' }] }, { translations: [{ text: 'The strike', to: 'en' }] }]),
    );
    const translate = azureTranslator({ key: 'k', region: 'westeurope' }, fetchImpl as unknown as typeof fetch);
    expect(await translate(['Le budget', 'La grève'])).toEqual(['The budget', 'The strike']);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en');
    expect(init!.headers).toMatchObject({ 'Ocp-Apim-Subscription-Key': 'k', 'Ocp-Apim-Subscription-Region': 'westeurope' });
    expect(JSON.parse(init!.body as string)).toEqual([{ Text: 'Le budget' }, { Text: 'La grève' }]);
  });

  it('reports the service’s error', async () => {
    const fetchImpl = (async () =>
      Response.json({ error: { code: 403001, message: 'Out of call volume quota' } }, { status: 403 })) as unknown as typeof fetch;
    await expect(azureTranslator({ key: 'k', region: 'r' }, fetchImpl)(['x'])).rejects.toThrow(/403: Out of call volume quota/);
  });
});
