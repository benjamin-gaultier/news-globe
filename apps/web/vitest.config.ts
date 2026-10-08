import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Component tests opt into jsdom per file (`@vitest-environment jsdom`); the rest run in Node.
      setupFiles: ['test/setup.ts'],
      // Browser tests: Playwright runs those (`pnpm e2e`).
      exclude: [...configDefaults.exclude, 'e2e/**'],
      coverage: {
        include: ['src/**/*.{ts,tsx}', 'worker/**'],
      },
    },
  }),
);
