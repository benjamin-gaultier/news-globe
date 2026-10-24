import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawItem } from '../src/adapters/types';
import { dropOwnRepeats, dropRepublished, isMisdecoded, isNotNews, isUnrenderedTemplate } from '../src/normalize/article';
import { article } from './helpers';
import { decodeBody, HttpCache, newest } from '../src/http';

const URL_A = 'https://feeds.example/a.xml';
const MIN = 60_000;
const item = (title: string): RawItem => ({
  title,
  url: `https://x.example/${title}`,
  description: null,
  publishedAt: '2026-10-06T08:00:00.000Z',
  imageUrl: null,
});

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
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('<rss/>', { status: 200, headers: { ETag: '"v1"', 'Last-Modified': 'Tue, 06 Oct 2026 09:00:00 GMT' } }),
    );
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

  it('records why a feed failed when its 200 response does not parse', async () => {
    const cache = await makeCache(vi.fn<typeof fetch>(async () => new Response('<html>Not a feed</html>', { status: 200 })));
    const res = await cache.getItems(URL_A, async () => {
      throw new Error('Unexpected root element: html');
    });
    expect(res.outcome).toBe('error');
    await cache.save();
    const saved = JSON.parse(await readFile(join(dir, 'http.json'), 'utf8'));
    expect(saved.entries[URL_A].lastStatus).toBe('Unexpected root element: html');
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
      .mockResolvedValueOnce(
        new Response('<rss/>', { status: 200, headers: { ETag: '"v1"', 'Last-Modified': 'Tue, 06 Oct 2026 09:00:00 GMT' } }),
      )
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

describe('first-seen times', () => {
  it('date undated and future-dated items by the fetch that first listed them, across refetches', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('<rss/>', { status: 200 }));
    const cache = await makeCache(fetchImpl);
    const undated = { ...item('evergreen'), publishedAt: null };
    const kickoff = { ...item('match'), publishedAt: '2026-10-07T20:00:00.000Z' };
    const first = await cache.getItems(URL_A, async () => [undated, kickoff, item('dated')]);
    const firstAt = new Date(now).toISOString();
    expect(first.items).toEqual([{ ...undated, firstSeenAt: firstAt }, { ...kickoff, firstSeenAt: firstAt }, item('dated')]);

    // A day later the feed still lists the evergreen item, next to a new undated one.
    now += 24 * 60 * MIN;
    const later = await cache.getItems(URL_A, async () => [undated, { ...item('new'), publishedAt: null }]);
    expect(later.items.map((i) => [i.title, i.firstSeenAt])).toEqual([
      ['evergreen', firstAt],
      ['new', new Date(now).toISOString()],
    ]);
  });
});

describe('first-seen times on 304', () => {
  it('stamps undated items cached before first-seen times existed, once', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<rss/>', { status: 200, headers: { ETag: '"v1"' } }))
      .mockResolvedValue(new Response(null, { status: 304 }));
    const cache = await makeCache(fetchImpl);
    const undated = { ...item('evergreen'), publishedAt: null };
    await cache.getItems(URL_A, async () => [undated]);
    // As an older ingest would have cached it: no first-seen time.
    delete (await cache.getItems(URL_A, async () => [])).items[0]!.firstSeenAt;

    now += 16 * MIN;
    const stampedAt = new Date(now).toISOString();
    expect((await cache.getItems(URL_A, async () => [])).items).toEqual([{ ...undated, firstSeenAt: stampedAt }]);

    now += 16 * MIN;
    expect((await cache.getItems(URL_A, async () => [])).items).toEqual([{ ...undated, firstSeenAt: stampedAt }]);
  });
});

