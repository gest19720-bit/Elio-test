const { AUTHORIZATION_REQUEST_TTL_SECONDS, AUTHORIZATION_CODE_TTL_SECONDS, origin, oauthError, sendJson, sendOAuthError, secret, hash, nowPlus, parseScope, requestBody, supabase, authenticatedUser, resolveClient, validateRedirect, requirePkce, cors } = require('./oauth-shared');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const client = await resolveClient(String(req.query.client_id || ''));
      const redirectUri = String(req.query.redirect_uri || ''); validateRedirect(client, redirectUri);
      if (String(req.query.response_type || '') !== 'code') throw oauthError('unsupported_response_type', 'Only response_type=code is supported.');
      const scopes = parseScope(req.query.scope || 'business.read'); if (!scopes.length || scopes.some(scope => !['business.read', 'business.write'].includes(scope))) throw oauthError('invalid_scope', 'Requested scope is not supported.');
      const challenge = String(req.query.code_challenge || ''); const method = String(req.query.code_challenge_method || ''); requirePkce(method, challenge);
      const requestId = secret('elio_authorize');
      await supabase('/rest/v1/mcp_oauth_authorization_requests', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: requestId, client_id: client.client_id, client_name: client.client_name, redirect_uri: redirectUri, state: String(req.query.state || '').slice(0, 2000) || null, scopes, code_challenge: challenge, code_challenge_method: method, expires_at: nowPlus(AUTHORIZATION_REQUEST_TTL_SECONDS) }) });
      return res.redirect(302, `${origin(req)}/oauth-consent.html?request_id=${encodeURIComponent(requestId)}`);
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'invalid_request', error_description: 'Use GET or POST.' });
    const user = await authenticatedUser(req); const body = requestBody(req); const requestId = String(body.request_id || '');
    const requests = await supabase(`/rest/v1/mcp_oauth_authorization_requests?id=eq.${encodeURIComponent(requestId)}&select=*&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
    const pending = requests?.[0]; if (!pending) throw oauthError('invalid_request', 'This authorization request is missing, expired, or was already used.');
    if (body.approve !== true) { await supabase(`/rest/v1/mcp_oauth_authorization_requests?id=eq.${encodeURIComponent(requestId)}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) }); return sendJson(res, 200, { redirect_uri: `${pending.redirect_uri}${pending.redirect_uri.includes('?') ? '&' : '?'}error=access_denied${pending.state ? `&state=${encodeURIComponent(pending.state)}` : ''}` }, cors(req)); }
    const grantedScopes = parseScope(body.scope || pending.scopes.join(' '));
    if (!grantedScopes.length || grantedScopes.some(scope => !pending.scopes.includes(scope))) throw oauthError('invalid_scope', 'Permissions may only be reduced from the scopes requested by the client.');
    const code = secret('elio_code');
    await supabase('/rest/v1/mcp_oauth_authorization_codes', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ code_hash: hash(code), client_id: pending.client_id, user_id: user.id, redirect_uri: pending.redirect_uri, scopes: grantedScopes, code_challenge: pending.code_challenge, expires_at: nowPlus(AUTHORIZATION_CODE_TTL_SECONDS) }) });
    await supabase(`/rest/v1/mcp_oauth_authorization_requests?id=eq.${encodeURIComponent(requestId)}`, { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString(), user_id: user.id }) });
    const redirect = new URL(pending.redirect_uri); redirect.searchParams.set('code', code); if (pending.state) redirect.searchParams.set('state', pending.state);
    return sendJson(res, 200, { redirect_uri: redirect.toString() }, cors(req));
  } catch (error) { return sendOAuthError(res, error); }
};
