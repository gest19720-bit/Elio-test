import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(value => value.trim()).filter(Boolean);
const cleanText = (value: unknown, max: number) => String(value || '').trim().replace(/\u0000/g, '').slice(0, max);
const corsHeaders = (request: Request) => { const origin = request.headers.get('Origin') || ''; return { 'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }; };
const json = (request: Request, code: string, status: number, body: Record<string, unknown> = {}) => new Response(JSON.stringify(status < 400 ? body : { error: { code } }), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
const isTransient = (status: number) => [408, 409, 500, 502, 503, 504].includes(status);
async function callOpenAi(apiKey: string, body: Record<string, unknown>) { for (let attempt = 0; attempt < 2; attempt += 1) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000); try { const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }); if (response.ok || !isTransient(response.status) || attempt === 1) return response; } catch (error) { if (attempt === 1) throw error; } finally { clearTimeout(timer); } await new Promise(resolve => setTimeout(resolve, 350)); } throw new Error('AI request failed'); }
function outputText(payload: any) { const part = Array.isArray(payload?.output) ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).find((item: any) => item?.type === 'output_text' && typeof item.text === 'string') : null; return cleanText(part?.text, 10000); }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, 'METHOD_NOT_ALLOWED', 405);
  try {
    const input = await request.json().catch(() => null); if (typeof (input?.customerId || input?.customer_id) !== 'string' || typeof input?.context !== 'string') return json(request, 'INVALID_INPUT', 400); const rawCustomerId = String(input.customerId || input.customer_id).trim(); const rawContext = input.context.trim(); const customerId = cleanText(rawCustomerId, 80); const context = cleanText(rawContext, 3000); const tone = ['Professional', 'Friendly', 'Casual', 'Formal'].includes(input?.tone) ? input.tone : 'Friendly';
    if (!customerId || !context || rawCustomerId.length > 80 || rawContext.length > 3000) return json(request, 'INVALID_INPUT', 400);
    if (!request.headers.get('Authorization')) return json(request, 'AUTHENTICATION_REQUIRED', 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization')! } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) return json(request, 'AUTHENTICATION_REQUIRED', 401);
    const { data: business, error: businessError } = await supabase.from('businesses').select('id,name,industry,communication_style').eq('owner_id', user.id).maybeSingle();
    if (businessError) { console.error('ai-follow-up business context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); } if (!business) return json(request, 'ONBOARDING_REQUIRED', 400);
    const { data: customer, error: customerError } = await supabase.from('customers').select('id,name,company,status,last_contact_at,notes').eq('business_id', business.id).eq('id', customerId).maybeSingle();
    if (customerError) { console.error('ai-follow-up customer context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); } if (!customer) return json(request, 'CUSTOMER_NOT_FOUND', 404);
    const { data: relatedTasks, error: tasksError } = await supabase.from('tasks').select('title,status,priority,due_date').eq('business_id', business.id).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(8);
    if (tasksError) { console.error('ai-follow-up task context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); }
    const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_followup_quota', { p_limit: 20 }); if (quotaError) { console.error('ai-follow-up quota unavailable'); return json(request, 'AI_UNAVAILABLE', 503); } if (!allowed) return json(request, 'RATE_LIMITED', 429);
    const apiKey = Deno.env.get('OPENAI_API_KEY'); if (!apiKey) return json(request, 'AI_NOT_CONFIGURED', 503);
    const instructions = 'You are Elio, preparing a concise customer follow-up for the business owner to review. Use only the provided facts. Never invent details, promises, prices, delivery dates, or prior conversations. Never say anything has been sent. Keep the message professional and editable. Return JSON matching the schema.';
    const data = { business: { name: business.name, industry: business.industry, communication_style: business.communication_style }, customer, related_tasks: relatedTasks || [], owner_context: context, requested_tone: tone };
    const response = await callOpenAi(apiKey, { model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini', store: false, max_output_tokens: 500, input: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(data) }], text: { format: { type: 'json_schema', name: 'elio_follow_up', strict: true, schema: { type: 'object', properties: { subject: { type: 'string' }, message: { type: 'string' }, suggested_action: { type: 'string' } }, required: ['subject', 'message', 'suggested_action'], additionalProperties: false } } } });
    if (!response.ok) { console.error(`ai-follow-up upstream status ${response.status}`); return json(request, response.status === 429 ? 'RATE_LIMITED' : response.status === 504 ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', response.status === 429 ? 429 : 502); }
    let result: any; try { result = JSON.parse(outputText(await response.json())); } catch { return json(request, 'INVALID_AI_RESPONSE', 502); }
    const subject = cleanText(result?.subject, 240), message = cleanText(result?.message, 6000), suggestedAction = cleanText(result?.suggested_action, 500); if (!subject || !message || !suggestedAction) return json(request, 'INVALID_AI_RESPONSE', 502);
    return json(request, 'OK', 200, { subject, message, suggested_action: suggestedAction });
  } catch (error) { console.error('ai-follow-up unexpected failure', error instanceof Error ? error.name : 'unknown'); return json(request, 'AI_UNAVAILABLE', 500); }
});
