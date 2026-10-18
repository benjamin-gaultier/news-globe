import { COUNTRIES, type CountryCode } from '@news-globe/shared';

const RAD = Math.PI / 180;

/**
 * Where the camera aims to show `codes`' countries together: the point between them on the sphere. Spread around it
 * (Spain and New Zealand are almost antipodes), they have no such point, so it aims at the first, best-covered one.
 */
export function middleOf(codes: readonly CountryCode[]): { lat: number; lng: number } {
  const known = codes.flatMap((code) => COUNTRIES[code] ?? []);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const c of known) {
    x += Math.cos(c.lat * RAD) * Math.cos(c.lng * RAD);
    y += Math.cos(c.lat * RAD) * Math.sin(c.lng * RAD);
    z += Math.sin(c.lat * RAD);
  }
  // The countries' unit vectors mostly cancel out.
  const first = known[0];
  if (first && Math.hypot(x, y, z) < 0.5 * known.length) return { lat: first.lat, lng: first.lng };
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lng: Math.atan2(y, x) / RAD };
}
