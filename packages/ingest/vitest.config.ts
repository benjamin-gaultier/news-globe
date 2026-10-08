import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**'],
      // Outlet lists: data, not logic.
      exclude: ['src/sources/**', 'src/sources.config.ts'],
    },
  },
});
