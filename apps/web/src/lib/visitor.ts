import { COUNTRIES, type CountryCode } from '@news-globe/shared';

/** Intl.Locale's time zones: a method in newer engines, a getter in older ones, absent in Firefox. */
type LocaleInfo = Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] };

function timeZonesOf(code: CountryCode): readonly string[] {
  try {
    const locale = new Intl.Locale(`und-${code}`) as LocaleInfo;
    return locale.getTimeZones?.() ?? locale.timeZones ?? [];
  } catch {
    return [];
  }
}

function regionOf(language: string): string | undefined {
  try {
    return new Intl.Locale(language).region;
  } catch {
    return undefined; // a malformed tag
  }
}

/**
 * The visitor's country, guessed on the device: the country of the browser's time zone, else the region of its
 * first language that names one (`pt-BR`). The engine lists each country's zones under the same names it reports
 * (Chrome's `Asia/Calcutta`), so no table is needed. Null when neither names a country in COUNTRIES (`UTC`, `en`).
 */
export function visitorCountry(
  timeZone: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone,
  languages: readonly string[] = navigator.languages ?? [navigator.language],
): CountryCode | null {
  if (timeZone) {
    const code = Object.keys(COUNTRIES).find((c) => timeZonesOf(c).includes(timeZone));
    if (code) return code;
  }
  for (const language of languages) {
    const region = regionOf(language);
    if (region && COUNTRIES[region]) return region;
  }
  return null;
}
