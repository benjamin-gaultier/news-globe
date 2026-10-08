import { describe, expect, it } from 'vitest';
import { indexEntry } from '../src/pipeline';
import { buildCluster } from '../src/rank';
import { article } from './helpers';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const build = (...arts: Parameters<typeof buildCluster>[0]) => buildCluster(arts, (id) => (id === 'lemonde' ? 1 : 0), NOW, 24);

describe('indexEntry', () => {
  it('carries the top story’s headline and 24 h outlet count', () => {
    const top = build(
      article('lemonde', 'Budget adopté', hoursAgo(1)),
      article('lefigaro', 'Le budget est adopté', hoursAgo(2)),
      article('liberation', 'Budget : adopté', hoursAgo(30)),
    );
    const second = build(article('lemonde', 'Autre chose', hoursAgo(1)));
    expect(indexEntry('FR', 'France', 'T', [top, second])).toEqual({
      code: 'FR',
      name: 'France',
      updatedAt: 'T',
      clusterCount: 2,
      topTitle: 'Budget adopté',
      topOutlets: 2,
    });
  });

  it('leaves the top-story fields out when there are no clusters', () => {
    expect(indexEntry('FR', 'France', 'T', [])).toEqual({ code: 'FR', name: 'France', updatedAt: 'T', clusterCount: 0 });
  });
});
