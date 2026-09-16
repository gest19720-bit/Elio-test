import { supabase } from '../js/supabase.js';

const encoder = new TextEncoder();

function tokenValue() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `elio_mcp_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function listMcpConnections() {
  const { data, error } = await supabase.from('mcp_connections').select('id, app_name, scopes, created_at, last_used_at, revoked_at, expires_at, request_count').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMcpConnection({ appName, scopes, expiresAt }) {
  const token = tokenValue();
  const { data, error } = await supabase.from('mcp_connections').insert({ app_name: appName.trim(), token_hash: await sha256(token), scopes, expires_at: expiresAt || null }).select('id, app_name, scopes, created_at, expires_at').single();
  if (error) throw error;
  return { connection: data, token };
}

export async function revokeMcpConnection(id) {
  const { error } = await supabase.from('mcp_connections').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function listMcpAccessLog(connectionId) {
  const { data, error } = await supabase.from('mcp_access_log').select('id, connection_id, tool_name, requested_at, latency_ms, success').eq('connection_id', connectionId).order('requested_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}
