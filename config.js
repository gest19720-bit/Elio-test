// Browser-safe configuration only. The Supabase anon key is protected by RLS.
// Never place OPENAI_API_KEY or a Supabase service_role key here.
export const SUPABASE_URL = window.ELIO_SUPABASE_URL || 'https://rdwiokoapwzybgndwodg.supabase.co';
export const SUPABASE_ANON_KEY = window.ELIO_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkd2lva29hcHd6eWJnbmR3b2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2OTA4MzAsImV4cCI6MjEwNDI2NjgzMH0.WfG6oxN5Q7FotzWhgETenrDeANpKnjUTw4MrRYgVVfA';
