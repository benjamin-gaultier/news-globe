// Downloads France's 13 metropolitan regions (IGN Admin Express via
// gregoiredavid/france-geojson, Licence Ouverte / Etalab) and writes a trimmed
// copy to src/assets/regions-fr.json, keyed by ISO 3166-2 code. Run once; the
// output is committed and loaded only when France is selected.
//   node scripts/prepare-regions.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const SRC =
  'https://raw.githubusercontent.com/gregoiredavid/france-geojson/v2.1.1/regions-version-simplifiee.geojson';
const OUT = new URL('../src/assets/regions-fr.json', import.meta.url);

/** INSEE region code → ISO 3166-2 (Corsica is FR-20R in ISO, not FR-COR). */
const ISO = {
  11: 'FR-IDF', 24: 'FR-CVL', 27: 'FR-BFC', 28: 'FR-NOR', 32: 'FR-HDF', 44: 'FR-GES', 52: 'FR-PDL',
  53: 'FR-BRE', 75: 'FR-NAQ', 76: 'FR-OCC', 84: 'FR-ARA', 93: 'FR-PAC', 94: 'FR-20R',
};

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

const res = await fetch(SRC, { headers: { 'User-Agent': 'NewsGlobeBot/0.1 (build script)' } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const geo = await res.json();

const features = geo.features.map((f) => {
  const code = ISO[f.properties.code];
  if (!code) throw new Error(`unknown INSEE region ${f.properties.code}`);
  const { type, coordinates } = f.geometry;
  const polygons = (type === 'Polygon' ? [coordinates] : coordinates).map(roundPolygon).filter((p) => p.length > 0);
  return {
    type: 'Feature',
    properties: { region: code },
    geometry: { type: 'MultiPolygon', coordinates: polygons },
  };
});

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`wrote ${features.length} regions`);
