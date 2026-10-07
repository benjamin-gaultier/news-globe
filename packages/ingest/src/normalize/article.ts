import type { Article } from '@news-globe/shared';
import type { RawItem } from '../adapters/types';
import type { SourceConfig } from '../sources.config';
import { decodeEntities } from './text';
import { articleId, canonicalizeUrl, dateFromUrl } from './url';

/**
 * Turn a raw feed item into an Article. Items without a date take the date in
 * their URL if there is one (e.g. Sky TG24), else the time the feed was
 * retrieved; dates in the future are clamped to `now`. Titles and descriptions are
 * decoded again for feeds that escape them twice (Thanh Niên's "&aacute;"), which also fixes
 * items cached before the decoder knew those entities.
 */
export function toArticle(item: RawItem, source: SourceConfig, retrievedAt: string, now: number): Article {
  const canonicalUrl = canonicalizeUrl(item.url);
  const published = Math.min(Date.parse(item.publishedAt ?? dateFromUrl(item.url) ?? retrievedAt), now);
  return {
    id: articleId(canonicalUrl),
    url: item.url,
    canonicalUrl,
    title: decodeEntities(item.title),
    description: item.description && decodeEntities(item.description),
    source: { id: source.id, name: source.name },
    sourceCountry: source.country,
    language: source.language,
    publishedAt: new Date(published).toISOString(),
    imageUrl: item.imageUrl,
    countryCode: source.country,
    regionCode: source.region ?? null,
  };
}

/**
 * A title with U+FFFD replacement characters was decoded with the wrong charset
 * (e.g. cached before feeds were decoded by their declared charset); skip it
 * rather than show mojibake.
 */
export function isMisdecoded(title: string): boolean {
  return title.includes('�');
}

/**
 * A title that is an unrendered CMS template, e.g. the EBRA papers' (L'Alsace,
 * L'Est Républicain) "Vidéo. $content.TitleNoTags": identical across outlets,
 * so it would otherwise cluster into a top story.
 */
export function isUnrenderedTemplate(title: string): boolean {
  return /\$[A-Za-z_]+\.[A-Za-z_]+|\{\{[^}]*\}\}/.test(title);
}

