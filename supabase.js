/* Public Supabase configuration for the Elio waitlist. Never use service_role here. */
const ELIO_SUPABASE_URL = "https://rdwiokoapwzybgndwodg.supabase.co";
const ELIO_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkd2lva29hcHd6eWJnbmR3b2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2OTA4MzAsImV4cCI6MjEwNDI2NjgzMH0.WfG6oxN5Q7FotzWhgETenrDeANpKnjUTw4MrRYgVVfA";

// A standalone page can provide this same public config before this file loads.
// Never put a service_role key in browser code.
const ELIO_CONFIG = window.__ELIO_SUPABASE_CONFIG || {
  url: ELIO_SUPABASE_URL,
  anonKey: ELIO_SUPABASE_ANON_KEY,
};

function getSupabaseClient() {
  if (!window.supabase || !ELIO_CONFIG.url || !ELIO_CONFIG.anonKey ||
      ELIO_CONFIG.url.includes("YOUR_") || ELIO_CONFIG.anonKey.includes("YOUR_")) {
    return null;
  }
  if (!window.__elioSupabaseClient) {
    window.__elioSupabaseClient = window.supabase.createClient(
      ELIO_CONFIG.url,
      ELIO_CONFIG.anonKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return window.__elioSupabaseClient;
}

// Compatibility name used by the inline waitlist handler.
window.getElioClient = getSupabaseClient;
