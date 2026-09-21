import { AI_MODE } from './config.js';
import { supabase } from './supabase-client.js';

const clean = value => String(value || '').trim();

function localAnswer(question, snapshot) {
  const q = clean(question).toLowerCase();
  const marketing = snapshot.marketing;
  if (marketing && /(promot|advertis|best product|bundle|repeat customer|customer segment|marketing)/.test(q)) {
    const leader = marketing.productMetrics?.top?.[0];
    if (q.includes('bundle')) return { answer: 'Elio cannot identify frequently purchased-together products because order-line history is not connected yet.', next_steps: ['Connect an authorized order source', 'Record product-level orders'], sources: ['Product catalog'], mode: 'local' };
    if (q.includes('repeat')) return { answer: 'Repeat-customer rate is not available yet because Elio does not have purchase history in this workspace.', next_steps: ['Connect an authorized order source', 'Keep customer records current'], sources: ['Customers'], mode: 'local' };
    if (q.includes('customer') || q.includes('segment')) return { answer: `${marketing.customerMetrics?.total || 0} customers are in the available history. Elio needs order value and purchase history before it can identify best or highest-value customers responsibly.`, next_steps: ['Connect order history', 'Add last-contact dates'], sources: ['Customers'], mode: 'local' };
    return leader ? { answer: `${leader.name} is the strongest promotion candidate from the available catalog data, with ${leader.sales || 0} recorded unit${Number(leader.sales) === 1 ? '' : 's'} sold. This is a suggestion based on recorded units, not a prediction of future demand.`, next_steps: ['Check available stock', 'Review the product details', 'Compare the result after the next campaign'], sources: ['Products'], mode: 'local' } : { answer: 'There is not enough recorded product-sales data to recommend what to promote yet.', next_steps: ['Record product sales', 'Add products to the catalog'], sources: ['Products'], mode: 'local' };
  }
  const attention = snapshot.approvals.length + snapshot.overdue.length + snapshot.followUps.length;
  if (q.includes('attention') || q.includes('urgent') || q.includes('today')) {
    return {
      answer: attention ? `I found ${attention} item${attention === 1 ? '' : 's'} worth your attention: ${snapshot.approvals.length} approval${snapshot.approvals.length === 1 ? '' : 's'}, ${snapshot.followUps.length} customer follow-up${snapshot.followUps.length === 1 ? '' : 's'}, and ${snapshot.overdue.length} overdue task${snapshot.overdue.length === 1 ? '' : 's'}.` : 'Nothing needs your attention right now. You are all caught up.',
      next_steps: attention ? ['Review pending approvals', 'Check overdue tasks', 'Follow up with customers who have gone quiet'] : ['Keep working normally', 'Elio will surface new priorities here'],
      sources: ['Tasks', 'Approvals', 'Customers'], mode: 'local'
    };
  }
  if (q.includes('follow')) {
    const names = snapshot.followUps.slice(0, 5).map(customer => customer.name).join(', ');
    return { answer: names ? `${names} ${snapshot.followUps.length === 1 ? 'may need' : 'may need'} a follow-up based on their status or last contact date.` : 'I could not find any customers that currently need a follow-up.', next_steps: names ? ['Open Customers', 'Prepare a draft for review'] : ['Add last-contact dates to customer records'], sources: ['Customers'], mode: 'local' };
  }
  if (q.includes('activity') || q.includes('did elio') || q.includes('recent')) {
    const recent = snapshot.activities.slice(0, 3).map(item => item.action).join(' • ');
    return { answer: recent ? `Here is the recent activity I can see: ${recent}.` : 'There is no recent activity recorded yet.', next_steps: ['Open Activity to see the full timeline'], sources: ['Activity'], mode: 'local' };
  }
  if (q.includes('task')) {
    return { answer: `You have ${snapshot.tasks.filter(task => task.status !== 'Completed').length} active task${snapshot.tasks.filter(task => task.status !== 'Completed').length === 1 ? '' : 's'} and ${snapshot.overdue.length} overdue. I can help you decide what to do next, but I will not change data without your confirmation.`, next_steps: ['Review Tasks', 'Create a task manually'], sources: ['Tasks'], mode: 'local' };
  }
  return { answer: 'I can help you understand what is happening in your business. Ask about attention, customers needing follow-up, tasks, approvals, or recent activity.', next_steps: ['What needs my attention today?', 'Which customers need follow-ups?', 'Summarize my activity'], sources: ['Workspace data'], mode: 'local' };
}

export async function askAssistant({ question, snapshot }) {
  if (AI_MODE === 'mock') return localAnswer(question, snapshot);
  const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { question: clean(question) } });
  if (error) throw error;
  if (!data?.answer || !Array.isArray(data.next_steps) || !Array.isArray(data.sources)) throw new Error('The assistant response was incomplete.');
  return { ...data, mode: 'real' };
}
