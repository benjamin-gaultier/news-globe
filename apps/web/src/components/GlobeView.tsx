import { COUNTRIES, type CountryCode } from '@news-globe/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { MeshPhongMaterial } from 'three';
import countriesGeo from '../assets/countries-110m.json';

interface CountryFeature {
  type: 'Feature';
  properties: { iso2: string | null; name: string };
  geometry: { type: string; coordinates: unknown };
}

const FEATURES = (countriesGeo as { features: CountryFeature[] }).features;

const COLORS = {
  available: '#3fa7ff',
  availableHover: '#8ccaff',
  selected: '#ffb547',
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
  selected: CountryCode | null;
  onSelect: (code: CountryCode) => void;
  onUnavailable: (name: string) => void;
  isMobile: boolean;
  /** Fraction of the viewport height covered by the bottom sheet (mobile), so the country stays visible above it. */
  sheetFraction: number;
}

export default function GlobeView({ available, selected, onSelect, onUnavailable, isMobile, sheetFraction }: GlobeViewProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<CountryFeature | null>(null);
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
    controls.minDistance = 130;
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

  // Fly to the selected country; zoom back out (staying over the same spot) when it closes.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (!selected) {
      const { lat, lng } = globe.pointOfView();
      globe.pointOfView({ lat, lng, altitude: INITIAL_VIEW.altitude + (isMobile ? MOBILE_ALTITUDE_BOOST : 0) }, 800);
      return;
    }
    const meta = COUNTRIES[selected];
    if (!meta) return;
    // On mobile, aim the camera south of the country so it sits above the bottom sheet.
    const latOffset = isMobile ? -meta.altitude * 28 * sheetFraction : 0;
    globe.pointOfView({ lat: meta.lat + latOffset, lng: meta.lng, altitude: meta.altitude + (isMobile ? 0.6 : 0) }, 1000);
  }, [selected, isMobile, sheetFraction]);

  // Features without an ISO code (Somaliland, N. Cyprus) must not match `selected === null`.
  const isSelected = useCallback((f: CountryFeature) => !!selected && f.properties.iso2 === selected, [selected]);
  const isAvailable = useCallback((f: CountryFeature) => !!f.properties.iso2 && available.has(f.properties.iso2), [available]);

  const capColor = useCallback(
    (obj: object) => {
      const f = obj as CountryFeature;
      if (isSelected(f)) return COLORS.selected;
      if (!isAvailable(f)) return COLORS.unavailable;
      return f === hovered ? COLORS.availableHover : COLORS.available;
    },
    [isSelected, hovered, isAvailable],
  );

  const altitude = useCallback(
    (obj: object) => {
      const f = obj as CountryFeature;
      if (isSelected(f)) return 0.05;
      if (!isAvailable(f)) return 0.005;
      return f === hovered ? 0.035 : 0.02;
    },
    [isSelected, hovered, isAvailable],
  );

  const label = useCallback(
    (obj: object) => {
      const f = obj as CountryFeature;
      const hint = isAvailable(f) ? 'Tap for top headlines' : 'Coming soon';
      return `<div class="globe-tip"><strong>${escapeHtml(f.properties.name)}</strong><span>${hint}</span></div>`;
    },
    [isAvailable],
  );

  const handleClick = useCallback(
    (obj: object) => {
      const f = obj as CountryFeature;
      if (isAvailable(f)) onSelect(f.properties.iso2!);
      else onUnavailable(f.properties.name);
    },
    [isAvailable, onSelect, onUnavailable],
  );

  const handleHover = useCallback((obj: object | null) => {
    const f = obj as CountryFeature | null;
    setHovered(f);
    if (containerRef.current) {
      containerRef.current.style.cursor = f && f.properties.iso2 && available.has(f.properties.iso2) ? 'pointer' : 'grab';
    }
  }, [available]);

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
          polygonsData={FEATURES}
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
