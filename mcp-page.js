import { SUPABASE_URL } from './config.js';
import { supabase } from './supabase.js';
import { createMcpConnection, revokeMcpConnection } from '../services/mcp-service.js';
import { getMcpOverview, setMcpPermission, createExternalMcp, testExternalMcp, setExternalMcpEnabled, removeExternalMcp, revokeOAuthGrant } from '../services/mcp-admin-service.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Never';
const toast = message => { const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.append(el); setTimeout(() => el.remove(), 3200); };
const errorText = error => String(error?.message || 'The MCP service is not available yet.');
const initialsOf = name => String(name || 'M').trim().split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase() || 'M';
const endpointUrl = () => `${window.location.origin}/mcp`;

const tools = [
  ['get_business_profile', 'View business profile', 'READ'], ['get_products', 'View products', 'READ'], ['get_customers', 'View customers', 'READ'],
  ['get_business_metrics', 'View business metrics', 'READ'], ['get_sales_summary', 'View sales summary', 'READ'], ['get_inventory_summary', 'View inventory summary', 'READ'],
  ['get_recent_activity', 'View recent activity', 'READ'], ['get_tasks', 'View tasks', 'READ'], ['generate_business_report', 'Generate business report', 'READ'], ['create_task', 'Create a task', 'WRITE']
];

/* ------------------------------ shared pieces ------------------------------ */

function pageHeader() {
  return `<header class="page-header mcp-header">
    <div>
      <span class="eyebrow">MCP infrastructure</span>
      <h1 style="margin-top:7px">MCP dashboard</h1>
      <p>Connect trusted tools to Elio and let authorized clients use Elio safely.</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-quiet" data-refresh-mcp>↻ Refresh</button>
      <button class="btn btn-secondary" data-copy-endpoint title="Copy the MCP endpoint URL">⧉ Endpoint</button>
      <button class="btn btn-secondary" data-add-external>Add service</button>
      <button class="btn btn-primary" data-new-mcp-client>+ New client token</button>
    </div>
  </header>`;
}

function bindHeader(target) {
  target.querySelector('[data-refresh-mcp]').onclick = () => renderMcpPage();
  target.querySelector('[data-new-mcp-client]').onclick = () => clientTokenEditor(() => renderMcpPage());
  target.querySelector('[data-add-external]')?.addEventListener('click', () => externalEditor(() => renderMcpPage()));
  bindCopyEndpoint(target);
}

function bindCopyEndpoint(target) {
  target.querySelectorAll('[data-copy-endpoint]').forEach(button => button.onclick = async () => {
    try { await navigator.clipboard.writeText(endpointUrl()); toast('Endpoint copied.'); }
    catch { toast('Copy is not available here.'); }
  });
}

/* ------------------------------ rendering ------------------------------ */

export async function renderMcpPage() {
  const target = document.querySelector('#app-content');
  target.innerHTML = `${pageHeader()}
    <section class="card mcp-loading-card"><div class="mcp-loading"><span class="spinner" aria-hidden="true"></span> Loading MCP infrastructure…</div></section>
    <div class="mcp-skeleton-zone" aria-hidden="true">
      <div class="mcp-skel-row mcp-skel-row--tall"></div>
      <div class="mcp-skel-row"></div>
      <div class="mcp-skel-row"></div>
    </div>`;
  bindHeader(target);
  try {
    const overview = await getMcpOverview();
    const ids = (overview.connections || []).map(connection => connection.id);
    if (ids.length) {
      const { data: permissions } = await supabase.from('mcp_permissions').select('connection_id,capability_name,access_level,enabled').in('connection_id', ids);
      (overview.connections || []).forEach(connection => {
        connection.permissions = Object.fromEntries((permissions || []).filter(item => item.connection_id === connection.id).map(item => [item.capability_name, item]));
      });
    }
    draw(target, overview);
  } catch (error) {
    target.innerHTML = `${pageHeader()}<section class="card"><div class="empty"><div class="mascot">e</div><h3>MCP backend is not connected.</h3><p>${esc(errorText(error))}</p><p class="mcp-help">Deploy <code>supabase/functions/mcp-admin</code> and apply migration <code>006_mcp_infrastructure.sql</code> before using this dashboard.</p></div></section>`;
    bindHeader(target);
  }
}

