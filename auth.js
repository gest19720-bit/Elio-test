import { supabase, ensureProfile } from './supabase-client.js';

export async function signUp({ fullName, email, password }) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) throw error;
  if (data.user && data.session) await ensureProfile(data.user, fullName);
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() { await supabase.auth.signOut(); window.location.href = 'login.html'; }

export async function redirectIfAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = 'dashboard.html';
}
