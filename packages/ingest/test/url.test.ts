import { describe, expect, it } from 'vitest';
import { articleId, canonicalizeUrl, dateFromUrl, isSportCategory, isSportUrl } from '../src/normalize/url';

describe('canonicalizeUrl', () => {
  it('strips tracking params and the fragment', () => {
    expect(
      canonicalizeUrl(
        'https://www.lemonde.fr/politique/article/2026/10/06/x_123.html?utm_source=rss&utm_medium=feed&xtor=RSS-3208#comments',
      ),
    ).toBe('https://www.lemonde.fr/politique/article/2026/10/06/x_123.html');
    expect(canonicalizeUrl('https://example.com/a?fbclid=abc&gclid=def')).toBe('https://example.com/a');
    // ici stations share stories; only at_locale differs between their feeds.
    expect(canonicalizeUrl('https://www.ici.fr/infos/x-123?at_medium=lien_RSS&at_locale=37')).toBe('https://www.ici.fr/infos/x-123');
  });

  it('lower-cases the host but not the path', () => {
    expect(canonicalizeUrl('https://WWW.NYTimes.com/2026/10/06/US/Politics/Story.html')).toBe(
      'https://www.nytimes.com/2026/10/06/US/Politics/Story.html',
    );
  });

  it('keeps meaningful params, sorted, so param order does not matter', () => {
    const a = canonicalizeUrl('https://example.com/story?id=42&page=2&utm_campaign=x');
    const b = canonicalizeUrl('https://example.com/story?page=2&id=42');
    expect(a).toBe('https://example.com/story?id=42&page=2');
    expect(a).toBe(b);
  });

  it('leaves non-URLs alone', () => {
    expect(canonicalizeUrl(' not a url ')).toBe('not a url');
  });
});

describe('articleId', () => {
  it('is short and stable for the same canonical URL', () => {
    const id = articleId('https://example.com/a');
    expect(id).toHaveLength(12);
    expect(articleId(canonicalizeUrl('https://EXAMPLE.com/a?utm_source=x#top'))).toBe(id);
    expect(articleId('https://example.com/b')).not.toBe(id);
  });
});

describe('dateFromUrl', () => {
  it('reads /YYYY/MM/DD/ and /YYYYMMDD/ paths', () => {
    expect(dateFromUrl('https://tg24.sky.it/politica/2026/10/06/migranti-salvini-richard-gere')).toBe('2026-10-06T12:00:00.000Z');
    expect(dateFromUrl('https://www.elespanol.com/espana/politica/20261006/ultima-hora/1003744409738_10.html')).toBe(
      '2026-10-06T12:00:00.000Z',
    );
  });

  it('ignores paths without a valid date', () => {
    expect(dateFromUrl('https://www.bbc.co.uk/news/articles/c4g0x2025')).toBeNull();
    expect(dateFromUrl('https://example.com/2026/02/31/x')).toBeNull();
    expect(dateFromUrl('https://example.com/id/1003744409738')).toBeNull();
    expect(dateFromUrl('not a url')).toBeNull();
  });
});

describe('isSportUrl', () => {
  it('flags articles in a sports section, in the languages of the feeds', () => {
    for (const url of [
      'https://www.svt.se/sport/fotboll/small-for-sirius-foll-mot-aik',
      'https://www.prensa.com/deportes/messi-anade-el-premio-princesa-de-asturias',
      'https://report.az/futbol-xeberleri/fifa-u-15-dunya-cempionati',
      'https://www.tanea.gr/2026/10/24/sports/football/aston-vila-mantsester-siti-2-1',
      'https://www.nst.com.my/sports/badminton/2026/10/1562689/pearly-thinaah',
      'https://www.rtl.nl/nieuws/sport/artikel/5660818/fifa-baas-infantino',
      'https://www.elnuevodia.com/deportes/beisbol/notas/puerto-rico-recibe',
    ]) {
      expect(isSportUrl(url), url).toBe(true);
    }
  });

  it('leaves other sections alone, whatever the headline’s slug says', () => {
    for (const url of [
      'https://www.lemonde.fr/politique/article/2026/10/06/x_123.html',
      'https://conosaba.blogspot.com/2026/10/liga-guineense-de-luta-contra-cancro.html',
      'https://aps.sn/premier-league-nicolas-jackson-signe-un-double',
      'https://example.com/sports',
      'https://example.com/sportswashing-row/story',
      // Times of India keeps the slug in a directory.
      'https://timesofindia.indiatimes.com/india/sports-minister-resigns-over-scandal/articleshow/123.cms',
      'https://timesofindia.indiatimes.com/city/delhi/football-stadium-stampede-kills-12/articleshow/123.cms',
      'not a url',
    ]) {
      expect(isSportUrl(url), url).toBe(false);
    }
  });
});

describe('isSportCategory', () => {
  it('flags items a feed files under a sports section', () => {
    expect(isSportCategory(['Sports', 'Aston Villa'])).toBe(true);
    expect(isSportCategory(['Sport News'])).toBe(true);
    expect(isSportCategory(['Deportes'])).toBe(true);
  });

  it('leaves other categories, and items without any, alone', () => {
    expect(isSportCategory(['News', 'Politics'])).toBe(false);
    expect(isSportCategory(['Sportswashing'])).toBe(false);
    // Tags that name a sports body are news.
    expect(isSportCategory(['Politics', 'Sports Ministry'])).toBe(false);
    expect(isSportCategory(['Football Federation', 'Cricket Board'])).toBe(false);
    // So do tags that name a sport: WordPress lists them like sections.
    expect(isSportCategory(['Politics', 'Football'])).toBe(false);
    expect(isSportCategory(['Cricket'])).toBe(false);
    expect(isSportCategory([])).toBe(false);
    expect(isSportCategory(undefined)).toBe(false);
  });
});
