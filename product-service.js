import { supabase } from '../js/supabase.js';

export async function listProducts(businessId) {
  const { data, error } = await supabase.from('products').select('*').eq('business_id', businessId).order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createProduct(product) {
  const { data, error } = await supabase.from('products').insert(product).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, businessId, changes) {
  const { data, error } = await supabase.from('products').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', businessId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id, businessId) {
  const { error } = await supabase.from('products').delete().eq('id', id).eq('business_id', businessId);
  if (error) throw error;
}
