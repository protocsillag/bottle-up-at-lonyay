/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the score Worker (server/), e.g. https://bottle-up-scores.<account>.workers.dev. Empty = local scores only. */
  readonly VITE_SCORES_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
