// Downloads Natural Earth 110m admin-0 countries (public domain) and writes a
// trimmed copy to src/assets/countries-110m.json. Run once; the output is committed.
//   node scripts/prepare-countries.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson';
const OUT = new URL('../src/assets/countries-110m.json', import.meta.url);

const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(2), +c[1].toFixed(2)] : c.map(round));

const res = await fetch(SRC, { headers: { 'User-Agent': 'NewsGlobeBot/0.1 (build script)' } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const geo = await res.json();

const features = geo.features
  .filter((f) => f.properties.ADM0_A3 !== 'ATA') // Antarctica clutters the bottom of the globe
  .map((f) => {
    const p = f.properties;
    // ISO_A2 is "-99" for France and Norway in Natural Earth; ISO_A2_EH fixes that.
    const iso = [p.ISO_A2_EH, p.ISO_A2].find((v) => v && v !== '-99') ?? null;
    return {
      type: 'Feature',
      properties: { iso2: iso, name: p.NAME },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
    };
  });

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`wrote ${features.length} countries`);
