import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(value => value.trim()).filter(Boolean);
const cleanText = (value: unknown, max: number) => String(value || '').trim().replace(/\u0000/g, '').slice(0, max);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
};
const json = (request: Request, code: string, status: number, body: Record<string, unknown> = {}) => new Response(JSON.stringify(status < 400 ? body : { error: { code } }), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
const isTransient = (status: number) => [408, 409, 500, 502, 503, 504].includes(status);

async function callOpenAi(apiKey: string, body: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (response.ok || !isTransient(response.status) || attempt === 1) return response;
    } catch (error) { if (attempt === 1) throw error; }
    finally { clearTimeout(timer); }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error('AI request failed');
}

function outputText(payload: any) {
  const part = Array.isArray(payload?.output) ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).find((item: any) => item?.type === 'output_text' && typeof item.text === 'string') : null;
  return cleanText(part?.text, 10000);
}

function topics(question: string) {
  const value = question.toLowerCase();
  return {
    tasks: /task|overdue|due|priority|attention|today|work/.test(value), approvals: /approval|approve|decision|attention|today/.test(value),
    customers: /customer|lead|follow.?up|client|sales|revenue|marketing|performance/.test(value), products: /product|inventory|stock|catalog|sales|revenue|marketing|performance/.test(value),
    activities: /activity|recent|happened|did elio|history/.test(value)
  };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, 'METHOD_NOT_ALLOWED', 405);
  try {
    const input = await request.json().catch(() => null);
    if (typeof input?.question !== 'string') return json(request, 'INVALID_INPUT', 400);
    const rawQuestion = input.question.trim();
    const question = cleanText(rawQuestion, 1200);
    if (!question || rawQuestion.length > 1200) return json(request, 'INVALID_INPUT', 400);
    if (!request.headers.get('Authorization')) return json(request, 'AUTHENTICATION_REQUIRED', 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization')! } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json(request, 'AUTHENTICATION_REQUIRED', 401);
    const { data: business, error: businessError } = await supabase.from('businesses').select('id,name,industry,size,communication_style,help_areas').eq('owner_id', user.id).maybeSingle();
    if (businessError) { console.error('ai-assistant business context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); }
    if (!business) return json(request, 'ONBOARDING_REQUIRED', 400);
    const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_followup_quota', { p_limit: 30 });
    if (quotaError) { console.error('ai-assistant quota unavailable'); return json(request, 'AI_UNAVAILABLE', 503); }
    if (!allowed) return json(request, 'RATE_LIMITED', 429);
    const use = topics(question);
    const [tasks, approvals, customers, products, activities] = await Promise.all([
      use.tasks ? supabase.from('tasks').select('title,status,priority,due_date').eq('business_id', business.id).order('created_at', { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
      use.approvals ? supabase.from('approvals').select('title,status,created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      use.customers ? supabase.from('customers').select('name,company,status,last_contact_at,notes').eq('business_id', business.id).order('updated_at', { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
      use.products ? supabase.from('products').select('name,category,selling_price,stock,sales,description').eq('business_id', business.id).order('updated_at', { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
      use.activities ? supabase.from('activities').select('actor,action,entity_type,created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] })
    ]);
    if ([tasks, approvals, customers, products, activities].some((result: any) => result.error)) { console.error('ai-assistant workspace context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); }
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json(request, 'AI_NOT_CONFIGURED', 503);
    const instructions = 'You are Elio, a practical back-office assistant for a small business. Use only the supplied business context and application data. Never invent customers, purchases, sales, revenue, inventory, or business facts. If information is absent, say it is unavailable. Separate recorded facts from suggestions, keep the answer concise, and do not claim to send, change, delete, schedule, or approve anything. Ask one concise clarification question only when needed. Return JSON matching the schema.';
    const context = { business, application_data: { tasks: tasks.data || [], approvals: approvals.data || [], customers: customers.data || [], products: products.data || [], activities: activities.data || [] } };
    const response = await callOpenAi(apiKey, { model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini', store: false, max_output_tokens: 700, input: [{ role: 'system', content: instructions }, { role: 'user', content: `Business context:\n${JSON.stringify(context)}\n\nUser request:\n${question}` }], text: { format: { type: 'json_schema', name: 'elio_assistant', strict: true, schema: { type: 'object', properties: { answer: { type: 'string' }, next_steps: { type: 'array', items: { type: 'string' } }, sources: { type: 'array', items: { type: 'string' } } }, required: ['answer', 'next_steps', 'sources'], additionalProperties: false } } } });
    if (!response.ok) { console.error(`ai-assistant upstream status ${response.status}`); return json(request, response.status === 429 ? 'RATE_LIMITED' : response.status === 504 ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', response.status === 429 ? 429 : 502); }
    let result: any; try { result = JSON.parse(outputText(await response.json())); } catch { return json(request, 'INVALID_AI_RESPONSE', 502); }
    const answer = cleanText(result?.answer, 4000);
    const nextSteps = Array.isArray(result?.next_steps) ? result.next_steps.map((item: unknown) => cleanText(item, 300)).filter(Boolean).slice(0, 4) : [];
    const sources = Array.isArray(result?.sources) ? result.sources.map((item: unknown) => cleanText(item, 100)).filter(Boolean).slice(0, 5) : [];
    if (!answer || !nextSteps.length || !sources.length) return json(request, 'INVALID_AI_RESPONSE', 502);
    return json(request, 'OK', 200, { answer, next_steps: nextSteps, sources });
  } catch (error) { console.error('ai-assistant unexpected failure', error instanceof Error ? error.name : 'unknown'); return json(request, 'AI_UNAVAILABLE', 500); }
});
