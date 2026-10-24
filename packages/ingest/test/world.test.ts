import { describe, expect, it } from 'vitest';
import type { StoryCluster } from '@news-globe/shared';
import { buildCluster } from '../src/rank';
import { buildWorld, knownNames, namesIn, type CountryClusters } from '../src/world';
import { article } from './helpers';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const AT = '2026-10-08T10:00:00.000Z';

/** A one-article cluster per headline, each from its own outlet. */
let n = 0;
const story = (title: string): StoryCluster => buildCluster([article(`outlet${n++}`, title, AT)], () => 0, NOW, 24);

// Unrelated headlines so that word rarity behaves as on a real run (~2,500 clusters).
const filler = (country: string, count: number): CountryClusters => ({
  code: country,
  clusters: Array.from({ length: count }, (_, i) => story(`Filler headline number ${i} about Topic${country}${i}`)),
});

describe('namesIn', () => {
  it('reads runs of capitalised words, the first word only when known', () => {
    expect(namesIn('Le Kenya signale un premier décès lié à Ebola')).toEqual([['kenya'], ['ebola']]);
    expect(namesIn('Paramount closes its deal', new Set(['paramount']))).toEqual([['paramount']]);
    expect(namesIn('Paramount closes its deal')).toEqual([]);
  });

  it('keeps particles inside a name but never joins across punctuation', () => {
    expect(namesIn('Carburant : la Corée du Sud devient fournisseur')).toEqual([['coree', 'sud']]);
    expect(namesIn('Mali : reprise de Kidal, le FLA annonce un repli')).toEqual([['kidal'], ['fla']]);
  });

  it('skips generic capitalised words', () => {
    expect(namesIn('Georgia expelled foreign nationals, Interior Ministry says')).toEqual([]);
  });

  it('only trusts known words in title-case headlines', () => {
    const known = knownNames(['The studio Paramount completes its deal for Warner Bros.']);
    expect(namesIn('Houthis Strike Two Saudi Airports In New Wave Of Attacks', known)).toEqual([]);
    expect(namesIn('Big Studio Paramount Buys Warner Bros For Billions', known)).toEqual([['paramount'], ['warner', 'bros']]);
  });
});

describe('buildWorld', () => {
  const run = () => [
    filler('XA', 300),
    {
      code: 'CZ',
      clusters: [story('Paramount dokončil převzetí Warner Bros. Discovery'), story('Vláda schválila rozpočet na příští rok')],
    },
    {
      code: 'PR',
      clusters: [story('“Esta ambición es una realidad”: Paramount Skydance cierra compra de Warner Bros. Discovery por $110')],
    },
    {
      code: 'BA',
      clusters: [story('Historijski posao u Hollywoodu: Paramount zvanično preuzeo Warner Bros. za 110 milijardi dolara')],
    },
    { code: 'GN', clusters: [story('Mali : l’armée reprend le contrôle de Kidal, le FLA annonce un repli stratégique')] },
    { code: 'MR', clusters: [story('Le FLA annonce un « retrait stratégique » de la ville de Kidal')] },
    // Only "Saudi Arabia" in common: one name, so no link.
    { code: 'KH', clusters: [story('Cambodia, Saudi Arabia explore industrial and tech partnership')] },
    { code: 'KW', clusters: [story('Saudi Arabia, MWL condemn Houthi attacks on kingdom')] },
  ];

  it('links the same story across countries through shared names', () => {
    const world = buildWorld(run());
    expect(world.map((s) => s.countries.map((c) => c.code).sort())).toEqual([
      ['BA', 'CZ', 'PR'],
      ['GN', 'MR'],
    ]);
    expect(world[0]!.names).toContain('paramount');
    expect(world[1]!.names.sort()).toEqual(['fla', 'kidal']);
  });

  it('marks each linked cluster with the other countries', () => {
    const countries = run();
    const world = buildWorld(countries);
    const cz = countries.find((c) => c.code === 'CZ')!.clusters;
    expect(cz[0]!.alsoIn?.map((a) => a.code).sort()).toEqual(['BA', 'PR']);
    expect(cz[1]!.alsoIn).toBeUndefined();
    const pr = world[0]!.countries.find((c) => c.code === 'PR')!;
    expect(cz[0]!.alsoIn).toContainEqual({ code: 'PR', clusterId: pr.clusterId });
  });

  it('ranks stories in as many countries by coverage before raw outlets', () => {
    const covered = (title: string, outlets: number) => ({ ...story(title), outletCount24h: outlets });
    const pools = new Map([
      ['CZ', 8],
      ['PR', 8],
      ['GN', 3],
      ['MR', 3],
    ]);
    const world = buildWorld(
      [
        filler('XA', 300),
        { code: 'CZ', clusters: [covered('Paramount dokončil převzetí Warner Bros. Discovery', 6)] },
        {
          code: 'PR',
          clusters: [covered('“Esta ambición es una realidad”: Paramount Skydance cierra compra de Warner Bros. Discovery por $110', 6)],
        },
        { code: 'GN', clusters: [covered('Mali : l’armée reprend le contrôle de Kidal, le FLA annonce un repli', 3)] },
        { code: 'MR', clusters: [covered('Le FLA annonce un « retrait stratégique » de la ville de Kidal', 3)] },
      ],
      undefined,
      pools,
    );
    // Kidal: 3 of 3 outlets in each country (0.8 + 0.8); Paramount: 6 of 8 in each (0.667 + 0.667), with twice the outlets.
    expect(world.map((s) => s.countries.map((c) => [c.code, c.coverage]).sort())).toEqual([
      [
        ['GN', 0.8],
        ['MR', 0.8],
      ],
      [
        ['CZ', 0.667],
        ['PR', 0.667],
      ],
    ]);
  });

  it('never links two clusters of one country', () => {
    const world = buildWorld([
      filler('XA', 300),
      {
        code: 'GN',
        clusters: [
          story('Mali : l’armée reprend le contrôle de Kidal, le FLA annonce un repli stratégique'),
          story('Le FLA annonce un « retrait stratégique » de la ville de Kidal'),
        ],
      },
    ]);
    expect(world).toEqual([]);
  });
});
