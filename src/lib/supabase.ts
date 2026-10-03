import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Read before the client consumes the URL hash of a password-reset link. */
export const openedFromRecoveryLink = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash);

/** Null when the Supabase settings are missing; the app then shows a setup notice instead of the portal. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export const isConfigured = supabase !== null;
