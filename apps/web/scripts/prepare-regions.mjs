// Downloads a country's region outlines and writes a trimmed copy to
// src/assets/regions-{cc}.json, keyed by ISO 3166-2 code. Run once per country;
// the output is committed and loaded only when that country is selected.
// Sources split finer than regions (Spain's and Italy's provinces) are merged
// into one outline per region along their shared borders.
//   node scripts/prepare-regions.mjs fr
//   node scripts/prepare-regions.mjs de
import { writeFile, mkdir } from 'node:fs/promises';
import { topology } from 'topojson-server';
import { merge } from 'topojson-client';

const SOURCES = {
  // France's 13 metropolitan regions: IGN Admin Express via
  // gregoiredavid/france-geojson, Licence Ouverte / Etalab.
  fr: {
    url: 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/v2.1.1/regions-version-simplifiee.geojson',
    /** INSEE region code → ISO 3166-2 (Corsica is FR-20R in ISO, not FR-COR). */
    code: (p) =>
      ({
        11: 'FR-IDF', 24: 'FR-CVL', 27: 'FR-BFC', 28: 'FR-NOR', 32: 'FR-HDF', 44: 'FR-GES', 52: 'FR-PDL',
        53: 'FR-BRE', 75: 'FR-NAQ', 76: 'FR-OCC', 84: 'FR-ARA', 93: 'FR-PAC', 94: 'FR-20R',
      })[p.code],
    expected: 13,
  },
  // Germany's 16 Länder: Natural Earth 1:10m admin-1 (public domain).
  de: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
    code: (p) => (p.iso_a2 === 'DE' ? p.iso_3166_2 : undefined),
    expected: 16,
  },
  // The 50 US states and DC: Natural Earth 1:50m admin-1 (public domain), which
  // has the US at a lighter resolution than 10m.
  us: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson',
    code: (p) => (p.iso_a2 === 'US' ? p.iso_3166_2 : undefined),
    expected: 51,
  },
  // Spain's 17 autonomous communities (Ceuta and Melilla, ES.CE, are left out), merged from
  // Natural Earth 1:10m provinces. Its region codes are Natural Earth's own;
  // a few differ from ISO 3166-2 (ES.PM is ES-IB, ES.LO is ES-RI…).
  es: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
    code: (p) =>
      p.iso_a2 === 'ES'
        ? {
            'ES.AN': 'ES-AN', 'ES.AR': 'ES-AR', 'ES.AS': 'ES-AS', 'ES.CN': 'ES-CN', 'ES.CB': 'ES-CB', 'ES.CM': 'ES-CM',
            'ES.CL': 'ES-CL', 'ES.CT': 'ES-CT', 'ES.EX': 'ES-EX', 'ES.GA': 'ES-GA', 'ES.PM': 'ES-IB', 'ES.LO': 'ES-RI',
            'ES.MD': 'ES-MD', 'ES.MU': 'ES-MC', 'ES.NA': 'ES-NC', 'ES.PV': 'ES-PV', 'ES.VC': 'ES-VC',
          }[p.region_cod]
        : undefined,
    expected: 17,
  },
  // Italy's 20 regions, merged from Natural Earth 1:10m provinces; there
  // `region_cod` is already the ISO 3166-2 region code (IT-21 Piemonte…).
  it: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson',
    code: (p) => (p.iso_a2 === 'IT' ? p.region_cod : undefined),
    expected: 20,
  },
  // Canada's 10 provinces and 3 territories: Natural Earth 1:50m admin-1 (public domain).
  ca: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson',
    code: (p) => (p.iso_a2 === 'CA' ? p.iso_3166_2 : undefined),
    expected: 13,
  },
  // Australia's 6 states and 2 mainland territories (Jervis Bay Territory, AU-X02~, is left
  // out): Natural Earth 1:50m admin-1 (public domain).
  au: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson',
    code: (p) => (p.iso_a2 === 'AU' && /^AU-[A-Z]+$/.test(p.iso_3166_2) ? p.iso_3166_2 : undefined),
    expected: 8,
  },
  // Brazil's 26 states and the Federal District: Natural Earth 1:50m admin-1 (public domain).
  br: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_1_states_provinces.geojson',
    code: (p) => (p.iso_a2 === 'BR' ? p.iso_3166_2 : undefined),
    expected: 27,
  },
};

const cc = process.argv[2];
const source = SOURCES[cc];
if (!source) {
  console.error(`usage: node scripts/prepare-regions.mjs <${Object.keys(SOURCES).join('|')}>`);
  process.exit(2);
}
const OUT = new URL(`../src/assets/regions-${cc}.json`, import.meta.url);

// Round to 0.01° (~1 km) like the country shapes, dropping points that collapse onto the previous one.
const roundRing = (ring) => {
  const out = [];
  for (const [x, y] of ring) {
    const p = [+x.toFixed(2), +y.toFixed(2)];
    const last = out.at(-1);
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
};
const roundPolygon = (rings) => rings.map(roundRing).filter((r) => r.length >= 4);

const res = await fetch(source.url, { headers: { 'User-Agent': 'NewsGlobeBot/0.1 (build script)' } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const geo = await res.json();

const parts = new Map();
for (const f of geo.features) {
  const code = source.code(f.properties);
  if (code) parts.set(code, [...(parts.get(code) ?? []), f]);
}
// One part is used as is; several (provinces) are merged along shared arcs, so no seams are left inside a region.
const geometryOf = (fs) => {
  if (fs.length === 1) return fs[0].geometry;
  const topo = topology({ parts: { type: 'FeatureCollection', features: fs } });
  return merge(topo, topo.objects.parts.geometries);
};
const features = [...parts].map(([code, fs]) => {
  const { type, coordinates } = geometryOf(fs);
  const polygons = (type === 'Polygon' ? [coordinates] : coordinates).map(roundPolygon).filter((p) => p.length > 0);
  return { type: 'Feature', properties: { region: code }, geometry: { type: 'MultiPolygon', coordinates: polygons } };
});
if (features.length !== source.expected) throw new Error(`expected ${source.expected} regions, got ${features.length}`);

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`wrote ${features.length} regions: ${features.map((f) => f.properties.region).sort().join(' ')}`);
