// Browser-safe configuration only. The Supabase anon key is protected by RLS.
// Never place OPENAI_API_KEY or a Supabase service_role key here.
export const SUPABASE_URL = window.ELIO_SUPABASE_URL || 'https://rdwiokoapwzybgndwodg.supabase.co';
export const SUPABASE_ANON_KEY = window.ELIO_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkd2lva29hcHd6eWJnbmR3b2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2OTA4MzAsImV4cCI6MjEwNDI2NjgzMH0.WfG6oxN5Q7FotzWhgETenrDeANpKnjUTw4MrRYgVVfA';
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// Local validation can exercise the complete follow-up -> approval flow without an Edge Function.
// Deployed hosts remain real-only unless an explicit mode is supplied.
const requestedMode = new URLSearchParams(window.location.search).get('ai');
export const AI_MODE = ['mock', 'real'].includes(window.ELIO_AI_MODE) ? window.ELIO_AI_MODE : ['mock', 'real'].includes(requestedMode) ? requestedMode : (isLocalhost ? 'mock' : 'real');
window.ELIO_AI_MODE = AI_MODE;
