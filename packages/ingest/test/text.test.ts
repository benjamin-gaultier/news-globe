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