const MONTHS_FR = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
const DAYS_FR = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
const NOT_NEWS: RegExp[] = [
  // A programme episode named only by its date: BFM's "Le journal de 8h du
  // mercredi 7 octobre 2026", "L'actu du 6 octobre 2026", "Émission du 6 octobre 2026",
  // TV Vendée's "Le journal de la Vendée du 7 octobre 2026 – Edition de la mi-journée".
  new RegExp(
    String.raw`^(?:le |la |l['’])?(?:journal|actu|émission|emission|flash|bulletin|édition|edition)(?: [^:]{0,40}?)?` +
      String.raw` d[ue] (?:(?:${DAYS_FR}) )?\d{1,2}(?:er)? (?:${MONTHS_FR})(?: \d{4})?(?:\s*[–—|-].*)?$`,
    'i',
  ),
  // Ticket giveaways: "Gagnez vos places pour le concert ICI Live de Zazie…".
  /^gagnez (?:vos|des|deux|\d+) (?:places|invitations|billets|entrées)/i,
  // Named magazine segments on BFM regional channels: "Le Café Normand: …", "BFM Nord et Vous: …".
  /^(?:le café [^:]{1,25}|bfm [^:]{1,25} et vous)\s*:/i,
  // Front pages and e-paper editions: Proceso's "Portada Digital, Miércoles 07.10.2026",
  // HCH's "Portada HCH Miércoles 07 de octubre 2026", The Global New Light of Myanmar's "7 October 2026",
  // Shabait's daily papers "Haddas Ertra 07 October 2026", "Eritrea Alhaditha 06 October 2026".
  /^portada\b/i,
  // Shabait's daily papers: "Haddas Ertra 07 October 2026", "Eritrea Alhaditha 06 October 2026".
  /^(?:eritrea )?(?:haddas(?: ertra)?|alhaditha|eritrea profile)\b.*\b\d{4}$/i,
  /^\d{1,2} (?:january|february|march|april|may|june|july|august|september|october|november|december) \d{4}$/i,
  // VOA Chinese's daily broadcasts: "美国之音中文广播 (2026年10月7日) …", "VOA今日焦点 (…)", "《VOA今日焦点》音频".
  /^《?(?:美国之音中文广播|VOA今日焦点)/,
  // ici's evergreen fuel-price finder, re-dated daily.
  /trouvez la station(?:-service)? la moins ch[eè]re/i,
  // Paid content.
  /^\s*[[(]?(?:contenu sponsoris[ée]|sponsoris[ée]|publi-?(?:rédactionnel|reportage|communiqué)|partenariat|en partenariat avec|publicité)(?![a-zà-ÿ])/i,
  // German broadcasters' feeds list bulletins and programmes next to stories:
  // NDR's "Nachrichten aus dem Studio Lüneburg", "Regionalnachrichten aus Rostock",
  // "NDR 1 Radio MV Nachrichten", episodes dated after a pipe ("Nordmagazin | 06.10.2026",
  // "Niedersachsen 18.00 | 06.10.2026"), buten un binnen's "Dein Audio-Update am 7.10.2026"
  // and "buten un binnen kompakt vom 6. Oktober 2026", tagesschau's "Der Nachrichtenüberblick",
  // MDR's "Die Nachrichten aus Thüringen".
  /^(?:nachrichten aus (?:dem|den) studios? |regionalnachrichten aus |ndr 1 [^:]{0,30}nachrichten$|dein audio-update\b|der nachrichtenüberblick$|die nachrichten aus [a-zäöüß-]+$)/i,
  /^[^|]{2,40}\s\|\s\d{1,2}\.\d{1,2}\.\d{4}$/,
  /^buten un binnen kompakt\b/i,
  // Section pages MDR re-dates as items: "Meldungen", "Wetter", "Region Mitte".
  /^(?:meldungen|wetter|bahn fahren|region (?:mitte|nord|ost|süd|west))$/i,
  // Daily roundups and evergreen tickers rather than stories: "NL-Tagesticker: News, Infos…",
  // "Weimar am Mittwoch – die Nachrichten des Tages", "Nachrichten aus dem Wartburgkreis",
  // "Abend-Nachrichten: Der Kreis Sömmerda am Dienstag", "News zu Eintracht Frankfurt",
  // "Live-Verkehrsticker: Die aktuelle Lage…", "BW-Newsticker am Morgen: …",
  // "Hessen am Morgen: Die Nachrichten im Ticker vom 07.10.2026".
  /^(?:nl-tagesticker\b|nachrichten (?:aus|für) (?:dem|den|der) |abend-nachrichten:|news zu |live-verkehrsticker\b|[a-z-]{2,25}-newsticker am (?:morgen|abend)\b)/i,
  /(?:die nachrichten des tages$|am (?:morgen|abend): die nachrichten im ticker\b|aktuelle nachrichten aus [^ ]+ im überblick$)/i,
  // Giveaways, lottery numbers, stream listings, podcast episodes and ads:
  // "OZ verlost Tickets", "Eurojackpot … Gewinnzahlen", "Spielen Sie um Geld…",
  // "3. Liga live: … | Stream & TV", "Podcast \"Feel Hamburg\" …", "Anzeige: …".
  /(?:\bverlost (?:tickets|karten|freikarten)\b|\bgewinnspiel\b|\bgewinnzahlen\b|spielen sie um geld|\|\s*stream & tv$|^podcast\s*["„]|morgen-podcast\b)/i,
  /^\s*[[(]?(?:anzeige|werbung|sponsored)(?![a-zà-ÿ])/i,
  // US local outlets' feeds carry recurring segments next to stories.
  // Forecasts: "Michigan Weather: …", "Q2 Billings Area Forecast: …", "Wednesday's weather: …",
  // "Weather Eye: …", "Your Mississippi forecast for Wednesday, October 7", "Maui Surf Forecast for …", "LIVE RADAR: …".
  /^[\w.'’ -]{0,30}?\b(?:weather|forecast|weather forecast|weather eye)\s*:/i,
  /^(?:your )?[\w.'’ -]{0,30}?\bforecast for (?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tonight|january|february|march|april|may|june|july|august|september|october|november|december)\b)/i,
  /^live radar\b/i,
  // Newscasts and daily briefings: "NHPR morning newscast for …", "WHYY Newscast for Tuesday 5:00 p.m.",
  // "Newscast – Monday, Oct. 5, 2026", "Tuesday Morning Headlines: …", "Morning Headlines with … 10/7/26",
  // "Morning Update: What you need to know in Maine today", "Tuesday open line".
  /^(?:[\w ]{0,25} )?newscast\b/i,
  /^(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) )?morning (?:headlines|update|digest)\b/i,
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) open line$/i,
  // Opinion and letters: "OPINION: …", "Opinion | …", "Op-Ed: …", "Letter to the editor: …", "LETTER: …",
  // "MY TURN: …", "Counterpoint: …", "Public Editor: …", "Editorial endorsement November 2026: …", "… (opinion)".
  /^(?:opinion|op-ed|letters?(?: to the editor)?|my turn|counterpoint|public editor|editorial(?: endorsement)?[^:|]{0,20})\s*[:|]/i,
  /\(opinion\)$/i,
  // Obituaries and notices: "Obituary: …", "Obituaries: Cundy; Frausto; …", "Death Notices for Oct. 3, 2026",
  // "Weekly Death Notices (…)", "Vital Statistics for …", "Sweetwater County Arrest Report for …".
  /^(?:obituary|obituaries)\s*:/i,
  /^(?:weekly )?(?:death notices|vital statistics)\b/i,
  /\barrest report for\b/i,
  // Lottery draws: "Mega Millions numbers for …", "Powerball numbers: …".
  /^(?:mega millions|powerball)(?: numbers)?\b/i,
  // Listings and fixed features: "16 things to do around D.C. this weekend", "Your Monday, Oct. 5 Guide: …",
  // "… and other Lehigh County restaurant inspections for …", "Photo Gallery: …", "Talk of Delmarva Picture of the Day",
  // "Talk of Delmarva Fishing Report 10/07/26", "Editorial cartoons for …", "Word Search: …",
  // "West Eugene Community Newsletter for …", "Weekend Entertainment Roundup for …".
  /\bthings to do (?:in|around|this)\b/i,
  /\brestaurant inspections(?: for\b|:)/i,
  /^(?:photo gallery|word search)\s*:/i,
  /\b(?:picture of the day|fishing report \d{1,2}\/\d{1,2}\/\d{2,4})$/i,
  /^(?:editorial cartoons for|cartoon$|daily poll$)/i,
  /\b(?:community newsletter|entertainment roundup) for\b/i,
  /question of the day!?$/i,
  // Podcast episodes: "PODCAST: …", "Nashvillager Podcast: …", "… | Banner Ravens Podcast".
  /^[\w’' ]{0,30}?\bpodcast\s*:/i,
  /\|\s*[^|]{0,40}\bpodcast$/i,
  // Spanish, Catalan and Italian regional feeds. Broadcast episodes named by their date: RAI TGR's
  // "GR Lazio del 07/10/2026 ore 12:10", "Meteo Calabria del 06/10/2026 ore 19:30",
  // "Buongiorno Regione Umbria del 07/10/2026", "Tgr in 60 secondi del 6 ottobre";
  // IB3's "RESUM IB3 NOTÍCIES MIGDIA 07/10/2026"; À Punt's "07.10.2026 | Informatiu migdia | L'oratge";
  // NewSicilia's "… | TG Flash 13:30".
  /^[^:|]{2,60} del \d{1,2}\/\d{1,2}\/\d{4}(?: ore \d{1,2}[:.]\d{2})?$/i,
  /^tgr in 60 secondi\b/i,
  /^resum ib3\b/i,
  /^\d{1,2}\.\d{1,2}\.\d{4}\s*\|/,
  /\|\s*tg flash\b[^|]*$/i,
  // Press reviews and digests: "Rassegna stampa 07-10-2026 edizioni Calabria",
  // "Estas son las noticias más leídas este lunes en El Progreso",
  // "Las noticias más importantes en Salamanca hoy lunes 5 de octubre", "Las noticias imprescindibles",
  // "Así te hemos contado la actualidad de Valladolid durante la mañana del martes, 6 de octubre".
  /^rassegna stampa\b/i,
  /\bnoticias más (?:leídas|importantes)\b/i,
  /^las noticias imprescindibles$/i,
  /^así te hemos contado la actualidad\b/i,
  // Daily forecasts (weather news such as storm warnings stays): "El tiempo en Asturias para este martes, 6 de octubre: …",
  // "Meteo in Veneto, le previsioni per martedì 6 ottobre: …", "Previsioni meteo giovedì 8 ottobre, a Milano …".
  /^el tiempo en [^:]{2,30} para (?:este|el|hoy)\b/i,
  /^(?:meteo in [^,]{2,30}, le previsioni per|previsioni meteo (?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|oggi|domani))(?=[\s,:]|$)/i,
  // Horoscopes, agendas, TV listings and opinion: "Horóscopo", "l'oroscopo di oggi",
  // "Què fer a Barcelona? Agenda d’activitats…", "Concerts de Barcelona el 2026: Agenda completa…",
  // "Cosa fare a Milano oggi 7 ottobre: …", "Cosa fare oggi in Umbria", "Qué hacer hoy en Vigo",
  // "…: card completa, data, orario e dove vederlo in diretta tv e streaming", "Opinión | …".
  /^(?:horóscopo|oroscopo)\b/i,
  /\boroscopo di oggi\b/i,
  /^(?:què fer a [^?]{2,30}\?|qué hacer hoy\b|cosa fare (?:a [^ ]+ )?oggi\b)/i,
  /\bagenda (?:completa d['’]|d['’]activitats\b)/i,
  /\bdove veder(?:lo|la|li|le) in (?:diretta )?tv\b/i,
  /^(?:opinión|opinió|opinione)\s*[|:]/i,
  // Canadian and Australian regional feeds: programme episodes and live-blog wraps, "Le téléjournal Acadie du 6 octobre",
  // "Épisode du 3 octobre 2026", "WATCH: Global News Hour at 6 BC: Oct. 6", "NTV Morning Weather Checkpoint",
  // "As it happened: WA news on Wednesday, October 7", "At Close of Business podcast October 7 2026",
  // "World in pictures, October 7, 2026"; service items and fixed columns, "Transports en direct | Tout va bien",
  // "News of the day: …", "Call of the Wilde: …", "ATLANTIC SKIES: …", "COMING SOON: …".
  /^(?:le )?téléjournal\b/i,
  /^épisode du \d/i,
  /^watch: global [\w ]{0,30}news (?:hour )?at \d/i,
  /\bweather checkpoint$/i,
  /^as it happened: [\w ]{2,30} news on\b/i,
  /\bpodcast (?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2},? \d{4}$/i,
  /^world in pictures\b/i,
  // Property listings and digital-edition entries (Canberra Daily): "5 Berra Close, Ngunnawal",
  // "1/71 Paterson Street, Ainslie", "8 October 2026".
  /^\d+[a-z]?(?:\/\d+[a-z]?)?\s(?:[A-Z][\w'’-]*\s){1,3}(?:Street|St|Road|Rd|Close|Crescent|Cres|Avenue|Ave|Place|Pl|Way|Drive|Dr|Court|Ct|Circuit|Cct|Terrace|Tce|Lane|Parade|Grove|Boulevard|Loop),\s[A-Z][\w '’-]+$/,
  /^\d{1,2} (?:january|february|march|april|may|june|july|august|september|october|november|december) \d{4}$/i,
  /^transports en direct\s*\|/i,
  /^(?:news of the day|call of the wilde|atlantic skies|coming soon)\s*:/i,
  // Brazilian regional feeds. g1's generated pages: "Resultado das eleições 2026 em Acari (RN): como foi a votação…",
  // "MAPA: veja o resultado das eleições 2026 em Manaus…", "Previsão do tempo hoje para Olinda (PE): …".
  /^resultado das eleições \d{4} (?:em|no|na)\b/i,
  /^mapa: veja o resultado\b/i,
  /^previsão do tempo hoje para\b/i,
  // Programme episodes and daily editions: "Assista ao JRO1 desta quarta-feira, 7", "AO VIVO: Assista ao GR1",
  // "VÍDEOS: Bom Dia PE de …", "ClickFM - AO VIVO", "Jornal Em Tempo – quarta-feira, 7 de outubro de 2026",
  // "Confira os principais destaques do Jornal O Dia desta quarta-feira (07)", "Confira os destaques do futebol sergipano…".
  /^(?:ao vivo: )?assista (?:ao|aos|à|às)\s/i,
  /^vídeos:/i,
  /\s[-–]\s*ao vivo$/i,
  /^jornal [^–-]{2,30}\s[–-]\s*(?:segunda|terça|quarta|quinta|sexta|sábado|domingo)/i,
  /^confira os (?:principais )?destaques\b/i,
  // Lottery results, job listings, TV listings, legal notices and columns: "Mega-Sena 3067: …",
  // "Resultado da Mega-Sena 3067: …", "Confira as vagas de emprego disponíveis em Sergipe…",
  // "Emprego: confira as 198 vagas…", "Remo x Grêmio: onde assistir ao vivo…",
  // "Edital de Notificação de Pedido de Usucapião…", "LICENÇA DE OPERAÇÃO", "Coluna Social – Ponto E", "Corrida do Poder".
  /^(?:resultados? (?:da |do )?)?(?:mega-sena|loteria federal|lotofácil)\b/i,
  /\bvagas de emprego\b/i,
  /^emprego: confira\b/i,
  /\bonde assistir\b/i,
  /^(?:edital de|licença de operação)\b/i,
  /^(?:coluna social\b|corrida do poder$)/i,
  // Dated bulletins, newspaper editions and obituary lists: "07/10/2026 - Assista agora ao …",
  // "Cartórios - 07/10/2026", "JD1 NO AR - Quarta 7/10/2026", "Jornal Guarulhos Hoje – Ed. 4496 – 7/10/2026",
  // "Falecimentos desta quarta-feira".
  /^\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*assista\b/i,
  /^[^-–]{2,40}\s[-–]\s(?:(?:segunda|terça|quarta|quinta|sexta|sábado|domingo)\S*\s)?\d{1,2}\/\d{1,2}\/\d{4}$/i,
  /\s[-–]\s*ed\.\s*\d+\s*[-–]/i,
  /^(?:lista de )?falecimentos\b/i,
  // Mexican court notices, forecasts, exchange rates, print editions and named columns: "EDICTO 187/2026",
  // "Edicto primer aviso …", "Clima en Zapopan hoy: el pronóstico para …", "Clima en Monterrey con Gaby Lozoya: …",
  // "Pronostican cielo despejado para este jueves", "Tipo de cambio en Tijuana", "Diario digital | 7 de octubre de 2026",
  // "Edición impresa 07 de octubre de 2026", "Contraportada del 7 de octubre de 2026", "Bajo Reserva 07 de octubre de 2026",
  // "OFF THE RECORD 07-10-2026", "Corren Rumores / …", "Columna Descomplicado/Jorge Robledo", "Obituario 05 octubre de 2026".
  /^edicto\b/i,
  /^clima en [^:]{2,40} (?:hoy|con [^:]{2,30}):(?!.*(?:tormenta|huracán|ciclón|frente frío))/i,
  /^pronostican\b.{0,60}\bpara este (?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)$/i,
  /^tipo de cambio en\b/i,
  /^(?:diario digital\s*\||edición impresa\b|bajo reserva\b|off the record \d|obituario\b)/i,
  /^(?:portada|contraportada)\b[^:|]{0,40}\d{1,2}(?:\/\d{1,2}\/\d{2,4}| de \w+ de \d{4})$/i,
  /^(?:columna\b|(?:clase política|corren rumores|el muro|crónica del poder)\s*\/)/i,
  /\bcasino online\b/i,
  // Indian job posts, event series, government listings and live-update headers: "Meghalaya Jobs 2026 : …",
  // "MP Police Driver Recruitment 2026: 1,000 Posts", "… | Urban Adda 2026", "Chhattisgarh Government Events on October 7: …",
  // "Raipur Job Fair 2026: 11,700 Vacancies, …", "News Live Updates: …", "West Bengal LIVE News Update: …".
  /^[\w ]{2,30} jobs 20\d\d\s*:/i,
  /\brecruitment 20\d\d\s*:/i,
  /\burban adda \d{4}$/i,
  /^[\w ]{2,30} government events on \w+ \d{1,2}\s*:/i,
  /\bjob fair 20\d\d\s*:/i,
  /^(?:[\w ]{2,25} )?(?:live news update|news live updates?)\s*:/i,
  // Argentine portals: death notices, lottery draws, games and bank-discount service pieces.
  // "HUGO RUBEN MURABITO (Q.E.P.D)", "Quiniela de Mendoza: estos son los resultados del sorteo…",
  // "Resultado de la Quiniela de La Neuquina de HOY 7 de octubre de 2026", "Quiniela nocturna",
  // "Tómbola Santiagueña: los números de este martes…", "Reto del día: …", "Feriado",
  // "Cuenta DNI del Banco Provincia: los descuentos de hoy miércoles 7 de octubre del 2026".
  /\(q\.?e\.?p\.?d\.?\)$/i,
  /^(?:resultados? de la )?quiniela\b(?:[^:]{0,40}:\s*(?:estos son )?(?:los )?(?:resultados|números)|[^:]{0,40}\bde hoy\b|\s(?:nocturna|matutina|vespertina|de la (?:tarde|mañana|noche|primera))$)/i,
  /^(?:loterías y quinielas|turf\W+programas y resultados|feriado)$/i,
  /^tómbola [^:]{2,20}: los números\b/i,
  /^reto del día\s*:/i,
  /^cuenta dni\b[^:]{0,40}:\s*(?:los|todos los) descuentos\b/i,
];

/**
 * A feed item that is a programme, service page or ad rather than a story:
 * broadcasters' regional feeds (BFM, ici) list their shows next to articles.
 */
export function isNotNews(title: string): boolean {
  return NOT_NEWS.some((re) => re.test(title.trim()));
}

/**
 * Drop republished copies: the same headline from another outlet, as when a
 * public radio station reruns a partner nonprofit's story (CT Mirror on CT
 * Public, Spotlight PA on WESA). The earliest copy, usually the original, is
 * kept. Without this a single story counts as covered by several outlets.
 * An outlet's own repeats go too (ANSA posting a story twice under two URLs,
 * a press release published four times): stories from one outlet never
 * cluster, so each copy would take its own place in the top stories.
 * Titles are compared ignoring case, punctuation and spacing.
 */
export function dropRepublished(articles: Article[]): Article[] {
  const key = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const first = new Map<string, Article>();
  for (const a of articles) {
    const k = key(a.title);
    const seen = first.get(k);
    if (!seen || Date.parse(a.publishedAt) < Date.parse(seen.publishedAt)) first.set(k, a);
  }
  return articles.filter((a) => first.get(key(a.title)) === a);
}

/** Exact dedupe on canonical URL; the first occurrence wins. */
export function dedupeByCanonicalUrl(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.canonicalUrl)) return false;
    seen.add(a.canonicalUrl);
    return true;
  });
}
