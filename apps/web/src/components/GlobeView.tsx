import { COUNTRIES, REGIONS, type CountryCode, type IndexEntry, type RegionCode, type RegionMeta } from '@news-globe/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { MeshPhongMaterial } from 'three';
import countriesGeo from '../assets/countries-110m.json';
import { COUNTRY_HEAT, heatStep, REGION_HEAT } from '../lib/heat';

interface Shape {
  type: 'Feature';
  /** Countries carry `iso2`; regions carry `region` (and `iso2: null`). */
  properties: { iso2: string | null; name: string; region?: RegionCode };
  geometry: { type: string; coordinates: unknown };
}

/** Radius, in degrees, of the marker drawn for a country too small for the 110m map. */
const MARKER_RADIUS_DEG = 0.6;

/** A small round polygon at the country's centre, so islands like Malta or the Maldives can be clicked. */
function markerShape(iso2: CountryCode, name: string, lat: number, lng: number): Shape {
  const ring = Array.from({ length: 13 }, (_, i) => {
    const a = (-i / 12) * 2 * Math.PI;
    return [lng + (MARKER_RADIUS_DEG * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + MARKER_RADIUS_DEG * Math.sin(a)];
  });
  return { type: 'Feature', properties: { iso2, name }, geometry: { type: 'Polygon', coordinates: [ring] } };
}

const MAP_FEATURES = (countriesGeo as { features: Shape[] }).features;
const MAPPED = new Set(MAP_FEATURES.map((f) => f.properties.iso2));
const FEATURES = [
  ...MAP_FEATURES,
  ...Object.values(COUNTRIES)
    .filter((c) => !MAPPED.has(c.code))
    .map((c) => markerShape(c.code, c.name, c.lat, c.lng)),
];

/** Region outlines per country, loaded only when that country is opened. */
const REGION_SHAPES: Partial<Record<CountryCode, () => Promise<{ default: unknown }>>> = {
  FR: () => import('../assets/regions-fr.json'),
  DE: () => import('../assets/regions-de.json'),
  US: () => import('../assets/regions-us.json'),
  ES: () => import('../assets/regions-es.json'),
  IT: () => import('../assets/regions-it.json'),
  CA: () => import('../assets/regions-ca.json'),
  AU: () => import('../assets/regions-au.json'),
  BR: () => import('../assets/regions-br.json'),
  MX: () => import('../assets/regions-mx.json'),
  AR: () => import('../assets/regions-ar.json'),
  IN: () => import('../assets/regions-in.json'),
};

async function loadRegionShapes(country: CountryCode): Promise<Shape[]> {
  const load = REGION_SHAPES[country];
  if (!load) return [];
  const geo = (await load()).default as { features: { properties: { region: RegionCode }; geometry: Shape['geometry'] }[] };
  return geo.features.map((f) => ({
    type: 'Feature',
    properties: { iso2: null, region: f.properties.region, name: REGIONS[f.properties.region]?.name ?? f.properties.region },
    geometry: f.geometry,
  }));
}

const COLORS = {
  /** Available countries and regions take their shade from COUNTRY_HEAT / REGION_HEAT. */
  /** Pale amber: the brightest heat steps are near-white, so hover borrows the selection's hue. */
  availableHover: '#ffd894',
  selected: '#ffb547',
  /** The open country under its regions: still reads as selected, but the regions stand out. */
  selectedUnder: 'rgba(255, 181, 71, 0.35)',
  /** Regions of the open country: amber like the country, lighter on hover, dimmed while another is open. */
  regionHover: '#ffffff',
  regionDim: 'rgba(255, 181, 71, 0.45)',
  unavailable: 'rgba(148, 163, 184, 0.28)',
  side: 'rgba(8, 20, 40, 0.6)',
  stroke: 'rgba(5, 11, 22, 0.9)',
  ocean: '#0b1f38',
  atmosphere: '#5fb4ff',
};

const INITIAL_VIEW = { lat: 32, lng: -45, altitude: 2.6 };
/** Portrait phones are narrow: pull the camera back so the whole globe fits the width. */
const MOBILE_ALTITUDE_BOOST = 1.1;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface GlobeViewProps {
  available: ReadonlySet<CountryCode>;
  /** Index lines by country or region code, for each one's top story. */
  entries: ReadonlyMap<string, IndexEntry>;
  selected: CountryCode | null;
  onSelect: (code: CountryCode) => void;
  onUnavailable: (name: string) => void;
  /** Regions of the selected country that have headlines. */
  regions: readonly RegionMeta[];
  selectedRegion: RegionCode | null;
  /** null returns to the country's national headlines. */
  onSelectRegion: (code: RegionCode | null) => void;
  isMobile: boolean;
  /** Fraction of the viewport height covered by the bottom sheet (mobile), so the country stays visible above it. */
  sheetFraction: number;
}

export default function GlobeView({
  available,
  entries,
  selected,
  onSelect,
  onUnavailable,
  regions,
  selectedRegion,
  onSelectRegion,
  isMobile,
  sheetFraction,
}: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<Shape | null>(null);
  const [regionShapes, setRegionShapes] = useState<Shape[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Track the container size (the desktop panel narrows it).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the open country's region outlines once it has regional headlines.
  const hasRegions = regions.length > 0;
  useEffect(() => {
    setRegionShapes([]);
    if (!selected || !hasRegions) return;
    let cancelled = false;
    loadRegionShapes(selected).then(
      (shapes) => !cancelled && setRegionShapes(shapes),
      () => {}, // Without outlines the country still works as a whole.
    );
    return () => {
      cancelled = true;
    };
  }, [selected, hasRegions]);

  const polygons = useMemo(() => (regionShapes.length ? [...FEATURES, ...regionShapes] : FEATURES), [regionShapes]);
  const availableRegions = useMemo(() => new Set(regions.map((r) => r.code)), [regions]);
  const showingRegions = regionShapes.length > 0;

  const material = useMemo(() => new MeshPhongMaterial({ color: COLORS.ocean, shininess: 8 }), []);
  useEffect(() => () => material.dispose(), [material]);

  const handleReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    // Cap resolution: high-DPR phones otherwise render 9x the pixels for little visible gain.
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    const controls = globe.controls();
    controls.autoRotate = selectedRef.current === null;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.minDistance = 115;
    controls.maxDistance = 600;
    if (selectedRef.current === null) {
      globe.pointOfView({ ...INITIAL_VIEW, altitude: INITIAL_VIEW.altitude + (isMobile ? MOBILE_ALTITUDE_BOOST : 0) }, 0);
    }
  }, [isMobile]);

  // Stop auto-rotating while a country is open; resume when the panel closes.
  useEffect(() => {
    const globe = globeRef.current;
    if (globe) globe.controls().autoRotate = selected === null;
  }, [selected]);

  // Fly to the selected region or country; zoom back out (staying over the same spot) when it closes.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (!selected) {
      const { lat, lng } = globe.pointOfView();
      globe.pointOfView({ lat, lng, altitude: INITIAL_VIEW.altitude + (isMobile ? MOBILE_ALTITUDE_BOOST : 0) }, 800);
      return;
    }
    const meta = (selectedRegion && REGIONS[selectedRegion]) || COUNTRIES[selected];
    if (!meta) return;
    // On mobile, aim the camera south of the target so it sits above the bottom sheet.
    const latOffset = isMobile ? -meta.altitude * 28 * sheetFraction : 0;
    const altitude = meta.altitude + (isMobile ? (selectedRegion ? 0.3 : 0.6) : 0);
    globe.pointOfView({ lat: meta.lat + latOffset, lng: meta.lng, altitude }, 1000);
  }, [selected, selectedRegion, isMobile, sheetFraction]);

  const isRegion = (f: Shape) => !!f.properties.region;
  // Features without an ISO code (Somaliland, N. Cyprus) must not match `selected === null`.
  const isSelected = useCallback(
    (f: Shape) =>
      f.properties.region ? f.properties.region === selectedRegion : !!selected && f.properties.iso2 === selected,
    [selected, selectedRegion],
  );
  const isAvailable = useCallback(
    (f: Shape) =>
      f.properties.region
        ? availableRegions.has(f.properties.region)
        : !!f.properties.iso2 && available.has(f.properties.iso2),
    [available, availableRegions],
  );

  const entryOf = useCallback(
    (f: Shape) => entries.get(f.properties.region ?? f.properties.iso2 ?? ''),
    [entries],
  );

  const capColor = useCallback(
    (obj: object) => {
      const f = obj as Shape;
      if (isSelected(f)) return isRegion(f) || !showingRegions ? COLORS.selected : COLORS.selectedUnder;
      if (!isAvailable(f)) return COLORS.unavailable;
      const step = heatStep(entryOf(f)?.topOutlets);
      if (isRegion(f)) {
        if (f === hovered) return COLORS.regionHover;
        return selectedRegion ? COLORS.regionDim : REGION_HEAT[step]!;
      }
      return f === hovered ? COLORS.availableHover : COUNTRY_HEAT[step]!;
    },
    [isSelected, hovered, isAvailable, showingRegions, selectedRegion, entryOf],
  );

  const altitude = useCallback(
    (obj: object) => {
      const f = obj as Shape;
      if (isRegion(f)) {
        if (isSelected(f)) return 0.03;
        return f === hovered && isAvailable(f) ? 0.025 : 0.018;
      }
      if (isSelected(f)) return showingRegions ? 0.008 : 0.05;
      if (!isAvailable(f)) return 0.005;
      return f === hovered ? 0.035 : 0.02;
    },
    [isSelected, hovered, isAvailable, showingRegions],
  );

  const label = useCallback(
    (obj: object) => {
      const f = obj as Shape;
      const hint = isRegion(f)
        ? isAvailable(f)
          ? 'Tap for regional headlines'
          : 'Coming soon'
        : isSelected(f) && showingRegions
          ? 'Tap for national headlines'
          : isAvailable(f)
            ? 'Tap for top headlines'
            : 'Coming soon';
      const entry = isAvailable(f) ? entryOf(f) : undefined;
      const headline = entry?.topTitle ? `<em>${escapeHtml(entry.topTitle)}</em>` : '';
      const n = entry?.topOutlets;
      const count = n ? `${n} outlet${n === 1 ? '' : 's'} on this story · ` : '';
      return `<div class="globe-tip"><strong>${escapeHtml(f.properties.name)}</strong>${headline}<span>${count}${hint}</span></div>`;
    },
    [isAvailable, isSelected, showingRegions, entryOf],
  );

  const handleClick = useCallback(
    (obj: object) => {
      const f = obj as Shape;
      if (f.properties.region) {
        if (isAvailable(f)) onSelectRegion(f.properties.region);
        else onUnavailable(f.properties.name);
      } else if (isSelected(f)) {
        onSelectRegion(null);
      } else if (isAvailable(f)) {
        onSelect(f.properties.iso2!);
      } else {
        onUnavailable(f.properties.name);
      }
    },
    [isAvailable, isSelected, onSelect, onSelectRegion, onUnavailable],
  );

  const handleHover = useCallback(
    (obj: object | null) => {
      const f = obj as Shape | null;
      setHovered(f);
      if (containerRef.current) containerRef.current.style.cursor = f && isAvailable(f) ? 'pointer' : 'grab';
    },
    [isAvailable],
  );

  return (
    <div ref={containerRef} className="globe" aria-hidden="true">
      {size.width > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          onGlobeReady={handleReady}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={material}
          showAtmosphere
          atmosphereColor={COLORS.atmosphere}
          atmosphereAltitude={0.18}
          rendererConfig={{ antialias: !isMobile, alpha: true, powerPreference: 'high-performance' }}
          polygonsData={polygons}
          polygonCapColor={capColor}
          polygonSideColor={() => COLORS.side}
          polygonStrokeColor={() => COLORS.stroke}
          polygonAltitude={altitude}
          polygonCapCurvatureResolution={isMobile ? 8 : 5}
          polygonsTransitionDuration={250}
          polygonLabel={label}
          onPolygonClick={handleClick}
          onPolygonHover={handleHover}
        />
      )}
    </div>
  );
}
