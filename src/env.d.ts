/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Safe to ship to the browser. */
  readonly VITE_SUPABASE_URL: string;
  /** Anon/publishable key. Safe to ship: RLS is what protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
