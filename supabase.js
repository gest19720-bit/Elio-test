import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Keep the client local so localhost and production do not depend on a third-party
// module CDN being reachable before the application can even render.
if (!window.supabase?.createClient) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/supabase.js', import.meta.url).href;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Elio could not load its local Supabase client.'));
    document.head.appendChild(script);
  });
}

const { createClient } = window.supabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function requireSession({ redirect = '../login.html' } = {}) {
  const sessionRequest = supabase.auth.getSession();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase session check timed out. Check your internet connection and Supabase project URL.')), 12000));
  const { data: { session } } = await Promise.race([sessionRequest, timeout]);
  if (!session) { window.location.href = redirect; return null; }
  return session;
}

export async function getBusiness() {
  const { data, error } = await supabase.from('businesses').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureProfile(user, fullName = '') {
  const { error } = await supabase.from('profiles').upsert({
    id: user.id, email: user.email || '', full_name: fullName || user.user_metadata?.full_name || ''
  });
  if (error) throw error;
}

export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (/duplicate|already exists|unique/i.test(message)) return 'That record already exists.';
  if (/timed out|failed to fetch|network|could not load/i.test(message)) return 'Elio could not reach Supabase. Check your internet connection and confirm the project URL is available.';
  if (/JWT|auth|session has expired/i.test(message)) return 'Your session has expired. Please sign in again.';
  if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(message)) return 'Elio’s product tables are not installed yet. Run supabase/migrations/002_elio_mvp.sql in Supabase SQL Editor, then refresh.';
  if (code === 'PGRST202' || /function .*create_follow_up_workflow.*not found|Could not find the function/i.test(message)) return 'Elio’s follow-up workflow is not installed yet. Run supabase/migrations/002_elio_mvp.sql in Supabase SQL Editor, then refresh.';
  if (code === '42703' || /column .* does not exist|schema cache/i.test(message)) return 'Elio’s database schema is out of date. Re-run supabase/migrations/002_elio_mvp.sql in Supabase SQL Editor, then refresh.';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'Elio cannot access this workspace. Confirm onboarding is complete and the Supabase RLS migration is applied.';
  return fallback;
}
