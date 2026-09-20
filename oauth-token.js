const { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, oauthError, sendJson, sendOAuthError, secret, hash, nowPlus, requestBody, timingSafeEqual, supabase, resolveClient, validateRedirect, cors } = require('./oauth-shared');
const verifierChallenge = verifier => require('node:crypto').createHash('sha256').update(verifier).digest('base64url');
async function issueTokens({ clientId, userId, scopes, grantId }) {
  const access = secret('elio_access'); const refresh = secret('elio_refresh'); const issued = new Date().toISOString();
  await supabase('/rest/v1/mcp_oauth_access_tokens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token_hash: hash(access), client_id: clientId, user_id: userId, grant_id: grantId || null, scopes, issued_at: issued, expires_at: nowPlus(ACCESS_TOKEN_TTL_SECONDS) }) });
  await supabase('/rest/v1/mcp_oauth_refresh_tokens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token_hash: hash(refresh), client_id: clientId, user_id: userId, grant_id: grantId || null, scopes, expires_at: nowPlus(REFRESH_TOKEN_TTL_SECONDS) }) });
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refresh, scope: scopes.join(' ') };
}
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS').setHeader('Access-Control-Allow-Headers', 'content-type, authorization').end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'invalid_request', error_description: 'Use POST.' });
  try {
    const body = requestBody(req); const grantType = String(body.grant_type || ''); const clientId = String(body.client_id || ''); const client = await resolveClient(clientId);
    if (client.token_endpoint_auth_method && client.token_endpoint_auth_method !== 'none') throw oauthError('invalid_client', 'This public authorization server supports public MCP clients only.', 401);
    if (grantType === 'authorization_code') {
      const code = String(body.code || ''); const redirectUri = String(body.redirect_uri || ''); validateRedirect(client, redirectUri);
      const rows = await supabase(`/rest/v1/mcp_oauth_authorization_codes?code_hash=eq.${encodeURIComponent(hash(code))}&select=*&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
      const record = rows?.[0]; if (!record || record.client_id !== clientId || record.redirect_uri !== redirectUri) throw oauthError('invalid_grant', 'The authorization code is invalid, expired, or was issued to another client.');
      const verifier = String(body.code_verifier || ''); if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !timingSafeEqual(verifierChallenge(verifier), record.code_challenge)) throw oauthError('invalid_grant', 'PKCE verification failed.');
      await supabase(`/rest/v1/mcp_oauth_authorization_codes?code_hash=eq.${encodeURIComponent(hash(code))}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) });
      const grant = await supabase('/rest/v1/mcp_oauth_grants?on_conflict=client_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ client_id: clientId, user_id: record.user_id, scopes: record.scopes, approved_at: new Date().toISOString(), revoked_at: null }) });
      return sendJson(res, 200, await issueTokens({ clientId, userId: record.user_id, scopes: record.scopes, grantId: grant?.[0]?.id }), cors(req));
    }
    if (grantType === 'refresh_token') {
      const refresh = String(body.refresh_token || ''); const rows = await supabase(`/rest/v1/mcp_oauth_refresh_tokens?token_hash=eq.${encodeURIComponent(hash(refresh))}&select=*&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`); const record = rows?.[0];
      if (!record || record.client_id !== clientId) throw oauthError('invalid_grant', 'The refresh token is invalid, expired, or revoked.');
      await supabase(`/rest/v1/mcp_oauth_refresh_tokens?token_hash=eq.${encodeURIComponent(hash(refresh))}`, { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString(), replaced_at: new Date().toISOString() }) });
      return sendJson(res, 200, await issueTokens({ clientId, userId: record.user_id, scopes: record.scopes, grantId: record.grant_id }), cors(req));
    }
    throw oauthError('unsupported_grant_type', 'Supported grants are authorization_code and refresh_token.');
  } catch (error) { return sendOAuthError(res, error); }
};
