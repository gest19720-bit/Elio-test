import { generateFollowUpDraft } from './follow-up-drafting-agent.js';

// Backward-compatible wrapper for existing callers. New follow-up UI code
// should import the dedicated Follow-Up Drafting Agent directly.
export { generateFollowUpDraft };
export function generateFollowUp(input) {
  return generateFollowUpDraft({ ...input, instruction: input?.instruction || input?.context });
}
