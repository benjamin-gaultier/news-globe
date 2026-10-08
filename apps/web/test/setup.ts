import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  // Browser APIs jsdom doesn't implement.
  Element.prototype.scrollTo ??= () => {};
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;

  // Testing Library only cleans up on its own when vitest globals are on; they are off here.
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
    localStorage.clear();
    history.replaceState(null, '', '/');
  });
}
