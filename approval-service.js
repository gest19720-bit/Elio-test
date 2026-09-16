import { supabase } from '../js/supabase.js';
import { logActivity } from './activity-service.js';

export async function listApprovals(businessId) {
  const { data, error } = await supabase.from('approvals').select('*, customers(name, company), tasks(title)').eq('business_id', businessId).order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}
export async function createApproval(approval) {
  let record = approval;
  if (approval.action_type === 'Follow-Up' && !approval.follow_up_id && approval.customer_id) {
    const { data: followUp } = await supabase.from('follow_ups').select('id').eq('business_id', approval.business_id).eq('customer_id', approval.customer_id).eq('status', 'Pending Approval').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (followUp?.id) record = { ...approval, follow_up_id: followUp.id };
  }
  const { data, error } = await supabase.from('approvals').insert(record).select().single();
  if (error) throw error; return data;
}
export async function resolveApproval(approval, status, userId) {
  const { data, error } = await supabase.from('approvals').update({ status, approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', approval.id).eq('business_id', approval.business_id).select().single();
  if (error) throw error;
  if (status === 'Approved' && approval.task_id) await supabase.from('tasks').update({ status: 'Completed', updated_at: new Date().toISOString() }).eq('id', approval.task_id).eq('business_id', approval.business_id);
  if (status === 'Approved' && approval.follow_up_id) await supabase.from('follow_ups').update({ status: 'Sent', approved_at: new Date().toISOString(), sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', approval.follow_up_id).eq('business_id', approval.business_id);
  await logActivity({ businessId: approval.business_id, action: `${status} approval: ${approval.title}`, entityType: 'approval', entityId: approval.id, metadata: { status } });
  return data;
}
