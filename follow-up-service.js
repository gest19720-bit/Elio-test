import { supabase } from './supabase-client.js';

export async function createFollowUpWorkflow({ businessId, customerId, subject, message, suggestedAction, generatedBy }) {
  const { data, error } = await supabase.rpc('create_follow_up_workflow', {
    p_business_id: businessId,
    p_customer_id: customerId,
    p_subject: subject,
    p_message: message,
    p_suggested_action: suggestedAction,
    p_generated_by: generatedBy
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.follow_up_id || !result?.approval_id) throw new Error('The follow-up workflow response was incomplete.');
  return result;
}
