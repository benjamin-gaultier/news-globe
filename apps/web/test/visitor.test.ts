import { describe, expect, it } from 'vitest';
import { visitorCountry } from '../src/lib/visitor';

describe('visitorCountry', () => {
  it('names the country of the browser’s time zone, before its languages', () => {
    expect(visitorCountry('Europe/Paris', [])).toBe('FR');
    expect(visitorCountry('America/Chicago', ['fr-FR'])).toBe('US');
  });

  it('falls back to the first language that names a country', () => {
    expect(visitorCountry('UTC', ['en', 'pt-BR', 'fr-FR'])).toBe('BR');
    expect(visitorCountry('Etc/GMT+3', ['de-DE'])).toBe('DE');
  });

  it('is null when neither names a country on the globe', () => {
    expect(visitorCountry('UTC', ['en', 'fr', 'not a tag'])).toBeNull();
  });
});
