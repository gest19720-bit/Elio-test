import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(value => value.trim()).filter(Boolean);
const cleanText = (value: unknown, max: number) => String(value || '').trim().replace(/\u0000/g, '').slice(0, max);
const diagnosticsEnabled = Deno.env.get('ELIO_AI_DIAGNOSTICS') === 'true';
const diagnostic = (event: string, details: Record<string, unknown> = {}) => { if (diagnosticsEnabled) console.info(`[follow-up-agent] ${event}`, details); };
const corsHeaders = (request: Request) => { const origin = request.headers.get('Origin') || ''; return { 'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }; };
const json = (request: Request, code: string, status: number, body: Record<string, unknown> = {}) => new Response(JSON.stringify(status < 400 ? body : { error: { code } }), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
const isTransient = (status: number) => [408, 409, 500, 502, 503, 504].includes(status);
async function callOpenAi(apiKey: string, body: Record<string, unknown>) { for (let attempt = 0; attempt < 2; attempt += 1) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000); try { const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }); if (response.ok || !isTransient(response.status) || attempt === 1) return response; } catch (error) { if (attempt === 1) throw error; } finally { clearTimeout(timer); } await new Promise(resolve => setTimeout(resolve, 350)); } throw new Error('AI request failed'); }
function outputText(payload: any) { const part = Array.isArray(payload?.output) ? payload.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).find((item: any) => item?.type === 'output_text' && typeof item.text === 'string') : null; return cleanText(part?.text, 10000); }

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, 'METHOD_NOT_ALLOWED', 405);
  try {
    const input = await request.json().catch(() => null); const rawInstruction = typeof input?.instruction === 'string' ? input.instruction : typeof input?.context === 'string' ? input.context : ''; if (typeof (input?.customerId || input?.customer_id) !== 'string' || !rawInstruction) return json(request, 'INVALID_INPUT', 400); const rawCustomerId = String(input.customerId || input.customer_id).trim(); const instruction = rawInstruction.trim(); const customerId = cleanText(rawCustomerId, 80); const context = cleanText(instruction, 3000); const tone = ['Professional', 'Friendly', 'Casual', 'Formal'].includes(input?.tone) ? input.tone : 'Friendly'; const purpose = ['Check in', 'Follow up on inquiry', 'Re-engage customer', 'After purchase', 'Payment reminder', 'Custom'].includes(input?.purpose) ? input.purpose : 'Check in'; const length = ['Short', 'Medium'].includes(input?.length) ? input.length : 'Short';
    if (!customerId || !context || rawCustomerId.length > 80 || instruction.length > 3000) return json(request, 'INVALID_INPUT', 400);
    diagnostic('FOLLOW_UP_GENERATION_STARTED', { hasInstruction: true, instructionLength: instruction.length, purpose, tone, length });
    if (!request.headers.get('Authorization')) return json(request, 'AUTHENTICATION_REQUIRED', 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization')! } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) return json(request, 'AUTHENTICATION_REQUIRED', 401);
    const { data: business, error: businessError } = await supabase.from('businesses').select('id,name,industry,communication_style').eq('owner_id', user.id).maybeSingle();
    if (businessError) { console.error('ai-follow-up business context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); } if (!business) return json(request, 'ONBOARDING_REQUIRED', 400);
    const { data: customer, error: customerError } = await supabase.from('customers').select('id,name,company,status,last_contact_at,notes').eq('business_id', business.id).eq('id', customerId).maybeSingle();
    if (customerError) { console.error('ai-follow-up customer context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); } if (!customer) return json(request, 'CUSTOMER_NOT_FOUND', 404);
    diagnostic('CUSTOMER_CONTEXT_RETRIEVED', { hasNotes: Boolean(customer.notes), hasCompany: Boolean(customer.company), hasStatus: Boolean(customer.status) });
    const { data: relatedTasks, error: tasksError } = await supabase.from('tasks').select('title,status,priority,due_date').eq('business_id', business.id).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(8);
    if (tasksError) { console.error('ai-follow-up task context failed'); return json(request, 'CONTEXT_UNAVAILABLE', 500); }
    const [{ data: relatedActivities, error: activitiesError }, { data: previousFollowUps, error: followUpsError }] = await Promise.all([
      supabase.from('activities').select('actor,action,entity_type,metadata,created_at').eq('business_id', business.id).eq('entity_id', customerId).order('created_at', { ascending: false }).limit(10),
      supabase.from('follow_ups').select('subject,message,suggested_action,status,created_at').eq('business_id', business.id).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(5)
    ]);
    if (activitiesError) console.error('ai-follow-up activity context unavailable');
    if (followUpsError) console.error('ai-follow-up previous draft context unavailable');
    const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_followup_quota', { p_limit: 20 }); if (quotaError) { console.error('ai-follow-up quota unavailable'); return json(request, 'AI_UNAVAILABLE', 503); } if (!allowed) return json(request, 'RATE_LIMITED', 429);
    const apiKey = Deno.env.get('OPENAI_API_KEY'); if (!apiKey) return json(request, 'AI_NOT_CONFIGURED', 503);
    const instructions = 'You are Elio’s Follow-Up Drafting Agent. Your only task is to write one concise, natural, customer-facing follow-up message. The owner_instruction is the controlling writing brief: follow it closely and make it accomplish the requested purpose. Use customer context only when relevant. Never invent facts, prices, dates, orders, conversations, promises, or availability. Never mention being an AI, this prompt, or your reasoning. Do not provide a subject line, alternatives, or explanations. Never say anything has been sent. Use the customer’s name naturally when appropriate. Return only the message inside the required JSON draft field.';
    const data = { business: { name: business.name, industry: business.industry, communication_style: business.communication_style }, customer, related_tasks: relatedTasks || [], previous_interactions: relatedActivities || [], previous_follow_ups: previousFollowUps || [], products_discussed: [], purchase_history: [], owner_instruction: context, requested_purpose: purpose, requested_tone: tone, requested_length: length };
    const provider = (Deno.env.get('AI_PROVIDER') || 'openai').toLowerCase(); if (provider !== 'openai') return json(request, 'AI_NOT_CONFIGURED', 503);
    const model = Deno.env.get('FOLLOW_UP_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini';
    diagnostic('AI_REQUEST_STARTED', { provider, model });
    const response = await callOpenAi(apiKey, { model, store: false, max_output_tokens: 500, input: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(data) }], text: { format: { type: 'json_schema', name: 'elio_follow_up_draft', strict: true, schema: { type: 'object', properties: { draft: { type: 'string' } }, required: ['draft'], additionalProperties: false } } } });
    if (!response.ok) { console.error(`ai-follow-up upstream status ${response.status}`); return json(request, response.status === 429 ? 'RATE_LIMITED' : response.status === 504 ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', response.status === 429 ? 429 : 502); }
    diagnostic('AI_REQUEST_SUCCEEDED', { status: response.status });
    let result: any; try { result = JSON.parse(outputText(await response.json())); } catch { return json(request, 'INVALID_AI_RESPONSE', 502); }
    const draft = cleanText(result?.draft, 6000); if (!draft) return json(request, 'INVALID_AI_RESPONSE', 502);
    diagnostic('AI_RESPONSE_VALIDATED', { draftLength: draft.length });
    diagnostic('DRAFT_RETURNED');
    return json(request, 'OK', 200, { draft });
  } catch (error) { console.error('ai-follow-up unexpected failure', error instanceof Error ? error.name : 'unknown'); return json(request, 'AI_UNAVAILABLE', 500); }
});