function draw(target, overview) {
  const server = overview.server || {}, capability = overview.capabilities || { tools: tools.map(([name, description, access]) => ({ name, description, access_level: access })), resources: [], prompts: [] };
  const incoming = overview.connections || [], oauthGrants = overview.oauth_grants || [], external = overview.external_connections || [], activity = overview.activity || [], clients = overview.clients || [];
  const live = server.status === 'active';
  const connectedClients = clients.filter(client => client.status === 'connected').length;
  const toolsList = capability.tools || [], resourcesList = capability.resources || [], promptsList = capability.prompts || [];

  target.innerHTML = `${pageHeader()}

  <section class="card mcp-hero ${live ? 'mcp-hero--live' : 'mcp-hero--offline'}">
    <div class="mcp-hero-glow" aria-hidden="true"></div>
    <div class="mcp-hero-body">
      <div class="mcp-hero-id">
        <span class="mcp-hero-mark" aria-hidden="true">M</span>
        <div class="mcp-hero-title">
          <span class="eyebrow">Elio MCP server</span>
          <h2 style="margin-top:6px">${esc(server.name || 'Elio MCP Server')}</h2>
          <p class="mcp-hero-endpoint"><code>${esc(server.endpoint || endpointUrl())}</code><button class="btn btn-quiet mcp-copy" data-copy-endpoint aria-label="Copy endpoint URL">⧉</button></p>
        </div>
      </div>
      <div class="mcp-hero-side">
        <span class="mcp-status-pill"><span class="mcp-status-dot" aria-hidden="true"></span>${live ? 'Live' : 'Not deployed'}</span>
        <span class="mcp-hero-version">v${esc(server.version || '1.0.0')}</span>
      </div>
    </div>
    <div class="mcp-hero-stats">
      <div class="mcp-hero-stat"><strong>${toolsList.length}</strong><span>Tools</span></div>
      <div class="mcp-hero-stat"><strong>${resourcesList.length}</strong><span>Resources</span></div>
      <div class="mcp-hero-stat"><strong>${promptsList.length}</strong><span>Prompts</span></div>
      <div class="mcp-hero-stat"><strong>${connectedClients}</strong><span>Connected clients</span></div>
    </div>
    <p class="mcp-hero-note">Capabilities are read-only by default. Write access requires your explicit authorization per client.</p>
  </section>

  <div class="content-grid mcp-grid">
    <section class="card mcp-capabilities-card">
      <div class="section-title">
        <div>
          <h3>Capabilities</h3>
          <p>Everything the Elio MCP server can expose to a client.</p>
        </div>
        <span class="mcp-count-chip" data-capability-count>${toolsList.length + resourcesList.length + promptsList.length} total</span>
      </div><div class="mcp-cap-toolbar">
        <div class="mcp-cap-tabs" role="tablist" aria-label="Capability groups">
          <button class="mcp-cap-tab active" data-cap-tab="tools" role="tab" aria-selected="true">Tools <span>${toolsList.length}</span></button>
          <button class="mcp-cap-tab" data-cap-tab="resources" role="tab" aria-selected="false">Resources <span>${resourcesList.length}</span></button>
          <button class="mcp-cap-tab" data-cap-tab="prompts" role="tab" aria-selected="false">Prompts <span>${promptsList.length}</span></button>
        </div>
        <input class="mcp-cap-search" type="search" data-cap-search placeholder="Filter capabilities…" aria-label="Filter capabilities">
      </div>
      <div data-cap-panels>
        <div class="mcp-cap-panel" data-cap-panel="tools" role="tabpanel">${toolsList.map(capabilityRow).join('') || '<div class="mcp-cap-empty">No tools registered.</div>'}</div>
        <div class="mcp-cap-panel" data-cap-panel="resources" role="tabpanel" hidden>${resourcesList.map(resourceRow).join('') || '<div class="mcp-cap-empty">No resources registered.</div>'}</div>
        <div class="mcp-cap-panel" data-cap-panel="prompts" role="tabpanel" hidden>${promptsList.map(promptRow).join('') || '<div class="mcp-cap-empty">No prompts registered.</div>'}</div>
      </div>
    </section>

    <aside class="stack mcp-aside">
      <section class="card">
        <div class="section-title">
          <div>
            <h3>External connections</h3>
            <p>Credentials stay server-side and are never returned to this page.</p>
          </div>
        </div>
        ${external.length ? external.map(externalCard).join('') : `<div class="mcp-mini-empty"><strong>No external MCP services.</strong><p>Connect Phyzelyne or another compatible service when its endpoint is ready.</p></div>`}
      </section>

      <section class="card mcp-quickstart">
        <span class="eyebrow">Quick start</span>
        <p class="mcp-quickstart-intro">Point any MCP-compatible client at the endpoint above, authenticate with a client token, and pick the capabilities it may use.</p>
        <div class="mcp-quickstart-steps">
          <div><strong>1</strong><span>Create a client token</span></div>
          <div><strong>2</strong><span>Configure your MCP client</span></div>
          <div><strong>3</strong><span>Grant capabilities per client</span></div>
        </div>
        <button class="btn btn-secondary" data-new-mcp-client style="width:100%;margin-top:14px">Create a client token</button>
        <button class="btn btn-quiet" data-add-external style="width:100%;margin-top:8px">Add an external service</button>
        <p class="mcp-quickstart-note">Secrets are encrypted server-side; this page never sees them.</p>
      </section>
    </aside>
  </div>

  <section class="card mcp-clients-card">
    <div class="section-title">
      <div>
        <h3>Client permissions</h3>
        <p>Each client token is isolated to your account and business. Toggle capabilities per client.</p>
      </div>
      <input class="mcp-client-search" type="search" data-client-search placeholder="Search clients…" aria-label="Search clients">
    </div>
    <div data-client-list>
      ${incoming.length ? incoming.map(permissionCard).join('') : `<div class="mcp-mini-empty"><strong>No client tokens yet.</strong><p>Create a token for Claude, another AI agent, or an internal business tool.</p></div>`}
    </div>
  </section>

  <section class="card mcp-clients-card">
    <div class="section-title"><div><h3>OAuth connections</h3><p>Standards-based MCP clients approved through the Elio sign-in flow.</p></div></div>
    ${oauthGrants.length ? `<div data-oauth-grants>${oauthGrants.map(grant => `<article class="mcp-permission-card"><div class="section-title"><div><h4>${esc(grant.client_id)}</h4><p class="muted">${esc((grant.scopes || []).join(', '))} · approved ${esc(date(grant.approved_at))}</p></div>${grant.revoked_at ? '<span class="badge red">Revoked</span>' : `<button class="btn btn-danger" data-revoke-oauth="${esc(grant.id)}">Revoke</button>`}</div></article>`).join('')}</div>` : '<div class="mcp-mini-empty"><strong>No OAuth clients yet.</strong><p>Connections created by Claude and other compatible clients will appear here.</p></div>'}
  </section>

  <section class="card">
    <div class="section-title">
      <div>
        <h3>Recent MCP activity</h3>
        <p>Authentication, capability access, and connection events. Secrets are never logged.</p>
      </div>
      ${activity.length ? `<span class="mcp-count-chip">${activity.length} events</span>` : ''}
    </div>
    ${activity.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Client</th><th>Operation</th><th>Capability</th><th>Result</th></tr></thead><tbody>${activity.map(activityRow).join('')}</tbody></table></div>` : `<div class="mcp-mini-empty"><strong>No MCP activity yet.</strong><p>Events will appear after a client connects or a service is tested.</p></div>`}
  </section>`;
  bind(target, overview);
}

function capabilityRow(item) {
  const access = item.access_level || 'READ';
  return `<div class="mcp-capability" data-cap-row data-name="${esc(`${item.name} ${item.description || ''}`)}">
    <span class="mcp-cap-icon ${access === 'WRITE' ? 'mcp-cap-icon--write' : ''}" aria-hidden="true">${access === 'WRITE' ? '✎' : '◉'}</span>
    <div class="mcp-cap-text">
      <code>${esc(item.name)}</code>
      <span>${esc(item.description || '')}</span>
    </div>
    <span class="badge ${access === 'READ' ? 'green' : 'amber'}">${esc(access)}</span>
  </div>`;
}

function resourceRow(item) {
  return `<div class="mcp-capability" data-cap-row data-name="${esc(`${item.uri || item.name} ${item.description || ''}`)}">
    <span class="mcp-cap-icon" aria-hidden="true">▤</span>
    <div class="mcp-cap-text">
      <code>${esc(item.uri || item.name)}</code>
      <span>${esc(item.description || 'Business-scoped resource')}</span>
    </div>
  </div>`;
}

function promptRow(item) {
  return `<div class="mcp-capability" data-cap-row data-name="${esc(`${item.name} ${item.description || ''}`)}">
    <span class="mcp-cap-icon mcp-cap-icon--prompt" aria-hidden="true">✦</span>
    <div class="mcp-cap-text">
      <code>${esc(item.name)}</code>
      <span>${esc(item.description || 'Reusable business prompt')}</span>
    </div>
  </div>`;
}

function externalCard(item) {
  const state = item.enabled === false ? ['Disabled', ''] : [item.status || 'Disconnected', item.status === 'connected' ? 'green' : item.status === 'error' ? 'red' : 'amber'];
  return `<article class="mcp-external">
    <div class="section-title">
      <div>
        <h4>${esc(item.name)}</h4>
        <p class="muted mcp-external-url">${esc(item.endpoint_url)}</p>
      </div>
      <span class="badge ${state[1]}">${esc(state[0])}</span>
    </div>
    <p class="muted">${(item.tools || []).length} tools · ${(item.resources || []).length} resources · ${(item.prompts || []).length} prompts${item.last_checked_at ? ` · checked ${date(item.last_checked_at)}` : ''}</p>
    <div class="header-actions mcp-external-actions">
      <button class="btn btn-quiet" data-test-external="${item.id}">Test</button>
      <button class="btn btn-quiet" data-toggle-external="${item.id}" data-enabled="${item.enabled !== false}">${item.enabled === false ? 'Enable' : 'Disable'}</button>
      <button class="btn btn-danger" data-remove-external="${item.id}">Disconnect</button>
    </div>
  </article>`;
}

function permissionCard(connection) {
  const permissions = connection.permissions || {};
  const revoked = Boolean(connection.revoked_at);
  const granted = tools.filter(([name, , access]) => permissions[name]?.enabled || (access === 'READ' && permissions[name] === undefined)).length;
  return `<article class="mcp-permission-card" data-client-card data-name="${esc(connection.app_name)}"${revoked ? ' data-revoked' : ''}>
    <div class="section-title">
      <div class="mcp-client-id">
        <span class="mcp-client-mark" aria-hidden="true">${esc(initialsOf(connection.app_name))}</span>
        <div>
          <h4>${esc(connection.app_name)}</h4>
          <p class="muted">${revoked ? 'Revoked' : 'Token active'} · ${Number(connection.request_count || 0)} requests · ${granted}/${tools.length} capabilities granted</p>
        </div>
      </div>
      ${revoked ? '<span class="badge red">Revoked</span>' : `<div class="header-actions"><button class="btn btn-quiet" data-toggle-all="${connection.id}">Toggle all</button><button class="btn btn-danger" data-revoke-client="${connection.id}">Revoke</button></div>`}
    </div>
    <div class="mcp-permissions">
      ${tools.map(([name, description, access]) => {
        const grantedNow = permissions[name]?.enabled || (access === 'READ' && permissions[name] === undefined);
        return `<label class="mcp-permission${grantedNow ? ' is-granted' : ''}">
          <input type="checkbox" data-permission="${connection.id}" data-capability="${name}" data-access="${access}"${grantedNow ? ' checked' : ''}${revoked ? ' disabled' : ''}>
          <span class="mcp-permission-text"><strong>${esc(description)}</strong><small>${access} · ${esc(name)}</small></span>
        </label>`;
      }).join('')}
    </div>
  </article>`;
}

function activityRow(item) {
  const operation = item.operation || 'tool_call';
  const capability = item.tool_name || item.resource_uri || item.prompt_name || '—';
  return `<tr>
    <td>${esc(date(item.requested_at))}</td>
    <td><strong>${esc(item.client_name || 'MCP client')}</strong></td>
    <td>${esc(operation)}</td>
    <td><code>${esc(capability)}</code></td>
    <td><span class="mcp-result ${item.success ? 'mcp-result--ok' : 'mcp-result--fail'}">${item.success ? 'Success' : 'Failed'}</span></td>
  </tr>`;
}

/* ------------------------------ binding ------------------------------ */

function bind(target, overview) {
  target.querySelector('[data-refresh-mcp]').onclick = () => renderMcpPage();
  target.querySelector('[data-new-mcp-client]').onclick = () => clientTokenEditor(() => renderMcpPage());
  target.querySelector('[data-add-external]')?.addEventListener('click', () => externalEditor(() => renderMcpPage()));
  bindCopyEndpoint(target);

  // Capability explorer: tabs + filter.
  const tabs = [...target.querySelectorAll('[data-cap-tab]')];
  const panels = [...target.querySelectorAll('[data-cap-panel]')];
  const search = target.querySelector('[data-cap-search]');
  const countChip = target.querySelector('[data-capability-count]');
  const applyFilter = () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    panels.forEach(panel => {
      panel.querySelectorAll('[data-cap-row]').forEach(row => {
        const match = !query || (row.dataset.name || '').toLowerCase().includes(query);
        row.hidden = !match;
        if (match && !panel.hidden) visible += 1;
      });
    });
    if (countChip) countChip.textContent = `${visible} shown`;
  };
  tabs.forEach(tab => tab.onclick = () => {
    tabs.forEach(other => {
      other.classList.toggle('active', other === tab);
      other.setAttribute('aria-selected', other === tab ? 'true' : 'false');
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.capPanel !== tab.dataset.capTab; });
    if (search) search.value = '';
    applyFilter();
  });
  if (search) search.oninput = applyFilter;

  // Client permission cards: search filter.
  const clientSearch = target.querySelector('[data-client-search]');
  const clientList = target.querySelector('[data-client-list]');
  if (clientSearch && clientList) clientSearch.oninput = () => {
    const query = clientSearch.value.trim().toLowerCase();
    clientList.querySelectorAll('[data-client-card]').forEach(card => {
      card.hidden = Boolean(query) && !(card.dataset.name || '').toLowerCase().includes(query);
    });
  };

  // Permission toggles.
  target.querySelectorAll('[data-permission]').forEach(input => input.onchange = async () => {
    input.disabled = true;
    try {
      await setMcpPermission(input.dataset.permission, input.dataset.capability, input.dataset.access, input.checked);
      input.closest('.mcp-permission')?.classList.toggle('is-granted', input.checked);
      toast('Permission updated.');
    } catch (error) {
      input.checked = !input.checked;
      toast(errorText(error));
    } finally { input.disabled = false; }
  });

  // Toggle every capability for one client at once.
  target.querySelectorAll('[data-toggle-all]').forEach(button => button.onclick = async () => {
    const connectionId = button.dataset.toggleAll;
    const inputs = [...target.querySelectorAll(`[data-permission="${connectionId}"]`)].filter(input => !input.disabled);
    if (!inputs.length) return;
    const next = inputs.some(input => !input.checked);
    button.disabled = true;
    try {
      for (const input of inputs) {
        input.checked = next;
        input.dispatchEvent(new Event('change'));
      }
      toast(`All capabilities ${next ? 'granted' : 'revoked'}.`);
    } catch (error) {
      toast(errorText(error));
    } finally { button.disabled = false; }
  });

  target.querySelectorAll('[data-revoke-client]').forEach(button => button.onclick = async () => {
    if (!confirm('Revoke this client token?')) return;
    try {
      await revokeMcpConnection(button.dataset.revokeClient);
      toast('Client token revoked.');
      await renderMcpPage();
    } catch (error) { toast(errorText(error)); }
  });

  target.querySelectorAll('[data-revoke-oauth]').forEach(button => button.onclick = async () => {
    if (!confirm('Revoke this OAuth connection? The client will need approval again.')) return;
    try { await revokeOAuthGrant(button.dataset.revokeOauth); toast('OAuth connection revoked.'); await renderMcpPage(); }
    catch (error) { toast(errorText(error)); }
  });

  target.querySelectorAll('[data-test-external]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try {
      await testExternalMcp(button.dataset.testExternal);
      toast('Connection tested.');
      await renderMcpPage();
    } catch (error) { toast(errorText(error)); button.disabled = false; }
  });

  target.querySelectorAll('[data-toggle-external]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try {
      await setExternalMcpEnabled(button.dataset.toggleExternal, button.dataset.enabled !== 'true');
      await renderMcpPage();
    } catch (error) { toast(errorText(error)); button.disabled = false; }
  });

  target.querySelectorAll('[data-remove-external]').forEach(button => button.onclick = async () => {
    if (!confirm('Disconnect this external service?')) return;
    try {
      await removeExternalMcp(button.dataset.removeExternal);
      toast('External service disconnected.');
      await renderMcpPage();
    } catch (error) { toast(errorText(error)); }
  });
}

/* ------------------------------ modals ------------------------------ */

function clientTokenEditor(done) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">
    <div class="modal-header"><div><span class="eyebrow">Elio MCP server</span><h2 style="margin-top:5px">Create client token</h2></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div>
    <form>
      <div class="field"><label for="mcp-app-name">Client name</label><input id="mcp-app-name" name="appName" placeholder="Claude Desktop" required maxlength="120"></div>
      <div class="field"><label for="mcp-scopes">Scopes</label><input id="mcp-scopes" name="scopes" value="business.read" required><small class="muted">The server still enforces each capability permission.</small></div>
      <button class="btn btn-primary" type="submit">Create token</button>
    </form>
  </div>`;
  document.body.append(wrap);
  wrap.querySelector('[data-close]').onclick = () => wrap.remove();
  wrap.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await createMcpConnection({ appName: form.appName.value, scopes: form.scopes.value.split(',').map(value => value.trim()).filter(Boolean), expiresAt: null });
      wrap.innerHTML = `<div class="modal">
        <span class="eyebrow">Copy this token now</span>
        <h2 style="margin-top:5px">It will not be shown again.</h2>
        <p style="margin-top:12px">${esc(result.connection.app_name)} can use the Elio MCP endpoint.</p>
        <div class="token-box"><code>${esc(result.token)}</code><button class="btn btn-secondary" data-copy>Copy</button></div>
        <p class="muted mcp-endpoint">Endpoint: ${esc(endpointUrl())}</p>
        <button class="btn btn-primary" data-done>Done</button>
      </div>`;
      wrap.querySelector('[data-copy]').onclick = async () => { await navigator.clipboard.writeText(result.token); toast('Token copied.'); };
      wrap.querySelector('[data-done]').onclick = () => { wrap.remove(); done(); };
    } catch (error) { button.disabled = false; toast(errorText(error)); }
  };
}

