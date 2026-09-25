import { invokeAi, requireText, ElioAiError } from './ai-request.js';

export async function askAssistant({ question }) {
  const safeQuestion = requireText(question, 1200, 'question');
  return invokeAi('ai-assistant', { question: safeQuestion }, data => {
    const answer = String(data?.answer || '').trim();
    const nextSteps = Array.isArray(data?.next_steps) ? data.next_steps.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4) : [];
    const sources = Array.isArray(data?.sources) ? data.sources.map(item => String(item || '').trim()).filter(Boolean).slice(0, 5) : [];
    if (!answer || answer.length > 4000) throw new ElioAiError('INVALID_AI_RESPONSE');
    return { answer, next_steps: nextSteps, sources, mode: 'real' };
  });
}
