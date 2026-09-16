import { supabase } from '../js/supabase.js';

export async function buildDailyBrief(businessId) {
  const [tasks, approvals, customers] = await Promise.all([
    supabase.from('tasks').select('id,status,due_date,title').eq('business_id', businessId),
    supabase.from('approvals').select('id,status,title').eq('business_id', businessId).eq('status', 'Pending'),
    supabase.from('customers').select('id,name,last_contact_at,status').eq('business_id', businessId)
  ]);
  if (tasks.error) throw tasks.error; if (approvals.error) throw approvals.error; if (customers.error) throw customers.error;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (tasks.data || []).filter(t => t.status !== 'Completed' && t.due_date && t.due_date < today);
  const followUps = (customers.data || []).filter(c => c.status === 'Needs Follow-Up' || (c.last_contact_at && (Date.now() - new Date(c.last_contact_at).getTime()) > 7 * 86400000));
  return { overdue, followUps, approvals: approvals.data || [], totalAttention: overdue.length + followUps.length + (approvals.data || []).length };
}
