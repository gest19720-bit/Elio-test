const { origin, sendJson, sendOAuthError } = require('./_shared');
module.exports = (req, res) => { try { const base = origin(req); return sendJson(res, 200, { resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ['business.read', 'business.write'], bearer_methods_supported: ['header'] }); } catch (error) { return sendOAuthError(res, error); } };
