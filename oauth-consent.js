import { supabase } from './supabase-client.js';

const requestId = new URLSearchParams(location.search).get('request_id');
const status = document.querySelector('#oauth-status'); const form = document.querySelector('#oauth-consent'); const scopes = document.querySelector('#oauth-scopes'); const message = document.querySelector('#oauth-message');
if (!requestId) { status.textContent = 'This authorization request is invalid.'; }
else {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { const returnTo = `${location.pathname}${location.search}`; location.replace(`login.html?return_to=${encodeURIComponent(returnTo)}`); }
  else {
    const details = await fetch(`/api/oauth/request-details?request_id=${encodeURIComponent(requestId)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!details.ok) { status.textContent = 'This authorization request has expired. Return to your MCP client and try again.'; }
    else { const data = await details.json(); status.textContent = `${data.client_name} is requesting access to your Elio business.`; scopes.innerHTML = data.scopes.map(scope => `<label class="mcp-permission is-granted"><input type="checkbox" name="scope" value="${scope}" checked><span class="mcp-permission-text"><strong>${scope}</strong></span></label>`).join(''); form.hidden = false; }
  }
}
async function finish(approve) { const { data: { session } } = await supabase.auth.getSession(); const selected = [...form.querySelectorAll('input[name="scope"]:checked')].map(input => input.value); const response = await fetch('/oauth/authorize', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, approve, scope: selected.join(' ') }) }); const data = await response.json(); if (!response.ok) { message.textContent = data.error_description || 'Authorization could not be completed.'; return; } location.assign(data.redirect_uri); }
form?.addEventListener('submit', event => { event.preventDefault(); finish(true); }); document.querySelector('#oauth-deny')?.addEventListener('click', () => finish(false));
