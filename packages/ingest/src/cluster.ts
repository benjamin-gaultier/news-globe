import type { Article } from '@news-globe/shared';
import { titleTokens } from './normalize/text';

export interface ClusterOptions {
  /** Merge when token-set Jaccard similarity is at or above this. */
  threshold: number;
  /** ...and the titles share at least this many tokens. */
  minSharedTokens: number;
}

export function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { score: shared / (a.size + b.size - shared), shared };
}

export function titleSimilarity(a: string, b: string): { score: number; shared: number } {
  return jaccard(titleTokens(a), titleTokens(b));
}

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
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
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/**
 * Group articles (all from one country) that report the same story: pairwise
 * title Jaccard, merged transitively with union-find. Two articles from the
 * same outlet are never linked directly — an outlet repeating itself isn't
 * cross-outlet evidence — though they can still end up together via others.
 * Returns groups in order of their first article.
 */
export function clusterArticles(articles: Article[], opts: ClusterOptions): Article[][] {
  const tokens = articles.map((a) => titleTokens(a.title));
  const uf = new UnionFind(articles.length);

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (articles[i]!.source.id === articles[j]!.source.id) continue;
      const { score, shared } = jaccard(tokens[i]!, tokens[j]!);
      if (score >= opts.threshold && shared >= opts.minSharedTokens) uf.union(i, j);
    }
  }

  const groups = new Map<number, Article[]>();
  articles.forEach((a, i) => {
    const root = uf.find(i);
    const group = groups.get(root);
    if (group) group.push(a);
    else groups.set(root, [a]);
  });
  return [...groups.values()];
}