function externalEditor(done) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">
    <div class="modal-header"><div><span class="eyebrow">External MCP service</span><h2 style="margin-top:5px">Add a server</h2></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div>
    <form>
      <div class="field"><label for="mcp-ext-name">Name</label><input id="mcp-ext-name" name="name" placeholder="Phyzelyne" required maxlength="120"></div>
      <div class="field"><label for="mcp-ext-endpoint">HTTPS endpoint</label><input id="mcp-ext-endpoint" name="endpointUrl" type="url" placeholder="https://service.example.com/mcp" pattern="https://.*" required></div>
      <div class="field"><label for="mcp-ext-auth">Authentication</label><select id="mcp-ext-auth" name="authType"><option value="none">None</option><option value="bearer">Bearer token</option><option value="oauth2">OAuth 2 access token</option></select></div>
      <div class="field"><label for="mcp-ext-secret">Credential (optional)</label><input id="mcp-ext-secret" name="secret" type="password" autocomplete="new-password"><small class="muted">Encrypted by the backend; never stored in browser storage.</small></div>
      <button class="btn btn-primary" type="submit">Add and test</button>
    </form>
  </div>`;
  document.body.append(wrap);
  wrap.querySelector('[data-close]').onclick = () => wrap.remove();
  wrap.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await createExternalMcp({ name: form.name.value, endpoint_url: form.endpointUrl.value, auth_type: form.authType.value, secret: form.secret.value });
      wrap.remove();
      toast('Service saved. Testing connection…');
      await testExternalMcp(result.id);
      await done();
    } catch (error) { button.disabled = false; toast(errorText(error)); }
  };
}
