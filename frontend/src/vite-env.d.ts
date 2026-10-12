/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public backend URL for deployed frontend (optional; defaults to same-origin /api). */
  readonly VITE_API_URL?: string;
}
