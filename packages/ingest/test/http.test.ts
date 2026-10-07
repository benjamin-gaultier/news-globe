import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawItem } from '../src/adapters/types';
import { dropRepublished, isMisdecoded, isNotNews, isUnrenderedTemplate } from '../src/normalize/article';
import { article } from './helpers';
import { decodeBody, HttpCache, newest } from '../src/http';

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

describe('newest', () => {
  const at = (title: string, publishedAt: string | null): RawItem => ({ ...item(title), publishedAt });
  it('keeps the most recent items when a feed lists its whole archive', () => {
    const items = [at('old', '2026-10-01T00:00:00Z'), at('new', '2026-10-07T00:00:00Z'), at('undated', null), at('mid', '2026-10-05T00:00:00Z')];
    expect(newest(items, 2).map((i) => i.title)).toEqual(['undated', 'new']);
    expect(newest(items, 4)).toBe(items);
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
      'Nachrichten aus dem Studio Lüneburg',
      'Nachrichten aus den Studios Braunschweig und Göttingen',
      'Regionalnachrichten aus Greifswald',
      'NDR 1 Radio MV Nachrichten',
      'Nordmagazin | 06.10.2026',
      'Niedersachsen 18.00 | 06.10.2026',
      'Schleswig-Holstein Magazin | 06.10.2026',
      'Schleswig-Holstein 18:00 | 06.10.2026',
      'Die Nachrichten aus Thüringen',
      'Dein Audio-Update am 7.10.2026',
      'buten un binnen kompakt vom 6. Oktober 2026',
      'Der Nachrichtenüberblick',
      'Meldungen',
      'Region Mitte',
      'NL-Tagesticker: News, Infos & Videos von heute',
      'Weimar am Mittwoch – die Nachrichten des Tages',
      'Nachrichten aus dem Wartburgkreis',
      'Nachrichten für den Landkreis Gotha',
      'Abend-Nachrichten: Der Kreis Sömmerda am Dienstag',
      'News zu Eintracht Frankfurt',
      'Live-Verkehrsticker: Die aktuelle Lage auf den Straßen und im ÖPNV',
      'BW-Newsticker am Morgen: Flughafen Stuttgart wegen Bombendrohung geräumt',
      'Hessen am Morgen: Die Nachrichten im Ticker vom 07.10.2026',
      'Schleswig-Holstein News: Aktuelle Nachrichten aus SH im Überblick',
      'Beatrice Egli in Rostock: OZ verlost Tickets für Konzert in der Stadthalle',
      'Eurojackpot heute am Dienstag: Das sind die Gewinnzahlen vom 6. Oktober',
      'Vereint stark: Spielen Sie um Geld für Ihr Vereinsprojekt',
      '3. Liga live: Würzburg – Rostock | 10.10., 14 Uhr | Stream & TV',
      'Podcast "Feel Hamburg" mit Bernd Begemann',
      '„Gude, Mainz!“ – Der Morgen-Podcast für die Region',
      'Großes Gewinnspiel zum Stadtfest',
      'Anzeige: Die besten Angebote im Herbst',
      'Portada Digital, Miércoles 07.10.2026',
      'Portada HCH Miércoles 07 de octubre 2026 Edición Matutina',
      '7 October 2026',
      '美国之音中文广播 (2026年10月7日) 沙特石油出口回升',
      'VOA今日焦点 (2026年10月7日) 特朗普总统宣布66亿大型潜艇厂案',
      '《VOA今日焦点》音频',
      'Michigan Weather: Cold air to settle in, Gale Warnings issued for Great Lakes',
      'Q2 Billings Area Forecast: The spigot flips from hot to cold for the weekend',
      'Storm Track 3 Forecast: Cold front brings comfortable, sunny stretch this week',
      'Wednesday’s weather: Sunny and pleasant, high of 68',
      'Weather Eye: Pleasant temperatures to remain for most of week ahead',
      'Your Mississippi forecast for Wednesday, October 7',
      'Maui Surf Forecast for October 07, 2026',
      'Weather Forecast for Tuesday, October 6, 2026',
      'LIVE RADAR: Passing downpours likely again Wednesday',
      'NHPR morning newscast for Wednesday, Oct. 7, 2026',
      'WHYY Newscast for Tuesday 5:00 p.m.',
      'Newscast – Monday, Oct. 5, 2026',
      'Tuesday Morning Headlines: Baltimore has begun tapping Susquehanna for drinking water',
      'Morning Update: What you need to know in Maine today',
      'Tuesday open line',
      'OPINION: Probation is not a slap on the wrist',
      'Opinion | Fuel Prices May Rise Higher Still',
      'Op-Ed: Energy resilience means keeping our options open',
      'Letter to the editor: Use more solar energy',
      'MY TURN: More than a lifetime of discovering Southeast Alaska',
      'Editorial endorsement November 2026: Send Serena Cruz back to Multnomah County for District 2',
      'Petition launched for a North Valleys’ Fire Safety Plan (opinion)',
      'Obituary: Stephen Duffy',
      'Death Notices for Oct. 3, 2026',
      'Weekly Death Notices (9/26/26–10/3/26)',
      'Sweetwater County Arrest Report for October 6, 2026',
      'Mega Millions numbers for Tuesday, Oct. 6, 2026; jackpot $345 million',
      '16 things to do around D.C. this weekend',
      'Your Monday, Oct. 5 Guide: Four things to do in the Oil City',
      'Gnats on pastries, and other Lancaster County restaurant inspections for Sept. 14-20',
      'Photo Gallery: 34th annual See Spot Walk',
      'Talk of Delmarva Picture of the Day',
      'Talk of Delmarva Fishing Report 10/07/26',
      'Editorial cartoons for Wednesday, October 7',
      'Cartoon',
      'West Eugene Community Newsletter for Tuesday, Oct. 6',
      'Here’s the answer to today’s Question of the Day!',
      'Nashvillager Podcast: Utopian Tennessee',
      'Ravens beat Titans, but at what cost? | Banner Ravens Podcast',
      'Sponsored: Two Weekends. A Whole Lotta Boo.',
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
      'Schließung von Wolters und St. Elisabeth – Hielten Politiker Nachrichten zurück?',
      'Wetter in Hessen: Ein letzter Spätsommertag, dann Temperatursturz',
      'Kuriose Meldungen der Polizei 2026 in Thüringen',
      'Die Nachrichten aus Thüringen wurden gekürzt',
      'Ticketpreise steigen | Bahn erhöht ab 01.12.2026 die Preise | Pendler verärgert',
      'Rhein-Main-Liveblog: Ausgaben für Asylbewerber in Hessen gesunken',
      'FCM-Podcast feiert zehnjähriges Jubiläum',
      'Jubel in Hermeskeil: Shida Bazyar gewinnt Deutschen Buchpreis',
      'Kleingärtner gewinnen Geld von MDR SACHSEN für Sanierung von Vereinsheim',
      'Tourismus: Werbung für Offenheit und Gastfreundschaft geplant',
      'Live aus dem Landtag: Abgeordnete beraten heute über Drohnenabwehr',
      'Nordhausen: Nachrichten aus der Stadt und dem Südharz bleiben',
      'Hamas attack anniversary: Israel marks 7 October 2026',
      '美议员促纽黑文大学终止与西安邮电大学合作，称该校与中国军方有关',
      'Weather service deals with radar issues along Gulf Coast',
      'Tropical Storm Isaias forms, forecast to become a hurricane and hit the US Gulf Coast this week',
      'Poll: Maryland voters back open primaries, question congressional map proposal',
      'Letters show governor knew of contract for months',
      'An unsentimental obituary for the CCSU polytechnic vanity project',
      'SFUSD is set to overhaul its enrollment lottery. Nobody can agree on how',
      'Upper Arlington school podcasters named finalists in NPR’s Student Podcast Challenge',
      'Detroit Evening Report: Comerica Park receives a new name',
      'Morning commute snarled after crash on I-95',
    ]) {
      expect(isNotNews(t), t).toBe(false);
    }
  });
});

describe('dropRepublished', () => {
  it("keeps the earliest copy of a headline another outlet reruns, and the outlet's own repeats", () => {
    const original = article('ctmirror', 'CT effort to support SNAP recipients stalls', '2026-10-07T08:00:00Z');
    const rerun = article('ctpublic', 'CT effort to support SNAP recipients stalls.', '2026-10-07T10:00:00Z');
    const other = article('wshu', 'CT lawmakers weigh SNAP backup plan', '2026-10-07T09:00:00Z');
    const update = article('ctmirror', 'CT Effort to Support SNAP Recipients Stalls', '2026-10-07T11:00:00Z');
    expect(dropRepublished([rerun, update, other, original])).toEqual([update, other, original]);
  });
});
