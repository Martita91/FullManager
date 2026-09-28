/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Safe to ship to the browser. */
  readonly VITE_SUPABASE_URL: string;
  /** Anon/publishable key. Safe to ship: RLS is what protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /**
   * `"true"` shows the guest button on the sign-in screen. Only a flag — the
   * demo account's credentials are server-side, in `GUEST_EMAIL`/`GUEST_PASSWORD`.
   */
  readonly VITE_GUEST_ACCESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
