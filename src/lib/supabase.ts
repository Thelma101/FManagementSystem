import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const RECOVERY_KEY = 'fp_password_recovery';

function markPasswordRecovery() {
  try { sessionStorage.setItem(RECOVERY_KEY, '1'); } catch { /* private mode */ }
}

/** True when the URL or a saved flag says this visit is a password-reset return. */
export function isPasswordRecoveryReturn(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  if (/type=recovery/i.test(hash) || /type=recovery/i.test(search)) return true;
  try { return sessionStorage.getItem(RECOVERY_KEY) === '1'; } catch { return false; }
}

export function clearPasswordRecoveryFlag() {
  try { sessionStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ }
}

export function rememberPasswordRecovery() {
  markPasswordRecovery();
}

/** @deprecated use isPasswordRecoveryReturn — kept so older imports keep working */
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && isPasswordRecoveryReturn();

/** Null when the Supabase settings are missing; the app then shows a setup notice instead of the portal. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

// Catch PASSWORD_RECOVERY as soon as the client exchanges the email link,
// even if React has not mounted yet (common with the PKCE ?code= flow).
if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') markPasswordRecovery();
  });
}

export const isConfigured = supabase !== null;
