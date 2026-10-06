import { describe, expect, it } from 'vitest';
import { clusterArticles, titleSimilarity } from '../src/cluster';
import { INGEST_SETTINGS } from '../src/sources.config';
import { article } from './helpers';

const opts = {
  threshold: INGEST_SETTINGS.clusterThreshold,
  minSharedTokens: INGEST_SETTINGS.clusterMinSharedTokens,
  minAverageLink: INGEST_SETTINGS.clusterMinAverageLink,
};
const T = '2026-10-06T08:00:00.000Z';

function sameCluster(a: string, b: string): boolean {
  return clusterArticles([article('lemonde', a, T), article('lefigaro', b, T)], opts).length === 1;
}

// Pairs below are real headlines seen in the FR/US feeds, lightly trimmed.
describe('clustering: same story, different outlets', () => {
  it.each([
    [
      'Primaire à gauche : plus de 140 000 personnes se sont inscrites pour désigner leur candidat',
      'Plus de 140 000 personnes inscrites pour voter à la primaire socialiste pour la présidentielle 2027',
    ],
    [
      'Deux footballeurs de l’AS Nancy Lorraine mis en examen pour « viol en réunion »',
      'Deux joueurs du club de foot de l’AS Nancy-Lorraine accusés de «viol en réunion»',
    ],
    ['Macron reçoit les chefs de parti à l’Élysée', 'Emmanuel Macron reçoit les chefs de partis à l’Elysee mardi'],
    [
      'Dennis Hastert, longtime Republican House speaker who went to prison, dies at age 84',
      'Dennis Hastert, disgraced former House speaker, dies at 84',
    ],
    [
      'U.S. military removes bombers from U.K. base targeted in suspected terror plot',
      'U.S. military removes bombers from U.K. air base following security incident',
    ],
  ])('%s ≈ %s', (a, b) => {
    expect(sameCluster(a, b)).toBe(true);
  });
});

describe('clustering: shared topic word, different story', () => {
  it.each([
    ['Grève à la SNCF : le trafic très perturbé mardi', 'Grève des enseignants : forte mobilisation attendue jeudi'],
    [
      'Primaire à gauche : plus de 140 000 personnes inscrites',
      'Primaire à gauche : les candidats se déchirent sur la stratégie face à Mélenchon',
    ],
    [
      'Supreme Court rejects appeal over school sweatshirt ban',
      'Supreme Court hears climate change case against oil companies',
    ],
    ['Trump signs executive order on tariffs', 'Trump rally in Pennsylvania draws protesters'],
  ])('%s ≠ %s', (a, b) => {
    expect(sameCluster(a, b)).toBe(false);
  });

  it('needs at least two shared tokens even for very short titles', () => {
    expect(titleSimilarity('Budget', 'Budget : le Sénat vote').shared).toBe(1);
    expect(sameCluster('Budget', 'Budget voté')).toBe(false);
  });
});

describe('clustering: German headlines', () => {
  const de = (src: string, title: string) => article(src, title, T, { language: 'de', countryCode: 'DE' });

  it('groups the same story across outlets and keeps a different one apart', () => {
    // Real headlines from 2026-10-06.
    const groups = clusterArticles(
      [
        de('zeit', 'Spionageverdacht: Ehemaliger BND-Chef August Hanning festgenommen'),
        de('welt', 'Ex-BND-Chef August Hanning wegen Spionageverdachts festgenommen'),
        de('tagesschau', 'BND-Chef warnt vor "gewaltsamem Konflikt mit Russland"'),
        de('spiegel', 'Wehrdienst: Zahl der Kriegsdienstverweigerer schnellt weiter nach oben'),
        de('faz', 'Wehrdienst: Zahl der Kriegsdienstverweigerer steigt weiter stark an'),
      ],
      opts,
    );
    expect(groups.map((g) => g.map((a) => a.source.id))).toEqual([['zeit', 'welt'], ['tagesschau'], ['spiegel', 'faz']]);
  });
});

