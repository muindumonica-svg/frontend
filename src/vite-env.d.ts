/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base path; defaults to `/api` when unset (see `src/lib/api.ts`). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
