import { describe, expect, it } from 'vitest';
import { cleanDescription, decodeEntities, foldText, stripHtml, titleTokens, truncate } from '../src/normalize/text';

describe('foldText', () => {
  it('treats French accents as equivalent', () => {
    expect(foldText('Élysée')).toBe('elysee');
    expect(foldText('Élysée')).toBe(foldText('elysee'));
    expect(foldText('ÇA BOUGE à Noël, où ?')).toBe('ca bouge a noel ou');
  });

  it('turns punctuation and apostrophes into spaces', () => {
    expect(foldText("L’Assemblée : «vote» d'urgence!")).toBe('l assemblee vote d urgence');
  });
});

describe('titleTokens', () => {
  it('drops FR and EN stopwords and folds accents', () => {
    expect([...titleTokens("Le Premier ministre à l'Élysée")]).toEqual(['premier', 'ministr', 'elyse']);
    expect([...titleTokens('The Senate votes on the budget')]).toEqual(['senat', 'vote', 'budget']);
    expect(titleTokens('votes')).toEqual(titleTokens('vote'));
  });

  it('matches accented and unaccented spellings', () => {
    expect(titleTokens('Élysée')).toEqual(titleTokens('elysee'));
  });

  it('matches singular/plural and masculine/feminine forms', () => {
    expect(titleTokens('personnes inscrites')).toEqual(titleTokens('personne inscrit'));
    expect(titleTokens('lycéens blessés')).toEqual(titleTokens('lyceen blesse'));
  });

  it('drops live-blog boilerplate', () => {
    expect(titleTokens('EN DIRECT – Grève SNCF')).toEqual(titleTokens('Grève SNCF'));
  });
});

describe('titleTokens: per-language stopwords', () => {
  it('drops German stopwords and folds umlauts for de', () => {
    expect([...titleTokens('Die Zahl der Verweigerer steigt für den Wehrdienst', 'de')]).toEqual([
      'zahl',
      'verweigerer',
      'steigt',
      'wehrdienst',
    ]);
  });

  it('keeps English words that are German stopwords', () => {
    // "dies" and "war" are stopwords in German, but carry the story in English.
    expect([...titleTokens('Former speaker dies at 84', 'en')]).toContain('dies');
    expect([...titleTokens('War in Sudan enters third year', 'en')]).toContain('war');
    expect([...titleTokens('Former speaker dies at 84')]).toContain('dies');
  });

  it('drops Spanish stopwords and live-blog markers for es', () => {
    expect([...titleTokens('Sánchez adelanta las elecciones al 29 de noviembre', 'es')]).toEqual([
      'sanchez',
      'adelanta',
      'eleccion',
      '29',
      'noviembr',
    ]);
    expect(titleTokens('Última hora: elecciones generales, en directo', 'es')).toEqual(
      titleTokens('elecciones generales', 'es'),
    );
  });

  it('drops Italian stopwords for it', () => {
    expect([...titleTokens('Il governo pone la fiducia sugli articoli della legge elettorale', 'it')]).toEqual([
      'governo',
      'pone',
      'fiducia',
      'articoli',
      'legg',
      'elettoral',
    ]);
  });

  it('drops Portuguese stopwords and "veja/saiba" list markers for pt', () => {
    expect(titleTokens('Veja quem são os deputados estaduais eleitos', 'pt')).toEqual(
      titleTokens('deputados estaduais eleitos', 'pt'),
    );
  });

  it('folds Turkish letters, including dotless ı, and apostrophe suffixes for tr', () => {
    expect(titleTokens("Erdoğan'ın IĞDIR ziyareti", 'tr')).toEqual(titleTokens('Erdogan Iğdır ziyareti', 'tr'));
    expect([...titleTokens("Son dakika: Meclis'te bütçe görüşmeleri başladı", 'tr')]).toEqual([
      'mecli', // the generic plural-s fold applies; harmless as it's consistent
      'butc',
      'gorusmeleri',
      'basladi',
    ]);
  });

  it('ignores Turkish light verbs and police-blotter formula words', () => {
    // Two different raids on 2026-10-06 that used to merge on "suç örgütüne operasyon: N gözaltı".
    expect(titleTokens('Daltonlar suç örgütüne operasyon: 26 gözaltı', 'tr')).toEqual(
      titleTokens('Daltonlar suç örgütüne 26', 'tr'),
    );
    expect(titleTokens('Cumhurbaşkanı Erdoğan AileFest’i ziyaret etti', 'tr').has('etti')).toBe(false);
  });

  it('folds German -en inflections', () => {
    expect(titleTokens('Grünen Parteien Wahlen', 'de')).toEqual(titleTokens('Grüne Partei Wahl', 'de'));
  });
});

describe('HTML and truncation', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<p>Un <b>vote</b>&nbsp;au S&#xE9;nat &amp; l&#8217;Assemblée</p><img src="x.jpg">')).toBe(
      'Un vote au Sénat & l’Assemblée',
    );
    expect(decodeEntities('Trump&apos;s &quot;plan&quot;')).toBe('Trump\'s "plan"');
  });

  it('truncates at a word boundary with an ellipsis', () => {
    const out = truncate('word '.repeat(100).trim(), 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith('word…')).toBe(true);
    expect(truncate('short', 300)).toBe('short');
  });

  it('cleans descriptions to ~300 chars and nulls empty ones', () => {
    expect(cleanDescription('<p>  </p>', 300)).toBeNull();
    expect(cleanDescription(undefined, 300)).toBeNull();
    expect(cleanDescription(`<p>${'a b '.repeat(400)}</p>`, 300)!.length).toBeLessThanOrEqual(300);
  });
});
