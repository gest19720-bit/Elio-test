const { authenticatedUser, supabase, sendJson, sendOAuthError } = require('./_shared');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'invalid_request', error_description: 'Use GET.' });
  try {
    await authenticatedUser(req); const id = String(req.query.request_id || '');
    const rows = await supabase(`/rest/v1/mcp_oauth_authorization_requests?id=eq.${encodeURIComponent(id)}&select=client_name,scopes&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
    if (!rows?.[0]) return sendJson(res, 404, { error: 'invalid_request', error_description: 'Authorization request not found.' });
    return sendJson(res, 200, rows[0]);
  } catch (error) { return sendOAuthError(res, error); }
};
