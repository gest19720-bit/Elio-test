import { supabase } from './supabase-client.js';

async function request(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to Elio again before managing connections.');
  const response = await fetch('/api/composio', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) throw new Error('The Composio server endpoint is unavailable. Deploy the current server route, or restart the local Elio server.');
    const error = new Error(result.error || `Composio request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

export const listWorkspaceConnections = () => request('status');
export const authorizeWorkspaceApp = toolkit => request('authorize', { toolkit });
export const searchWorkspaceTools = (toolkit, query) => request('search', { toolkit, query });