describe('newest', () => {
  const at = (title: string, publishedAt: string | null): RawItem => ({ ...item(title), publishedAt });
  it('keeps the most recent items when a feed lists its whole archive', () => {
    const items = [
      at('old', '2026-10-01T00:00:00Z'),
      at('new', '2026-10-07T00:00:00Z'),
      at('undated', null),
      at('mid', '2026-10-05T00:00:00Z'),
    ];
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
      'Live hören: Bayer Leverkusen gegen SC Freiburg - Bundesliga',
      'Live hören: Die Konferenz - 8. Spieltag | Fußball 2. Bundesliga',
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
      'GR Lazio del 07/10/2026 ore 12:10',
      'Meteo Calabria del 06/10/2026 ore 19:30',
      'Buongiorno Regione Valle d’Aosta del 07/10/2026',
      'Tgr in 60 secondi del 6 ottobre',
      'RESUM IB3 NOTÍCIES MIGDIA 07/10/2026',
      '07.10.2026 | Informatiu migdia | L’oratge',
      'Crisi Schifani-Minardo, dimissioni in standby? | TG Flash 13:30',
      'Rassegna stampa 07-10-2026 edizioni Calabria',
      'Estas son las noticias más leídas este lunes en El Progreso',
      'Las noticias más importantes en Salamanca hoy lunes 5 de octubre',
      'Las noticias imprescindibles',
      'Así te hemos contado la actualidad de Valladolid durante la mañana del martes, 6 de octubre',
      'El tiempo en Asturias para este martes, 6 de octubre: lluvias por la tarde',
      'Meteo in Veneto, le previsioni per martedì 6 ottobre: nubi sparse',
      'Previsioni meteo giovedì 8 ottobre, a Milano e in Lombardia tempo instabile',
      'Horóscopo',
      'Giornale di Sicilia: l’oroscopo di oggi',
      'Què fer a Barcelona? Agenda d’activitats actualitzada per a avui, demà i més dies',
      'Concerts de Barcelona el 2026: Agenda completa d’actuacions musicals',
      'Cosa fare a Milano oggi 7 ottobre: El Tri ai Magazzini',
      'Cosa fare oggi in Umbria',
      'WWE Money in the Bank 2026: card completa, data, orario e dove vederlo in diretta tv e streaming',
      'Opinión | Cartagena, ‘Ciudad de Submarinos’, debería pedir ya su S-80',
      'Le téléjournal Acadie du 6 octobre',
      'Épisode du 3 octobre 2026',
      'WATCH: Global News Hour at 6 BC: Oct. 6',
      'NTV Morning Weather Checkpoint',
      'As it happened: WA news on Wednesday, October 7',
      'At Close of Business podcast October 7 2026',
      'World in pictures, October 7, 2026',
      'Transports en direct | Tout va bien',
      'News of the day: Jeff Leiper: How I would get Ottawa back on track as mayor',
      'ATLANTIC SKIES: Is the Milky Way Galaxy a composite of thousands of other galaxies?',
      'COMING SOON: Bracegirdle’s House of Fine Chocolate finds new McLaren Vale home',
      'Resultado das eleições 2026 em Acari (RN): como foi a votação no seu local de votação; consulte por zona eleitoral',
      'MAPA: veja o resultado das eleições 2026 em Manaus por local de votação e seção eleitoral',
      'Previsão do tempo hoje para Olinda (PE): sol com algumas nuvens',
      'Assista ao JRO1 desta quarta-feira, 7',
      'AO VIVO: Assista ao GR1',
      'VÍDEOS: Bom Dia PE de quarta-feira, 7 de outubro de 2026',
      'ClickFM - AO VIVO',
      'Jornal Em Tempo – quarta -feira, 7 de outubro de 2026',
      'Confira os principais destaques do Jornal O Dia desta quarta-feira (07)',
      'Mega-Sena 3067: aposta de Maceió acerta quina e fatura R$ 33 mil',
      'Resultado da Mega-Sena 3067: duas apostas do PI levam R$ 33 mil; veja cidades',
      'Confira as vagas de emprego disponíveis em Sergipe nesta segunda-feira (5)',
      'Emprego: confira as 198 vagas disponíveis em Petrolina, Salgueiro e Araripina',
      'Remo x Grêmio: onde assistir ao vivo, horário e escalações',
      'Edital de Notificação de Pedido de Usucapião Extrajudicial',
      'Coluna Social – Ponto E',
      'Corrida do Poder',
      'Resultado Mega-Sena 3067: veja os números sorteados',
      'Resultado da Loteria Federal 6012 desta quarta-feira',
      '07/10/2026 - Assista agora ao Tribuna Notícias',
      'Cartórios - 07/10/2026',
      'JD1 NO AR - Quarta 7/10/2026',
      'Jornal Guarulhos Hoje – Ed. 4496 – 7/10/2026',
      'Falecimentos desta quarta-feira',
      'EDICTO 455/2024',
      'Edicto sucesorio: Callero Hilda Esther',
      'Clima en Monterrey hoy: Medio nublado y máximas de 26.2°C',
      'Clima en Monterrey con Gaby Lozoya: ¿qué días lloverá?',
      'Pronostican cielo despejado para este jueves',
      'Tipo de cambio en Tijuana',
      'Diario digital | 7 de octubre de 2026',
      'Edición impresa 07 de octubre de 2026',
      'Contraportada del 7 de octubre de 2026',
      'Bajo Reserva Hidalgo 7/10/26',
      'OFF THE RECORD 07-10-2026',
      'Obituario 05 octubre de 2026',
      'Crónica del poder / El desafío',
      'Columna Descomplicado/Jorge Robledo',
      'Nuevas estrategias para utilizar bonos de casino online en 2026',
      'Meghalaya Jobs 2026 : NEIGRIHMS Shillong Recruitment',
      'MP Police Driver Recruitment 2026: 1,000 Posts',
      'Raipur Job Fair 2026: 11,700 Vacancies, 72+ Companies',
      'Chhattisgarh Government Events on October 7: Job Fair, Seva Campaigns and More',
      'Water proximity must guide data centre projects: TERI expert at Urban Adda 2026',
      'West Bengal LIVE News Update: রাস্তায় শুয়ে পড়লেন প্রিয়ঙ্কা গান্ধী',
      'HUGO RUBEN MURABITO (Q.E.P.D)',
      'ROBERTO RAMON CONTE "TINO" (QEPD)',
      'Quiniela de Mendoza: estos son los resultados del sorteo del martes 6 de octubre',
      'Resultado de la Quiniela de La Neuquina de HOY 7 de octubre de 2026',
      'Quiniela nocturna',
      'Loterías y quinielas',
      'Turf – Programas y Resultados',
      'Feriado',
      'Tómbola Santiagueña: los números de este miércoles 7 de octubre de 2026',
      'Reto del día: ¿Pondría usted a prueba su agilidad mental esta mañana?',
      'Cuenta DNI del Banco Provincia: los descuentos de hoy miércoles 7 de octubre del 2026',
      'Lista de falecimentos – 6/10/2026',
      '5 Berra Close, Ngunnawal',
      '1/71 Paterson Street, Ainslie',
      '29 Jim Bradley Crescent, Uriarra Village',
      '8 October 2026',
      'Haddas Ertra 07 October 2026',
      'Eritrea Alhaditha 06 October 2026',
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
      'Live hören statt sehen: Warum die Bundesliga im Radio boomt',
      'Bayern schießt sich gegen Leipzig den Frust von der Seele',
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
      'Meteo Campania, temporali in arrivo: allerta Gialla dal pomeriggio',
      'Meteocat emet un avís per temps violent al Pla d’Urgell',
      'El tiempo cambia en Sevilla a partir de hoy: Aemet anuncia una subida de temperaturas',
      'Así te hemos contado la protesta de los taxis que ha colapsado el tráfico en Donostia',
      'Qué hacer si te encuentras con un jabalí en la carretera',
      'Cine sobre artesanías y cultura popular llega a Cuenca y Paute: agenda completa',
      'Incidencias en Rodalies, última hora en directo: el temporal mantiene cinco vías sin circulación',
      'Proroga a graduatorie per concorso oss 2024, presidio Usb in Regione',
      'Botricello, minacce alla troupe de La Vita in Diretta',
      'Il sindaco annuncia il calendario del 12/10/2026 per le scuole',
      'Plans to install Cottesloe shark barrier pushed back five days due to weather forecast, swell',
      'Severe cyclone likely to hit Qld this season, weather bureau warns',
      'Melbourne comedian dropped from Monster Trucks event after podcast comments',
      'As it happened, the council voted to close the pool',
      'Fábio Mitidieri ressalta resultado das eleições: “A urna gritou”',
      'Incêndio atinge laboratório público no bairro da Jatiúca; assista ao vídeo',
      'Após cobrança, DNIT anuncia prazos de edital para nova ponte em Pedro Afonso',
      'Concurso no Piauí abre 107 vagas com salários de até R$ 7,2 mil',
      'Confira a lista completa dos deputados federais eleitos por Sergipe',
      'Câmara aprova projeto - votação final em 7/10/2026',
      '7 dead after crash on Pacific Highway, police say',
      'Clima en Campeche hoy: Tormenta tropical “Isaías” amenaza con intensificar las lluvias',
      'Quiniela Poceada: un médico de Villa Ángela se llevó un pozo de $159 millones',
      'Confirmaron los motivos del fallecimiento repentino de un adolescente de 14 años en Capital',
      'El Gobierno informó un 20% de adhesión al paro de UNTER y confirmó descuentos',
      'Feriado largo: cuántos turistas viajaron por el país',
      'Ola de calor en Monterrey deja récord de consumo eléctrico',
      'Railway recruitment scam busted in Patna, three held',
      '10 Downing Street, the PM and the budget',
      'Morre aos 90 anos ex-prefeito de Londrina; falecimentos na cidade sobem',
    ]) {
      expect(isNotNews(t), t).toBe(false);
    }
  });
});

describe('dropRepublished', () => {
  it('keeps only the earliest copy of a headline, whichever outlet repeats it', () => {
    const original = article('ctmirror', 'CT effort to support SNAP recipients stalls', '2026-10-07T08:00:00Z');
    const rerun = article('ctpublic', 'CT effort to support SNAP recipients stalls.', '2026-10-07T10:00:00Z');
    const other = article('wshu', 'CT lawmakers weigh SNAP backup plan', '2026-10-07T09:00:00Z');
    const update = article('ctmirror', 'CT Effort to Support SNAP Recipients Stalls', '2026-10-07T11:00:00Z');
    expect(dropRepublished([rerun, update, other, original])).toEqual([other, original]);
  });
});

describe('dropOwnRepeats', () => {
  it("drops an outlet's own repeated headline but keeps other outlets running the same one", () => {
    const first = article('ansa', 'Manovra, via libera del Cdm', '2026-10-07T08:00:00Z');
    const repeat = article('ansa', 'Manovra: via libera del CdM', '2026-10-07T09:00:00Z');
    const wire = article('rainews', 'Manovra, via libera del Cdm', '2026-10-07T08:30:00Z');
    expect(dropOwnRepeats([repeat, wire, first])).toEqual([wire, first]);
  });
});
