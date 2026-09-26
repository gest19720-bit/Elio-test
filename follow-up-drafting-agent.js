import { invokeAi, requireText, ElioAiError } from './ai-request.js';

const PURPOSES = ['Check in', 'Follow up on inquiry', 'Re-engage customer', 'After purchase', 'Payment reminder', 'Custom'];
const TONES = ['Professional', 'Friendly', 'Casual', 'Formal'];
const LENGTHS = ['Short', 'Medium'];

/**
 * The only client-side responsibility of the Follow-Up Drafting Agent is to
 * turn an owner's instruction plus a selected customer ID into one editable
 * customer-facing draft. It never sends, saves, or mutates customer data.
 */
export async function generateFollowUpDraft(input) {
  const customerId = requireText(input?.customerId, 80, 'customer');
  const instruction = requireText(input?.instruction, 3000, 'follow-up instructions');
  const purpose = PURPOSES.includes(input?.purpose) ? input.purpose : 'Check in';
  const tone = TONES.includes(input?.tone) ? input.tone : 'Friendly';
  const length = LENGTHS.includes(input?.length) ? input.length : 'Short';

  return invokeAi('ai-follow-up', { customerId, instruction, purpose, tone, length }, data => {
    const draft = String(data?.draft || '').trim();
    if (!draft || draft.length > 6000) throw new ElioAiError('INVALID_AI_RESPONSE');
    return { draft, mode: 'real' };
  });
}
