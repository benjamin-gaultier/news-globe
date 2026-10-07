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
  // HCH's "Portada HCH Miércoles 07 de octubre 2026", The Global New Light of Myanmar's "7 October 2026".
  /^portada\b/i,
  /^\d{1,2} (?:january|february|march|april|may|june|july|august|september|october|november|december) \d{4}$/i,
  // VOA Chinese's daily broadcasts: "美国之音中文广播 (2026年10月7日) …", "VOA今日焦点 (…)", "《VOA今日焦点》音频".
  /^《?(?:美国之音中文广播|VOA今日焦点)/,
  // ici's evergreen fuel-price finder, re-dated daily.
  /trouvez la station(?:-service)? la moins ch[eè]re/i,
  // Paid content.
  /^\s*[[(]?(?:contenu sponsoris[ée]|sponsoris[ée]|publi-?(?:rédactionnel|reportage|communiqué)|partenariat|en partenariat avec|publicité)(?![a-zà-ÿ])/i,
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
