import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(value => value.trim()).filter(Boolean);
const corsHeaders = (request: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(request.headers.get('Origin') || '') ? request.headers.get('Origin') || '' : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin'
});
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
const safeText = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const fetchProductContext = async (supabase: any, businessId: string) => {
  const select = 'id,name,category,selling_price,stock,sales,description,updated_at';
  const [top, lowStock, recent] = await Promise.all([
    supabase.from('products').select(select).eq('business_id', businessId).order('sales', { ascending: false }).order('id', { ascending: true }).limit(50),
    supabase.from('products').select(select).eq('business_id', businessId).order('stock', { ascending: true }).order('updated_at', { ascending: false }).limit(50),
    supabase.from('products').select(select).eq('business_id', businessId).order('updated_at', { ascending: false }).order('id', { ascending: true }).limit(50)
  ]);
  const failed = [top, lowStock, recent].find(result => result.error);
  if (failed) throw failed.error;
  const products = new Map<string, any>();
  [top.data || [], lowStock.data || [], recent.data || []].flat().forEach(product => {
    products.set(product.id, { ...product, description: safeText(product.description, 500) });
  });
  return [...products.values()];
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json(request, { error: 'Authentication required.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json(request, { error: 'Authentication required.' }, 401);
    const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_followup_quota', { p_limit: 30 });
    if (quotaError) return json(request, { error: 'AI usage limits are not configured yet.' }, 503);
    if (!allowed) return json(request, { error: 'You have reached today’s Elio AI limit.' }, 429);
    const input = await request.json();
    const question = safeText(input.question, 1200);
    if (!question) return json(request, { error: 'Ask Elio a question first.' }, 400);
    const { data: business, error: businessError } = await supabase.from('businesses').select('id,name,industry,size,communication_style,automation_level,help_areas').eq('owner_id', user.id).maybeSingle();
    if (businessError || !business) return json(request, { error: 'Complete onboarding before using Ask Elio.' }, 400);
    const [tasks, approvals, customers, products, activities] = await Promise.all([
      supabase.from('tasks').select('title,status,priority,due_date').eq('business_id', business.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('approvals').select('title,status,created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('customers').select('name,company,status,last_contact_at,notes').eq('business_id', business.id).order('updated_at', { ascending: false }).limit(50),
      fetchProductContext(supabase, business.id),
      supabase.from('activities').select('actor,action,entity_type,created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(30)
    ]);
    if ([tasks, approvals, customers, activities].some(result => result.error)) return json(request, { error: 'Elio could not load your workspace context.' }, 500);
    const prompt = `You are Elio, a calm AI back-office employee. Answer the owner's question using only the supplied workspace data. Never invent facts. Be concise and action-oriented. Do not claim to have sent, changed, deleted, or scheduled anything. If the owner asks for a risky action, explain that approval is required. Return JSON only.

Workspace: ${JSON.stringify({ business, tasks: tasks.data || [], approvals: approvals.data || [], customers: customers.data || [], products, product_context_note: 'Products include up to 50 top sellers, 50 lowest-stock items, and 50 recently updated items; this is a relevant snapshot, not the complete catalog.', activities: activities.data || [] })}

Question: ${question}`;
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json(request, { error: 'AI service is not configured yet.' }, 503);
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini', input: prompt, max_output_tokens: 700, store: false, text: { format: { type: 'json_schema', name: 'elio_assistant', strict: true, schema: { type: 'object', properties: { answer: { type: 'string' }, next_steps: { type: 'array', items: { type: 'string' }, maxItems: 4 }, sources: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, required: ['answer', 'next_steps', 'sources'], additionalProperties: false } } } }) });
    if (!response.ok) return json(request, { error: 'The AI service could not answer that question.' }, response.status === 429 ? 429 : 502);
    const payload = await response.json();
    if (!payload.output_text) return json(request, { error: 'The AI service returned an empty answer.' }, 502);
    const result = JSON.parse(payload.output_text);
    if (typeof result.answer !== 'string' || !Array.isArray(result.next_steps) || !Array.isArray(result.sources)) return json(request, { error: 'The AI response was incomplete.' }, 502);
    return json(request, result);
  } catch (_error) { return json(request, { error: 'Elio could not answer that question.' }, 500); }
});
