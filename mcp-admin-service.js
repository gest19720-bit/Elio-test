import { supabase } from '../js/supabase.js';

async function invoke(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('mcp-admin', { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error?.message || 'MCP administration request failed.');
  return data;
}

export const getMcpOverview = () => invoke('overview');
export const setMcpPermission = (connectionId, capabilityName, accessLevel, enabled) => invoke('set_permission', { connection_id: connectionId, capability_name: capabilityName, access_level: accessLevel, enabled });
export const createExternalMcp = payload => invoke('create_external', payload);
export const testExternalMcp = id => invoke('test_external', { id });
export const setExternalMcpEnabled = (id, enabled) => invoke('set_external_enabled', { id, enabled });
export const removeExternalMcp = id => invoke('disconnect_external', { id });
export const revokeOAuthGrant = id => invoke('revoke_oauth_grant', { grant_id: id });
