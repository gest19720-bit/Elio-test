import { supabase } from './supabase-client.js';

export async function logActivity({ businessId, actor = 'User', action, entityType, entityId = null, metadata = {} }) {
  const { error } = await supabase.from('activities').insert({
    business_id: businessId, actor, action, entity_type: entityType, entity_id: entityId, metadata
  });
  if (error) throw error;
}

export async function listActivities(businessId, limit = 12) {
  const { data, error } = await supabase.from('activities').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
