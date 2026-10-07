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
];

/**
 * A feed item that is a programme, service page or ad rather than a story:
 * broadcasters' regional feeds (BFM, ici) list their shows next to articles.
 */
export function isNotNews(title: string): boolean {
  return NOT_NEWS.some((re) => re.test(title.trim()));
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
