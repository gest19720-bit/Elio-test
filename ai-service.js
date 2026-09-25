import { invokeAi, requireText, ElioAiError } from './ai-request.js';

export async function generateFollowUp(input) {
  const customerId = requireText(input?.customerId, 80, 'customer');
  const context = requireText(input?.context, 3000, 'follow-up context');
  const tone = ['Professional', 'Friendly', 'Casual', 'Formal'].includes(input?.tone) ? input.tone : 'Friendly';
  return invokeAi('ai-follow-up', { customerId, context, tone }, data => {
    const subject = String(data?.subject || '').trim();
    const message = String(data?.message || '').trim();
    const suggestedAction = String(data?.suggested_action || '').trim();
    if (!subject || !message || !suggestedAction || subject.length > 240 || message.length > 6000 || suggestedAction.length > 500) throw new ElioAiError('INVALID_AI_RESPONSE');
    return { subject, message, suggested_action: suggestedAction, mode: 'real' };
  });
}
