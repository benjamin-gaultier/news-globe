import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));
const SAMPLE_DIR = path.join(DATA_DIR, 'sample');
// Only the public contract is served — never data/.cache or anything else.
const PUBLIC_FILE = /^\/(index\.json|status\.json|countries\/[A-Z]{2}\.json|regions\/[A-Z]{2}-[A-Z0-9]{1,3}\.json)$/;

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
    // History days and the derived trends/search files are stored gzipped
    // (data/archive/YYYY-MM-DD.json.gz, data/trends.json.gz, data/search.json.gz); send them as such.
    const gzipped = /^\/(archive\/\d{4}-\d{2}-\d{2}|trends|search)\.json$/.exec(rel);
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
    const file = PUBLIC_FILE.test(rel)
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

export default defineConfig({
  plugins: [react(), serveData()],
  // Expose DATA_BASE_URL (unprefixed) to the client as import.meta.env.DATA_BASE_URL.
  envPrefix: ['VITE_', 'DATA_BASE_URL'],
  server: { host: true },
  // The lazy globe chunk is three.js + globe.gl (~600 kB gzipped); the app shell stays small.
  build: { chunkSizeWarningLimit: 2500 },
});
