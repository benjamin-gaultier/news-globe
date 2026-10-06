import { describe, expect, it } from 'vitest';
import { clusterArticles, titleSimilarity } from '../src/cluster';
import { INGEST_SETTINGS } from '../src/sources.config';
import { article } from './helpers';

const opts = { threshold: INGEST_SETTINGS.clusterThreshold, minSharedTokens: INGEST_SETTINGS.clusterMinSharedTokens };
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
