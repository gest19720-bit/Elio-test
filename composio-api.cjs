const json = (res, body, status = 200) => res.status(status).json(body);
const workspaceToolkits = ['gmail', 'googlecalendar', 'googlesheets'];

function hasServerValue(name) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  return Boolean(value) && !['undefined', 'null', 'replace_me', 'your_value_here'].includes(value);
}

function missingServerConfig() {
  return ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'COMPOSIO_API_KEY'].filter(name => !hasServerValue(name));
}

function workspaceToolkit(value) {
  const toolkit = String(value || '').trim().toLowerCase();
  return workspaceToolkits.includes(toolkit) ? toolkit : null;
}

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error('Composio storage is not configured.');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${String(process.env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/${path}`, { ...options, headers: { ...serviceHeaders(), ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase storage request failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

async function getUser(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return { user: null, error: 'A signed-in Elio session is required.' };
  const response = await fetch(`${String(process.env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY || '', Authorization: authorization } });
  if (!response.ok) return { user: null, error: 'Your Elio sign-in could not be verified. Sign out and sign in again.' };
  return { user: await response.json(), error: null };
}

async function loadSession(Composio, userId) {
  const rows = await supabaseRequest(`composio_sessions?user_id=eq.${encodeURIComponent(userId)}&select=session_id&limit=1`);
  const composio = new Composio();
  if (rows?.[0]?.session_id) {
    const session = await composio.sessions.use(rows[0].session_id);
    await session.update({ toolkits: workspaceToolkits, manageConnections: true });
    return session;
  }
  const session = await composio.sessions.create(userId, {
    toolkits: workspaceToolkits,
    manageConnections: true
  });
  await supabaseRequest('composio_sessions', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: userId, session_id: session.sessionId }) });
  return session;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, { error: 'Use POST.' }, 405);
  try {
    const missing = missingServerConfig();
    if (missing.length) return json(res, { error: `Elio server configuration is missing: ${missing.join(', ')}. Add it to the server environment and redeploy.` }, 503);
    const auth = await getUser(req);
    if (!auth.user?.id) return json(res, { error: auth.error }, 401);
    const { Composio } = await import('@composio/core');
    const session = await loadSession(Composio, auth.user.id);
    const input = req.body || {};
    if (input.action === 'authorize') {
      const toolkit = workspaceToolkit(input.toolkit);
      if (!toolkit) return json(res, { error: 'Choose a supported Google Workspace app.' }, 400);
      const request = await session.authorize(toolkit);
      return json(res, { sessionId: session.sessionId, redirectUrl: request.redirectUrl });
    }
    if (input.action === 'status') {
      const result = await session.toolkits();
      const items = Array.isArray(result?.items) ? result.items : [];
      const toolkits = Object.fromEntries(workspaceToolkits.map(slug => [slug, items.find(item => String(item.slug || '').toLowerCase() === slug) || null]));
      return json(res, { sessionId: session.sessionId, toolkits });
    }
    if (input.action === 'search') {
      const toolkit = workspaceToolkit(input.toolkit);
      if (!toolkit) return json(res, { error: 'Choose a supported Google Workspace app.' }, 400);
      return json(res, { sessionId: session.sessionId, result: await session.search({ query: String(input.query || 'show read-only tools'), toolkits: [toolkit] }) });
    }
    return json(res, { error: 'Unknown action.' }, 400);
  } catch (error) { console.error('[elio-composio]', error instanceof Error ? error.message : 'unknown'); return json(res, { error: error instanceof Error ? error.message : 'Composio request failed.' }, 502); }
};
