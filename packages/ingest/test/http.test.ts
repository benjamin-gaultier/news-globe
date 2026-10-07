import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawItem } from '../src/adapters/types';
import { isMisdecoded, isNotNews, isUnrenderedTemplate } from '../src/normalize/article';
import { decodeBody, HttpCache } from '../src/http';

const URL_A = 'https://feeds.example/a.xml';
const MIN = 60_000;
const item = (title: string): RawItem => ({ title, url: `https://x.example/${title}`, description: null, publishedAt: null, imageUrl: null });

let dir: string;
let now: number;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'news-globe-http-'));
  now = Date.parse('2026-10-06T10:00:00Z');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function makeCache(fetchImpl: typeof fetch) {
  return HttpCache.load(join(dir, 'http.json'), {
    userAgent: 'TestBot/1.0',
    minIntervalMs: 15 * MIN,
    timeoutMs: 1000,
    fetchImpl,
    now: () => now,
  });
}

describe('HttpCache', () => {
  it('sends the User-Agent, stores validators, and parses on 200', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<rss/>', { status: 200, headers: { ETag: '"v1"', 'Last-Modified': 'Tue, 06 Oct 2026 09:00:00 GMT' } }));
    const cache = await makeCache(fetchImpl);
    const res = await cache.getItems(URL_A, async () => [item('one')]);
    expect(res.outcome).toBe('fetched');
    expect(res.items).toEqual([item('one')]);
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('TestBot/1.0');
    expect(headers['If-None-Match']).toBeUndefined();

    await cache.save();
    const saved = JSON.parse(await readFile(join(dir, 'http.json'), 'utf8'));
    expect(saved.entries[URL_A].etag).toBe('"v1"');
  });

  it('does not hit the network again within 15 minutes, even from a fresh process', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<rss/>', { status: 200 }));
    const first = await makeCache(fetchImpl);
    await first.getItems(URL_A, async () => [item('one')]);
    await first.save();

    now += 14 * MIN;
    const second = await makeCache(fetchImpl);
    const res = await second.getItems(URL_A, async () => [item('two')]);
    expect(res.outcome).toBe('throttled');
    expect(res.items).toEqual([item('one')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends conditional headers after the interval and reuses cached items on 304', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<rss/>', { status: 200, headers: { ETag: '"v1"', 'Last-Modified': 'Tue, 06 Oct 2026 09:00:00 GMT' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const cache = await makeCache(fetchImpl);
    await cache.getItems(URL_A, async () => [item('one')]);

    now += 16 * MIN;
    const parse = vi.fn(async () => [item('never')]);
    const res = await cache.getItems(URL_A, parse);
    expect(res.outcome).toBe('not-modified');
    expect(res.items).toEqual([item('one')]);
    expect(parse).not.toHaveBeenCalled();
    const headers = fetchImpl.mock.calls[1]![1]!.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('"v1"');
    expect(headers['If-Modified-Since']).toBe('Tue, 06 Oct 2026 09:00:00 GMT');
  });

  it('keeps serving the last good items when a fetch fails, and throttles the retry', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<rss/>', { status: 200 }))
      .mockResolvedValueOnce(new Response('nope', { status: 503 }));
    const cache = await makeCache(fetchImpl);
    await cache.getItems(URL_A, async () => [item('one')]);

    now += 16 * MIN;
    const failed = await cache.getItems(URL_A, async () => []);
    expect(failed.outcome).toBe('error');
    expect(failed.error).toBe('HTTP 503');
    expect(failed.items).toEqual([item('one')]);

    now += 1 * MIN;
    expect((await cache.getItems(URL_A, async () => [])).outcome).toBe('throttled');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves cached items offline without any request, even when the throttle has expired', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<rss/>', { status: 200 }));
    const first = await makeCache(fetchImpl);
    await first.getItems(URL_A, async () => [item('one')]);
    await first.save();

    now += 60 * MIN;
    const offline = await HttpCache.load(join(dir, 'http.json'), {
      userAgent: 'TestBot/1.0',
      minIntervalMs: 15 * MIN,
      timeoutMs: 1000,
      fetchImpl,
      now: () => now,
      offline: true,
    });
    expect(await offline.getItems(URL_A, async () => [])).toMatchObject({ outcome: 'offline', items: [item('one')] });
    expect(await offline.getItems('https://feeds.example/never-fetched.xml', async () => [])).toMatchObject({
      outcome: 'offline',
      items: [],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('decodeBody', () => {
  const latin1 = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));

  it('uses the charset from Content-Type', () => {
    expect(decodeBody(latin1('<t>Flávio</t>'), 'text/xml; charset=ISO-8859-1')).toBe('<t>Flávio</t>');
  });

  it('falls back to the XML declaration', () => {
    const body = '<?xml version="1.0" encoding="ISO-8859-1"?><t>São</t>';
    expect(decodeBody(latin1(body), 'text/xml')).toBe(body);
  });

  it('defaults to UTF-8 and ignores unknown labels', () => {
    const utf8 = new TextEncoder().encode('<t>Élysée</t>');
    expect(decodeBody(utf8, null)).toBe('<t>Élysée</t>');
    expect(decodeBody(utf8, 'text/xml; charset=x-bogus')).toBe('<t>Élysée</t>');
  });
});

describe('isMisdecoded', () => {
  it('flags titles holding U+FFFD replacement characters', () => {
    expect(isMisdecoded('Pol�cia prende suspeito')).toBe(true);
    expect(isMisdecoded('Polícia prende suspeito')).toBe(false);
  });
});

describe('isUnrenderedTemplate', () => {
  it('flags CMS placeholders but not ordinary prices', () => {
    expect(isUnrenderedTemplate('Vidéo. $content.TitleNoTags')).toBe(true);
    expect(isUnrenderedTemplate('Hello {{ title }}')).toBe(true);
    expect(isUnrenderedTemplate('Tesla stock hits $300. Analysts react')).toBe(false);
    expect(isUnrenderedTemplate('Govt. launches $40B Guyana Development Bank')).toBe(false);
  });
});

describe('isNotNews', () => {
  it('flags programmes, service pages and paid content', () => {
    for (const t of [
      'Le journal de 8h du mercredi 7 octobre 2026',
      'Le journal de 18h du lundi 5 octobre 2026',
      "L'actu du 6 octobre 2026",
      'L’actu du 1er octobre 2026',
      'Émission du 6 octobre 2026',
      'Le journal de la Vendée du 7 octobre 2026 – Edition de la mi-journée',
      'Le journal de la Vendée du 7 octobre',
      'Gagnez vos places pour le concert ICI Live de Zazie à Paris le 21 octobre',
      'Le Café Normand: un concours national de cuisine est organisé ce lundi dans les Ehpad',
      'Le Café Conso: les complémentaires santé, les bons plans pour être mieux remboursés',
      'BFM Nord et Vous: quelles sont les solutions pour lutter contre la flambée des prix du carburant ?',
      'Prix des carburants : trouvez la station-service la moins chère près de chez vous',
      'Contenu sponsorisé : les meilleures offres de rentrée',
      '[Partenariat] Découvrez la nouvelle saison',
    ]) {
      expect(isNotNews(t), t).toBe(true);
    }
  });

  it('keeps real stories that share words with shows', () => {
    for (const t of [
      'Le journal de bord du skipper Thomas Coville publié ce lundi',
      "L'actu des lycéens : 1.500 manifestants au Mans",
      'Meurthe-et-Moselle. Flambée du prix des carburants : une confiserie de Liverdun passe à la semaine de quatre jours',
      'DIRECT - Colère des lycéens : en France, des appels à la poursuite de la mobilisation',
      'Météo : les Alpes-Maritimes placées en vigilance jaune orages et pluie-inondation ce mercredi',
      'Blaye : la Ville lance des Petits-déjeuners partenaires pour renforcer la solidarité locale',
      'Le café de la gare ferme ses portes après 80 ans',
      'Le journal de bord du skipper est en ligne depuis le 7 octobre',
      'Mobilisation lycéenne : une nouvelle manifestation à Caen le jeudi 8 octobre 2026',
    ]) {
      expect(isNotNews(t), t).toBe(false);
    }
  });
});
