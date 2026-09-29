/**
 * Bundled DEMO OpenSea key (public, rotatable burner key).
 *
 * SECURITY NOTE: this value ships inside the public client bundle and is
 * therefore visible to anyone. That is intentional and accepted for this
 * read-only demo: it is a low-privilege, rate-limited, throwaway key used
 * only for public GETs against OpenSea's v2 API. It grants no writes and
 * moves no funds. Production should use a server-side proxy instead (see
 * .env.example). Rotate at https://opensea.io/settings/developer if
 * inventory loads start failing with 401/429.
 * Prefer VITE_OPENSEA_API_KEY when set (build/env config); fall back to the
 * bundled demo value so `npm run dev` / static builds just work.
 * NEVER log this value. Rotate at https://opensea.io/settings/developer
 * if inventory loads fail with 401/429.
 */
function readEnvKey(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (env?.VITE_OPENSEA_API_KEY) return env.VITE_OPENSEA_API_KEY;
  } catch {
    // ignore (non-Vite runtimes)
  }
  return '';
}

export const BUNDLED_DEMO_KEY =
  readEnvKey() || '460ab7174a8d4ed2aa86e8f327b95e94';
