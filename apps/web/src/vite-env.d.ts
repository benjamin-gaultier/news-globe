/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where index.json and countries/*.json live. Defaults to "/data" (served by the Vite plugin). */
  readonly DATA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
