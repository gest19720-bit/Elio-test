import { supabase } from '../js/supabase.js';

export async function listCustomers(businessId) {
  const { data, error } = await supabase.from('customers').select('*').eq('business_id', businessId).order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCustomer(customer) {
  const { data, error } = await supabase.from('customers').insert(customer).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(id, businessId, changes) {
  const { data, error } = await supabase.from('customers').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', businessId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCustomer(id, businessId) {
  const { error } = await supabase.from('customers').delete().eq('id', id).eq('business_id', businessId);
  if (error) throw error;
}
