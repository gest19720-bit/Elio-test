import { supabase } from '../js/supabase.js';
import { logActivity } from './activity-service.js';

export async function listTasks(businessId) {
  const { data, error } = await supabase.from('tasks').select('*, customers(name, company)').eq('business_id', businessId).order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}
export async function createTask(task) {
  const { data, error } = await supabase.from('tasks').insert(task).select().single();
  if (error) throw error;
  await logActivity({ businessId: task.business_id, action: `Created task “${task.title}”`, entityType: 'task', entityId: data.id });
  return data;
}
export async function updateTask(id, businessId, changes) {
  const { data, error } = await supabase.from('tasks').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', businessId).select().single();
  if (error) throw error; return data;
}
export async function deleteTask(id, businessId) {
  const { error } = await supabase.from('tasks').delete().eq('id', id).eq('business_id', businessId);
  if (error) throw error;
  await logActivity({ businessId, action: 'Deleted a task', entityType: 'task', entityId: id });
}
