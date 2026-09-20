import { AI_MODE } from './config.js';
import { supabase } from './supabase-client.js';

function mockFollowUp({ customer, context, tone }) {
  const name = customer?.name || 'there';
  const topic = context || 'our recent conversation';
  const company = customer?.company ? ` — ${customer.company}` : '';
  const templates = {
    Professional: { greeting: `Hello ${name}`, subject: `Professional follow-up${company}`, body: `I am following up regarding ${topic}. Please let me know where things stand and whether there is anything else you need from us.`, signoff: 'Kind regards,' },
    Friendly: { greeting: `Hi ${name}`, subject: `Checking in${company}`, body: `I hope you’re doing well. I wanted to check in about ${topic} and see how things are coming along. I’d be happy to help with the next step.`, signoff: 'Best,' },
    Casual: { greeting: `Hey ${name}`, subject: `Quick check-in${company}`, body: `Just checking in on ${topic}. Let me know what you think when you get a chance, and we can take it from there.`, signoff: 'Thanks,' },
    Formal: { greeting: `Dear ${name}`, subject: `Follow-up regarding ${customer?.company || 'our conversation'}`, body: `I am writing to follow up regarding ${topic}. I would appreciate an update at your convenience and remain available should you require any further information.`, signoff: 'Yours sincerely,' }
  };
  const selected = templates[tone] || templates.Friendly;
  return { subject: selected.subject, message: `${selected.greeting},\n\n${selected.body}\n\n${selected.signoff}`, suggested_action: 'Review the message and approve it when ready.', mode: 'mock' };
}

export async function generateFollowUp(input) {
  if (AI_MODE === 'mock') return mockFollowUp(input);
  const { customer, ...secureInput } = input;
  const { data, error } = await supabase.functions.invoke('ai-follow-up', { body: secureInput });
  if (error) throw error;
  if (!data?.subject || !data?.message || !data?.suggested_action) throw new Error('The AI response was incomplete.');
  return { ...data, mode: 'real' };
}
