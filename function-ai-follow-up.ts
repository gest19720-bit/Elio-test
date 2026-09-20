import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(value => value.trim()).filter(Boolean);
const requestOrigin = (request: Request) => request.headers.get('Origin') || '';
const corsHeaders = (request: Request) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(requestOrigin(request)) ? requestOrigin(request) : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
});
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });
const safeText = (value: unknown, max: number) => String(value || '').trim().slice(0, max);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json(request, { error: 'Authentication required.' }, 401);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json(request, { error: 'Authentication required.' }, 401);

    const { data: allowed, error: quotaError } = await supabase.rpc('consume_ai_followup_quota', { p_limit: 20 });
    if (quotaError) return json(request, { error: 'AI usage limits are not configured yet.' }, 503);
    if (!allowed) return json(request, { error: 'You have reached today’s AI follow-up limit. Please try again tomorrow.' }, 429);

    const input = await request.json();
    const customerId = safeText(input.customer_id || input.customerId, 80);
    const context = safeText(input.context, 3000);
    const tone = ['Professional', 'Friendly', 'Casual', 'Formal'].includes(input.tone) ? input.tone : 'Friendly';
    if (!customerId || !context) return json(request, { error: 'A customer and follow-up context are required.' }, 400);

    const { data: business, error: businessError } = await supabase.from('businesses').select('id,name,industry,size,communication_style,automation_level,help_areas').eq('owner_id', user.id).maybeSingle();
    if (businessError) return json(request, { error: 'Elio could not load your business context.' }, 500);
    if (!business) return json(request, { error: 'Complete onboarding before using Elio AI.' }, 400);

    const [customerResult, tasksResult, activityResult] = await Promise.all([
      supabase.from('customers').select('id,name,company,status,last_contact_at,notes').eq('business_id', business.id).eq('id', customerId).maybeSingle(),
      supabase.from('tasks').select('title,status,priority,due_date').eq('business_id', business.id).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(8),
      supabase.from('activities').select('actor,action,entity_type,created_at').eq('business_id', business.id).order('created_at', { ascending: false }).limit(12)
    ]);
    if (customerResult.error || tasksResult.error || activityResult.error) return json(request, { error: 'Elio could not load the business context.' }, 500);
    if (!customerResult.data) return json(request, { error: 'That customer was not found in your workspace.' }, 404);

    const customer = customerResult.data;
    const businessContext = {
      name: business.name, industry: business.industry, size: business.size,
      communication_style: business.communication_style, automation_level: business.automation_level,
      help_areas: business.help_areas
    };
    const customerContext = {
      name: customer.name, company: customer.company, status: customer.status,
      last_contact_at: customer.last_contact_at, notes: customer.notes,
      related_tasks: tasksResult.data || []
    };
    const recentActivity = (activityResult.data || []).map(item => ({ actor: item.actor, action: item.action, entity_type: item.entity_type, created_at: item.created_at }));
    const prompt = `You are Elio, an AI Back-Office Agent helping a small business. Prepare a concise customer follow-up for human review. Never send anything, invent facts, or make financial or legal promises.

Business context:
${JSON.stringify(businessContext)}

Customer context:
${JSON.stringify(customerContext)}

Recent business activity:
${JSON.stringify(recentActivity)}

Requested tone: ${tone}
Follow-up context from the owner:
${context}

Return only a JSON object with subject, message, and suggested_action. The message must be respectful, useful, concise, and ready for the owner to edit before approval.`;

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json(request, { error: 'AI service is not configured yet.' }, 503);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-5-mini', input: prompt, max_output_tokens: 500, store: false,
        text: { format: { type: 'json_schema', name: 'elio_follow_up', strict: true, schema: {
          type: 'object', properties: { subject: { type: 'string' }, message: { type: 'string' }, suggested_action: { type: 'string' } },
          required: ['subject', 'message', 'suggested_action'], additionalProperties: false
        } } }
      })
    });
    if (!response.ok) return json(request, { error: 'The AI service could not prepare that message.' }, response.status === 429 ? 429 : 502);
    const payload = await response.json();
    if (!payload.output_text) return json(request, { error: 'The AI service returned an empty response.' }, 502);
    const result = JSON.parse(payload.output_text);
    if (!['subject', 'message', 'suggested_action'].every(key => typeof result[key] === 'string' && result[key].trim())) return json(request, { error: 'The AI response was incomplete.' }, 502);
    return json(request, result);
  } catch (_error) {
    return json(request, { error: 'Elio could not prepare that follow-up.' }, 500);
  }
});
