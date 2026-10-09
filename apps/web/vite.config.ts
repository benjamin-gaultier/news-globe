import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { PUBLIC_DERIVED, PUBLIC_FILE } from '@news-globe/shared/bundle';

const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));
const SAMPLE_DIR = path.join(DATA_DIR, 'sample');
// Only the public contract is served (PUBLIC_FILE, as in the Worker): never data/.cache or anything else.
/** History days and the derived files, stored gzipped. */
const GZIPPED_FILE = new RegExp(`^/(archive/\\d{4}-\\d{2}-\\d{2}|${PUBLIC_DERIVED.join('|')})\\.json$`);

/**
 * Serves the ingest output at /data/* during `vite dev` and `vite preview`,
 * falling back to the committed sample (data/sample/) until the first
 * `pnpm ingest`. In production the same paths live behind DATA_BASE_URL.
 */
function serveData(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (!pathname.startsWith('/data/')) return next();
    const rel = pathname.slice('/data'.length);
    // History days and the derived trends/search/today files live gzipped in KV, written by the
    // archive step, never locally: copies saved as data/archive/YYYY-MM-DD.json.gz, data/today.json.gz
    // etc. are sent as such.
    const gzipped = GZIPPED_FILE.exec(rel);
    if (gzipped) {
      readFile(path.join(DATA_DIR, `${gzipped[1]}.json.gz`)).then(
        (body) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
        },
        () => {
          res.statusCode = 404;
          res.end('Not found');
        },
      );
      return;
    }
    const file = PUBLIC_FILE.test(rel.slice(1))
      ? [DATA_DIR, SAMPLE_DIR].map((dir) => path.join(dir, rel)).find((f) => existsSync(f))
      : undefined;
    if (!file) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    // Read fully rather than stream: the files are small, and a stream piped to an
    // aborted request keeps the file open, which blocks the ingest's rename on Windows.
    readFile(file).then(
      (body) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(body);
      },
      () => {
        res.statusCode = 500;
        res.end('Read error');
      },
    );
  };
  return {
    name: 'news-globe-data',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

/**
 * The globe is a lazy chunk so the shell renders first, but nothing in the
 * HTML names it: the browser would only start on it once the app's script has
 * run. A modulepreload link starts both downloads together.
 */
function preloadGlobe(): Plugin {
  return {
    name: 'news-globe-preload-globe',
    apply: 'build',
    transformIndexHtml(_html, ctx) {
      const chunk = Object.values(ctx.bundle ?? {}).find((c) => c.type === 'chunk' && c.name === 'GlobeView');
      if (!chunk) return [];
      return [{ tag: 'link', attrs: { rel: 'modulepreload', href: `/${chunk.fileName}` }, injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  plugins: [react(), serveData(), preloadGlobe()],
  // Expose DATA_BASE_URL (unprefixed) to the client as import.meta.env.DATA_BASE_URL.
  envPrefix: ['VITE_', 'DATA_BASE_URL'],
  server: { host: true },
  // The lazy globe chunk is three.js + globe.gl (~600 kB gzipped); the app shell stays small.
  build: { chunkSizeWarningLimit: 2500 },
});
