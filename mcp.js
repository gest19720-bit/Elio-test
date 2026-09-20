// Stable public MCP resource endpoint. OAuth discovery is served from the same origin.
module.exports = async (req, res) => {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return res.status(503).json({ error: { code: 'SERVER_MISCONFIGURED', message: 'MCP routing is not configured.' } });
  if (req.method === 'OPTIONS') return res.status(204).setHeader('Access-Control-Allow-Origin', req.headers.origin || '*').setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-session-id').setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS').setHeader('Vary', 'Origin').end();
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for MCP JSON-RPC requests.' } });
  try {
    const upstream = await fetch(`${base}/functions/v1/mcp-server`, { method: 'POST', headers: { Authorization: String(req.headers.authorization || ''), 'Content-Type': 'application/json', Accept: String(req.headers.accept || 'application/json'), 'Mcp-Session-Id': String(req.headers['mcp-session-id'] || '') }, body: JSON.stringify(req.body || {}) });
    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store').setHeader('Access-Control-Allow-Origin', req.headers.origin || '*').setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-session-id').setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id').setHeader('Vary', 'Origin');
    const session = upstream.headers.get('mcp-session-id'); if (session) res.setHeader('Mcp-Session-Id', session);
    return res.send(text);
  } catch (error) { console.error('[elio-mcp] upstream failure', error instanceof Error ? error.message : 'unknown'); return res.status(502).json({ error: { code: 'MCP_UPSTREAM_UNAVAILABLE', message: 'Elio MCP is temporarily unavailable.' } }); }
};
