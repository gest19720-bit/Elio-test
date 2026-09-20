const crypto = require('node:crypto');

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTHORIZATION_REQUEST_TTL_SECONDS = 10 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;

function origin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host || /[\s/]/.test(host)) throw oauthError('invalid_request', 'A valid host is required.');
  const localHost = host.split(':')[0].replace(/^\[/, '').replace(/\]$/, '')
  const forwarded = String(req.headers['x-forwarded-proto'] || (['localhost', '127.0.0.1', '::1'].includes(localHost) ? 'http' : 'https')).split(',')[0].trim();
  return `${forwarded === 'http' ? 'http' : 'https'}://${host}`;
}

function oauthError(error, description, status = 400) {
  const value = new Error(description);
  value.oauth = { error, error_description: description, status };
  return value;
}

function sendJson(res, status, body, extra = {}) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
  res.json(body);
}

function sendOAuthError(res, error) {
  const detail = error?.oauth || { error: 'server_error', error_description: 'The authorization service could not complete the request.', status: 500 };
  console.error('[elio-oauth]', detail.error, detail.error_description);
  return sendJson(res, detail.status, { error: detail.error, error_description: detail.error_description });
}

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function secret(prefix) { return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`; }
function nowPlus(seconds) { return new Date(Date.now() + seconds * 1000).toISOString(); }
function parseScope(value) { return [...new Set(String(value || '').split(/\s+/).map(item => item.trim()).filter(Boolean))]; }
function requestBody(req) {
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  return req.body && typeof req.body === 'object' ? req.body : {};
}
function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function supabaseUrl() { return String(process.env.SUPABASE_URL || '').replace(/\/$/, ''); }
function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function requireSupabase() {
  if (!supabaseUrl() || !serviceKey()) throw oauthError('server_error', 'OAuth storage is not configured.', 500);
}
async function supabase(path, options = {}) {
  requireSupabase();
  const response = await fetch(`${supabaseUrl()}${path}`, {
    ...options,
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text(); let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) { console.error('[elio-oauth] supabase', response.status, typeof body === 'string' ? body.slice(0, 200) : body?.message); throw oauthError('server_error', 'OAuth storage request failed.', 500); }
  return body;
}
async function authenticatedUser(req) {
  const authorization = String(req.headers.authorization || '');
  if (!/^Bearer\s+.+/i.test(authorization)) throw oauthError('login_required', 'Sign in to Elio before approving this connection.', 401);
  requireSupabase();
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: serviceKey(), Authorization: authorization } });
  if (!response.ok) throw oauthError('login_required', 'Your Elio session has expired. Sign in again.', 401);
  const user = await response.json();
  if (!user?.id) throw oauthError('login_required', 'Your Elio session could not be verified.', 401);
  return user;
}
function validRedirectUri(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); } catch { return false; }
}
function safeMetadataUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return !['localhost', '127.0.0.1', '::1'].includes(host) && !host.endsWith('.local') && !/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  } catch { return false; }
}
async function resolveClient(clientId) {
  if (!clientId) throw oauthError('invalid_request', 'client_id is required.');
  if (safeMetadataUrl(clientId)) {
    let metadata;
    try { const response = await fetch(clientId, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) }); metadata = await response.json(); if (!response.ok) throw new Error('status'); }
    catch { throw oauthError('invalid_client', 'The client metadata document could not be retrieved.'); }
    if (metadata.client_id !== clientId || !Array.isArray(metadata.redirect_uris)) throw oauthError('invalid_client', 'The client metadata document is invalid.');
    return { client_id: clientId, redirect_uris: metadata.redirect_uris, client_name: String(metadata.client_name || new URL(clientId).hostname).slice(0, 120), token_endpoint_auth_method: metadata.token_endpoint_auth_method || 'none', metadata_document: true };
  }
  const rows = await supabase(`/rest/v1/mcp_oauth_clients?client_id=eq.${encodeURIComponent(clientId)}&select=client_id,client_name,redirect_uris,token_endpoint_auth_method,revoked_at`);
  const client = rows?.[0];
  if (!client || client.revoked_at) throw oauthError('invalid_client', 'The OAuth client is not registered.');
  return client;
}
function validateRedirect(client, redirectUri) {
  if (!redirectUri || !validRedirectUri(redirectUri) || !(client.redirect_uris || []).includes(redirectUri)) throw oauthError('invalid_request', 'redirect_uri is not registered for this client.');
}
function requirePkce(method, challenge) {
  if (!challenge || method !== 'S256' || !/^[A-Za-z0-9._~-]{43,128}$/.test(challenge)) throw oauthError('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
}
function cors(req) {
  const requested = String(req.headers.origin || '');
  return requested && requested === origin(req) ? { 'Access-Control-Allow-Origin': requested, Vary: 'Origin' } : {};
}

module.exports = { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS, AUTHORIZATION_REQUEST_TTL_SECONDS, AUTHORIZATION_CODE_TTL_SECONDS, origin, oauthError, sendJson, sendOAuthError, hash, secret, nowPlus, parseScope, requestBody, timingSafeEqual, supabase, authenticatedUser, validRedirectUri, resolveClient, validateRedirect, requirePkce, cors };
