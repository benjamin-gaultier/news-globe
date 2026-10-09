import type { Article } from '@news-globe/shared';
import { titleTokens } from './normalize/text';

export interface ClusterOptions {
  /** A pair of headlines can link when token-set Jaccard similarity is at or above this. */
  threshold: number;
  /** ...and the titles share at least this many tokens. */
  minSharedTokens: number;
  /**
   * Two groups only merge when the average similarity over every pair of
   * their members is at or above this (average linkage). Stops one bridging
   * headline from chaining two different stories together. Set to 0 for
   * plain single-linkage.
   */
  minAverageLink: number;
  /**
   * Names whose words don't count toward `minSharedTokens`: a region's own
   * name, which most of its headlines mention ("Sachsen-Anhalt" would
   * otherwise be two shared tokens linking any two of its stories). They still
   * count in the similarity score, so "Tour de Corse" stories still merge.
   */
  ignoreNames?: readonly string[];
}

export function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { score: shared / (a.size + b.size - shared), shared };
}

export function titleSimilarity(a: string, b: string, language?: string): { score: number; shared: number } {
  return jaccard(titleTokens(a, language), titleTokens(b, language));
}

class UnionFind {
  private readonly parent: number[];
  /** Members of each root's group, kept in index order. */
  readonly members: number[][];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.members = Array.from({ length: n }, (_, i) => [i]);
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== root) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }

  union(ra: number, rb: number): void {
    const [keep, drop] = ra < rb ? [ra, rb] : [rb, ra];
    this.parent[drop] = keep;
    this.members[keep] = [...this.members[keep]!, ...this.members[drop]!].sort((x, y) => x - y);
    this.members[drop] = [];
  }
}

/**
 * Group articles (all from one country) that report the same story.
 *
 * Candidate links are cross-outlet pairs whose title Jaccard passes
 * `threshold` and `minSharedTokens`. Two articles from the same outlet are
 * never linked directly: an outlet repeating itself isn't cross-outlet
 * evidence. Links are applied strongest first with union-find. When a link
 * would join two existing groups, the average similarity over all pairs of
 * their members must also reach `minAverageLink`. Without that check a single
 * headline like "Supreme Court term opens with climate case" would chain the
 * "new term" story and the "climate case" story into one.
 *
 * Returns groups in order of their first article.
 */
export function clusterArticles(articles: Article[], opts: ClusterOptions): Article[][] {
  const n = articles.length;
  const tokens = articles.map((a) => titleTokens(a.title, a.language));
  const nameTokensByLanguage = new Map<string, Set<string>>();
  const nameTokens = (language: string) => {
    let set = nameTokensByLanguage.get(language);
    if (!set) {
      set = titleTokens((opts.ignoreNames ?? []).join(' '), language);
      nameTokensByLanguage.set(language, set);
    }
    return set;
  };
  const sim: Float64Array = new Float64Array(n * n);
  const edges: { i: number; j: number; score: number }[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const { score, shared } = jaccard(tokens[i]!, tokens[j]!);
      sim[i * n + j] = sim[j * n + i] = score;
      const crossOutlet = articles[i]!.source.id !== articles[j]!.source.id;
      if (!crossOutlet || score < opts.threshold || shared < opts.minSharedTokens) continue;
      let evidence = shared;
      if (opts.ignoreNames?.length) {
        for (const t of nameTokens(articles[i]!.language)) if (tokens[i]!.has(t) && tokens[j]!.has(t)) evidence--;
      }
      if (evidence >= opts.minSharedTokens) edges.push({ i, j, score });
    }
  }
  // Strongest evidence first; index order breaks ties so output is deterministic.
  edges.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);

  const uf = new UnionFind(n);
  for (const { i, j } of edges) {
    const ra = uf.find(i);
    const rb = uf.find(j);
    if (ra === rb) continue;
    const a = uf.members[ra]!;
    const b = uf.members[rb]!;
    if (a.length > 1 || b.length > 1) {
      let total = 0;
      for (const x of a) for (const y of b) total += sim[x * n + y]!;
      if (total / (a.length * b.length) < opts.minAverageLink) continue;
    }
    uf.union(ra, rb);
  }

  const groups: Article[][] = [];
  for (let i = 0; i < n; i++) {
    if (uf.find(i) === i) groups.push(uf.members[i]!.map((k) => articles[k]!));
  }
  return groups;
}
