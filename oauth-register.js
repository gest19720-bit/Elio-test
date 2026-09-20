const { secret, supabase, sendJson, sendOAuthError, validRedirectUri, cors, requestBody } = require('./oauth-shared');
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS').setHeader('Access-Control-Allow-Headers', 'content-type').end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'invalid_request', error_description: 'Use POST.' });
  try {
    const body = requestBody(req); const redirectUris = Array.isArray(body.redirect_uris) ? [...new Set(body.redirect_uris.map(String))] : [];
    if (!redirectUris.length || redirectUris.length > 20 || redirectUris.some(uri => !validRedirectUri(uri))) throw Object.assign(new Error(), { oauth: { error: 'invalid_client_metadata', error_description: 'One or more redirect_uris are invalid.', status: 400 } });
    const clientId = secret('elio_client');
    await supabase('/rest/v1/mcp_oauth_clients', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ client_id: clientId, client_name: String(body.client_name || 'MCP client').trim().slice(0, 120), redirect_uris: redirectUris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', metadata: { software_id: String(body.software_id || '').slice(0, 200), software_version: String(body.software_version || '').slice(0, 80) } }) });
    return sendJson(res, 201, { client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: redirectUris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, cors(req));
  } catch (error) { return sendOAuthError(res, error); }
};