describe('clusterArticles', () => {
  it('does not link two articles from the same outlet directly', () => {
    const groups = clusterArticles(
      [
        article('lemonde', 'Incendie meurtrier dans un immeuble du Haut-Rhin', T),
        article('lemonde', 'Haut-Rhin : incendie meurtrier dans un immeuble', T),
      ],
      opts,
    );
    expect(groups).toHaveLength(2);
  });

  it('merges transitively across outlets (union-find)', () => {
    const a = article('lemonde', 'Incendie meurtrier dans un immeuble du Haut-Rhin', T);
    const b = article('lefigaro', 'Haut-Rhin : un incendie meurtrier ravage un immeuble', T);
    const c = article('lemonde', 'Haut-Rhin : incendie meurtrier dans un immeuble ancien, deux morts', T);
    const groups = clusterArticles([a, b, c], opts);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([a, b, c]);
  });
});

// Real US headlines from 2026-10-06: two Supreme Court stories. NPR's climate
// piece mentions the "new term" (Jaccard 0.30 with WaPo's term preview), which
// was enough for single-linkage to chain both stories into one cluster.
describe('clusterArticles: chaining guard (average linkage)', () => {
  const bridge = article('npr', "Supreme Court's new term kicks off with blockbuster climate change case", T);
  const climate = [
    article('nyt', 'Supreme Court Tangles Over a Major Climate Change Case', T),
    article('wapo', 'Supreme Court grapples with case on holding Big Oil liable for climate change', T),
    article('pbs', 'Supreme Court hears case on holding energy companies liable for climate change', T),
  ];
  const newTerm = [
    article('nyt', 'Will Midterm Elections Complicate the Supreme Court’s New Term?', T),
    article('wapo', '6 things to watch in the Supreme Court’s new term', T),
    article('npr', 'The Supreme Court faces another term jam-packed with controversy', T),
  ];
  const all = [...climate, bridge, ...newTerm];
  const titles = (groups: ReturnType<typeof clusterArticles>) =>
    groups.map((g) => g.map((a) => a.title).sort()).sort((a, b) => b.length - a.length);

  it('without the guard, the bridging headline chains both stories together', () => {
    const groups = clusterArticles(all, { ...opts, minAverageLink: 0 });
    expect(groups).toHaveLength(1);
  });

  it('with the guard, the two stories stay separate', () => {
    const groups = clusterArticles(all, opts);
    expect(groups).toHaveLength(2);
    const [big, small] = titles(groups);
    expect(big).toEqual([...climate, bridge].map((a) => a.title).sort());
    expect(small).toEqual(newTerm.map((a) => a.title).sort());
  });

  it('result does not depend on input order', () => {
    expect(titles(clusterArticles([...all].reverse(), opts))).toEqual(titles(clusterArticles(all, opts)));
  });

  it('still keeps a genuinely shared story whole across many outlets', () => {
    const hastert = [
      article('nyt', 'Dennis Hastert, Powerful Politician Disgraced by Child Sexual Abuse, Dies', T),
      article('wapo', 'Dennis Hastert, ex-House speaker whose sex abuse admission upended legacy, dies at 84', T),
      article('npr', 'Dennis Hastert, longtime Republican House speaker who went to prison, dies at age 84', T),
      article('cbs', 'Dennis Hastert, disgraced former House speaker, dies at 84', T),
      article('abc', 'Dennis Hastert, longtime Republican House speaker who went to prison, dies at age 84', T),
    ];
    expect(clusterArticles(hastert, opts)).toHaveLength(1);
  });

  it('a lone bridging article joins only the group it is most similar to', () => {
    const groups = clusterArticles(all, opts);
    const withBridge = groups.find((g) => g.includes(bridge))!;
    expect(withBridge).toEqual(expect.arrayContaining(climate));
    expect(withBridge.some((a) => newTerm.includes(a))).toBe(false);
  });
});
