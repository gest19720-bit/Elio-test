import { supabase, requireSession, getBusiness, friendlyError } from './supabase-client.js';
import { signOut } from './auth.js';
import { buildDailyBrief, } from './elio-agent.js';
import { listTasks, createTask, updateTask, deleteTask } from './task-service.js';
import { listApprovals, resolveApproval } from './approval-service.js';
import { listActivities, logActivity } from './activity-service.js';
import { generateFollowUpDraft } from './follow-up-drafting-agent.js';
import { createFollowUpWorkflow } from './follow-up-service.js';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from './customer-service.js';
import { listProducts, createProduct, updateProduct, deleteProduct } from './product-service.js';
import { listMcpConnections, createMcpConnection, revokeMcpConnection, listMcpAccessLog } from './mcp-service.js';
import { askAssistant } from './assistant-service.js';
import { renderMcpPage } from './mcp-page.js';
import { renderMetricsPage } from './metrics-page.js';
import { openModal } from './modal.js';
import { authorizeWorkspaceApp, listWorkspaceConnections, searchWorkspaceTools } from './composio-service.js';
import { renderMarketingPage } from './marketing-page.js';

const page = document.body.dataset.page;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const date = value => value ? new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(value)) : 'No date';
const time = value => new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(value));
const initials = name => (name || 'E').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const title = page.charAt(0).toUpperCase()+page.slice(1);
const followUpDiagnostic = (event, details = {}) => { if (window.ELIO_DEBUG_AI === true) console.debug(`[follow-up-agent] ${event}`, details); };

async function boot(business) {
  document.body.innerHTML = shell(business);
  document.body.classList.add('elio-ready');
  document.querySelectorAll(`[data-nav="${page}"]`).forEach(el => el.classList.add('active'));
  document.querySelector('.bottom-nav a.active')?.scrollIntoView({block:'nearest',inline:'center'});
  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click', signOut));
  wireMobileMenu();
  try { await renderPage(business); } catch (error) { showError(friendlyError(error)); }
}

function shell(business) {
  const nav=[['dashboard','⌂','Dashboard'],['tasks','✓','Tasks'],['approvals','◌','Approvals'],['activity','↗','Activity'],['customers','♧','Customers'],['products','▦','Products'],['workflows','◇','Workflows'],['connections','⊕','Connections'],['assistant','✦','Ask Elio']];
  nav.splice(8, 0, ['mcp', 'M', 'MCP']);
  nav.splice(1, 0, ['metrics', '◒', 'Metrics']);
  nav.splice(2, 0, ['marketing', '✦', 'Marketing']);
  const links=nav.map(([key,icon,label])=>`<a data-nav="${key}" href="${key}.html"><span class="nav-icon">${icon}</span>${label}</a>`).join('');
  const name=session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'there';
  return `<div class="app-shell"><aside class="sidebar"><a class="brand" href="dashboard.html"><img class="brand-mark" src="elio-logo.jpeg" alt=""><span><strong class="brand-name">elio</strong><small class="brand-sub">The calm behind your business.</small></span></a><nav class="nav" aria-label="Main navigation">${links}</nav><div class="sidebar-spacer"></div><a data-nav="settings" href="settings.html" class="nav"><span class="nav-icon">⚙</span>Settings</a><div class="profile-card"><span class="avatar">${initials(name)}</span><span><strong>${esc(name)}</strong><small>${esc(session.user.email)}</small></span><button class="btn btn-quiet" data-logout aria-label="Log out" style="margin-left:auto;padding:5px 7px">↗</button></div></aside><main class="main-content"><div id="app-content"></div></main><nav class="bottom-nav" aria-label="Mobile navigation">${nav.slice(0,5).map(([key,icon,label])=>`<a data-nav="${key}" href="${key}.html"><span class="nav-icon">${icon}</span>${label}</a>`).join('')}<button type="button" class="menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu"><span class="menu-bars" aria-hidden="true"><i></i><i></i><i></i></span>Menu</button></nav><div class="menu-backdrop" data-menu-close hidden></div><section class="menu-sheet" id="mobile-menu" role="dialog" aria-modal="true" aria-label="All pages" hidden><div class="menu-sheet-header"><span class="avatar">${initials(name)}</span><span class="menu-sheet-id"><strong>${esc(name)}</strong><small>${esc(session.user.email)}</small></span><button type="button" class="btn btn-quiet" data-menu-close aria-label="Close menu">×</button></div><nav class="menu-grid" aria-label="All pages">${links}<a data-nav="settings" href="settings.html"><span class="nav-icon">⚙</span>Settings</a></nav><button type="button" class="btn btn-secondary menu-logout" data-logout>Log out</button></section></div>`;
}

function wireMobileMenu() {
  const toggle=document.querySelector('[data-menu-toggle]');
  const sheet=document.querySelector('.menu-sheet');
  const backdrop=document.querySelector('.menu-backdrop');
  if(!toggle||!sheet||!backdrop) return;
  let closeTimer=null;
  let openFrameOne=null;
  let openFrameTwo=null;
  let opener=null;
  const lockScroll=()=>{document.body.style.overflow='hidden'};
  const unlockScroll=()=>{document.body.style.overflow=''};
  const focusable=()=>[...sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length);
  const restoreFocus=()=>{
    const target=opener?.isConnected?opener:toggle;
    target.focus();
    opener=null;
  };
  const setOpen=open=>{
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'Close menu':'Open menu');
    clearTimeout(closeTimer);
    if(open){
      opener=document.activeElement instanceof HTMLElement?document.activeElement:toggle;
      lockScroll();
      backdrop.hidden=false; sheet.hidden=false;
      openFrameOne=requestAnimationFrame(()=>{
        openFrameOne=null;
        openFrameTwo=requestAnimationFrame(()=>{
          openFrameTwo=null;
          if(sheet.hidden||toggle.getAttribute('aria-expanded')!=='true') return;
          backdrop.classList.add('open');sheet.classList.add('open');focusable()[0]?.focus();
        });
      });
    } else {
      if(openFrameOne!==null){cancelAnimationFrame(openFrameOne);openFrameOne=null;}
      if(openFrameTwo!==null){cancelAnimationFrame(openFrameTwo);openFrameTwo=null;}
      backdrop.classList.remove('open'); sheet.classList.remove('open');
      unlockScroll();
      closeTimer=setTimeout(()=>{backdrop.hidden=true; sheet.hidden=true;},240);
      restoreFocus();
    }
  };
  toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
  sheet.querySelectorAll('[data-menu-close]').forEach(el=>el.addEventListener('click',()=>setOpen(false)));
  backdrop.addEventListener('click',()=>setOpen(false));
  sheet.querySelectorAll('a').forEach(el=>el.addEventListener('click',()=>setOpen(false)));
  document.addEventListener('keydown',e=>{
    if(sheet.hidden||toggle.getAttribute('aria-expanded')!=='true') return;
    if(e.key==='Escape'){e.preventDefault();setOpen(false);return;}
    if(e.key!=='Tab') return;
    const controls=focusable();
    if(!controls.length) return;
    const first=controls[0],last=controls[controls.length-1],active=document.activeElement;
    if(!sheet.contains(active)){e.preventDefault();(e.shiftKey?last:first).focus();}
    else if(e.shiftKey&&active===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&active===last){e.preventDefault();first.focus();}
  });
}

function header(heading, sub, action='') { return `<header class="page-header"><div><span class="eyebrow">${esc(title)}</span><h1 style="margin-top:7px">${heading}</h1><p>${sub}</p></div>${action?`<div class="header-actions">${action}</div>`:''}</header>`; }
function emptyState(text, sub, button='') { return `<div class="empty"><div class="mascot">e</div><h3>${text}</h3><p>${sub}</p>${button?`<div style="margin-top:18px">${button}</div>`:''}</div>`; }
function showError(message) { document.querySelector('#app-content').innerHTML=`<div class="card">${emptyState('Elio needs a moment.',message,'<button class="btn btn-secondary" onclick="location.reload()">Try again</button>')}</div>`; }
function toast(message) { const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),3200); }

async function renderPage(b) {
  if(page==='dashboard') return renderDashboard(b);
  if(page==='metrics') return renderMetricsPage(b);
  if(page==='marketing') return renderMarketingPage(b);
  if(page==='tasks') return renderTasks(b);
  if(page==='approvals') return renderApprovals(b);
  if(page==='activity') return renderActivity(b);
  if(page==='customers') return renderCustomers(b);
  if(page==='products') return renderProducts(b);
  if(page==='workflows') return renderWorkflowsMvp(b);
  if(page==='connections') return renderConnections(b);
  if(page==='mcp') return renderMcpPage(b);
  if(page==='assistant') { await renderAssistant(b); const question = new URLSearchParams(location.search).get('question'); if (question && document.querySelector('#assistant-input')) document.querySelector('#assistant-input').value = question; return; }
  if(page==='settings') return renderSettings(b);
}

async function renderDashboard(b) {
  const brief=await buildDailyBrief(b.id); const [tasks,activities]=await Promise.all([listTasks(b.id),listActivities(b.id,5)]); const first=(session.user.user_metadata?.full_name||'there').split(' ')[0];
  const attention=[...brief.approvals.map(x=>({icon:'◌',title:x.title,desc:'An action is waiting for your decision.',href:'approvals.html'})),...brief.followUps.slice(0,3).map(x=>({icon:'↗',title:`${x.name} may need a follow-up`,desc:'It has been a little while since the last contact.',href:'customers.html'})),...brief.overdue.slice(0,3).map(x=>({icon:'!',title:x.title,desc:'This task is past its due date.',href:'tasks.html'}))];
  document.querySelector('#app-content').innerHTML=header(`Good morning, ${esc(first)}.`,`Here’s what’s happening with your business today.`)+`<div class="stack"><section class="card brief-card"><div><span class="eyebrow" style="color:var(--elio-amber)">Elio Daily Brief</span><h2>${brief.totalAttention?`Here’s what needs your attention.`:'You’re all caught up.'}</h2><p>${brief.totalAttention?`I found ${brief.totalAttention} ${brief.totalAttention===1?'thing':'things'} worth a look. Nothing is urgent without your say-so.`:'Elio hasn’t found anything that needs your attention right now.'}</p><a href="${brief.approvals.length?'approvals.html':brief.followUps.length?'customers.html':'tasks.html'}" class="btn btn-primary" style="display:inline-block;margin-top:20px">Review what needs attention</a></div><div class="mascot">e</div></section><section class="metric-grid"><div class="metric"><strong>${brief.totalAttention}</strong><span>Needs attention</span></div><div class="metric"><strong>${tasks.filter(x=>x.status!=='Completed').length}</strong><span>Active tasks</span></div><div class="metric"><strong>${tasks.filter(x=>x.status==='Completed'&&x.updated_at?.slice(0,10)===new Date().toISOString().slice(0,10)).length}</strong><span>Completed today</span></div></section><div class="content-grid"><section class="card"><div class="section-title"><h3>Needs your attention</h3><a class="muted" href="tasks.html">View tasks</a></div>${attention.length?`<div class="list">${attention.map(x=>`<div class="list-item"><div style="display:flex;gap:12px"><span class="avatar" style="width:30px;height:30px">${x.icon}</span><div><h4>${esc(x.title)}</h4><p>${esc(x.desc)}</p></div></div><a class="btn btn-quiet" href="${x.href}">Open</a></div>`).join('')}</div>`:emptyState('Nothing urgent right now.','Elio will let you know when something needs you.')}</section><section class="card"><div class="section-title"><h3>Elio’s recent work</h3><a class="muted" href="activity.html">View all</a></div>${activities.length?`<div class="list">${activities.map(x=>`<div class="list-item"><div><h4>${esc(x.action)}</h4><p>${time(x.created_at)} · ${esc(x.actor)}</p></div><span class="badge ${x.actor==='Elio'?'blue':'green'}">${esc(x.actor)}</span></div>`).join('')}</div>`:emptyState('Elio is just getting started.','Your activity will appear here as you work.')}</section></div></div>`;
}

async function renderTasks(b) {
  const tasks=await listTasks(b.id); document.querySelector('#app-content').innerHTML=header('Tasks','Keep the small but important things moving.','<button class="btn btn-primary" data-add-task>New task</button>')+`<section class="card"><div class="toolbar"><input data-search placeholder="Search tasks" aria-label="Search tasks"><select data-status><option value="">All statuses</option><option>Needs Attention</option><option>In Progress</option><option>Waiting</option><option>Completed</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th><th></th></tr></thead><tbody data-task-list></tbody></table></div></section>`;
  const list=document.querySelector('[data-task-list]'); const draw=()=>{const q=document.querySelector('[data-search]').value.toLowerCase(),s=document.querySelector('[data-status]').value;const rows=tasks.filter(t=>(!q||`${t.title} ${t.description}`.toLowerCase().includes(q))&&(!s||t.status===s));list.innerHTML=rows.length?rows.map(t=>`<tr><td><strong>${esc(t.title)}</strong><span class="muted">${esc(t.description||'No description')}</span>${t.customers?`<small>${esc(t.customers.name)}</small>`:''}</td><td><select data-task-status="${t.id}">${['Needs Attention','In Progress','Waiting','Completed'].map(x=>`<option ${x===t.status?'selected':''}>${x}</option>`).join('')}</select></td><td><span class="badge ${t.priority==='Critical'||t.priority==='High'?'red':''}">${esc(t.priority)}</span></td><td>${date(t.due_date)}</td><td><button class="btn btn-danger" data-delete-task="${t.id}">Delete</button></td></tr>`).join(''): `<tr><td colspan="5">${emptyState('You’re all caught up.','Create a task when something needs a place to live.','<button class="btn btn-primary" data-add-task>New task</button>')}</td></tr>`}; draw();document.querySelector('[data-search]').oninput=draw;document.querySelector('[data-status]').onchange=draw;document.querySelectorAll('[data-add-task]').forEach(x=>x.onclick=()=>taskModal(b,()=>renderTasks(b))); document.querySelectorAll('[data-delete-task]').forEach(x=>x.onclick=async()=>{if(confirm('Delete this task?')){await deleteTask(x.dataset.deleteTask,b.id);toast('Task deleted.');renderTasks(b)}});document.querySelectorAll('[data-task-status]').forEach(x=>x.onchange=async()=>{await updateTask(x.dataset.taskStatus,b.id,{status:x.value});toast('Task updated.');});
}

function taskModal(b, done){const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal"><div class="modal-header"><div><span class="eyebrow">New task</span><h2 style="margin-top:5px">Give it a clear next step.</h2></div><button class="btn btn-quiet" data-close>×</button></div><form><div class="field"><label>Title</label><input name="title" required></div><div class="field"><label>Description</label><textarea name="description"></textarea></div><div class="field"><label>Priority</label><select name="priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></div><div class="field"><label>Due date</label><input type="date" name="due_date"></div><button class="btn btn-primary" type="submit">Create task</button></form></div>`;openModal(wrap);wrap.querySelector('[data-close]').onclick=()=>wrap.remove();wrap.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target;await createTask({business_id:b.id,title:f.title.value.trim(),description:f.description.value.trim(),priority:f.priority.value,due_date:f.due_date.value||null,created_by:session.user.id});wrap.remove();toast('Task created.');done()};}

async function renderApprovals(b){const approvals=await listApprovals(b.id);document.querySelector('#app-content').innerHTML=header('Approvals','Elio prepares. You decide.')+`<section class="card">${approvals.length?`<div class="list">${approvals.map(a=>`<article class="list-item" style="align-items:flex-start"><div><span class="badge ${a.status==='Pending'?'amber':a.status==='Approved'?'green':'red'}">${a.status}</span><h3 style="margin:10px 0 5px">${esc(a.title)}</h3><p>${esc(a.description)}</p>${a.content?.message?`<p style="white-space:pre-line;margin-top:10px;padding:12px;background:var(--surface-secondary);border-radius:10px">${esc(a.content.message)}</p>`:''}<small class="muted">${a.customers?`Customer: ${esc(a.customers.name)} · `:''}${date(a.created_at)}</small></div>${a.status==='Pending'?`<div class="header-actions"><button class="btn btn-primary" data-approve="${a.id}">Approve & send</button><button class="btn btn-danger" data-reject="${a.id}">Reject</button></div>`:''}</article>`).join('')}</div>`:emptyState('No pending approvals.','Elio doesn’t need your decision right now.')}</section>`;const byId=id=>approvals.find(x=>x.id===id);document.querySelectorAll('[data-approve]').forEach(x=>x.onclick=async()=>{await resolveApproval(byId(x.dataset.approve),'Approved',session.user.id);toast('Approval completed.');renderApprovals(b)});document.querySelectorAll('[data-reject]').forEach(x=>x.onclick=async()=>{await resolveApproval(byId(x.dataset.reject),'Rejected',session.user.id);toast('Approval rejected.');renderApprovals(b)});}

async function renderActivity(b){const items=await listActivities(b.id,50);document.querySelector('#app-content').innerHTML=header('Activity','A clear record of what you and Elio have done.')+`<section class="card">${items.length?`<div class="list">${items.map(x=>`<div class="list-item"><div style="display:flex;gap:13px"><span class="avatar">${x.actor==='Elio'?'e':'✓'}</span><div><h4>${esc(x.action)}</h4><p>${esc(x.entity_type)} · ${new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(x.created_at))}</p></div></div><span class="badge ${x.actor==='Elio'?'blue':x.actor==='System'?'amber':'green'}">${x.actor}</span></div>`).join('')}</div>`:emptyState('Your timeline is quiet.','Activity will appear here as you work with Elio.')}</section>`;}

async function renderCustomersLegacy(b){const {data:customers,error}=await supabase.from('customers').select('*').eq('business_id',b.id).order('created_at',{ascending:false});if(error)throw error;document.querySelector('#app-content').innerHTML=header('Customers','Keep relationships visible without keeping everything in your head.','<button class="btn btn-primary" data-add-customer>Add customer</button>')+`<section class="card"><div class="toolbar"><input data-customer-search placeholder="Search customers" aria-label="Search customers"><select data-customer-status><option value="">All statuses</option><option>Active</option><option>Waiting</option><option>Needs Follow-Up</option><option>Inactive</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Customer</th><th>Status</th><th>Last contact</th><th></th></tr></thead><tbody data-customer-list></tbody></table></div></section>`;const list=document.querySelector('[data-customer-list]');const draw=()=>{const q=document.querySelector('[data-customer-search]').value.toLowerCase(),s=document.querySelector('[data-customer-status]').value;const rows=customers.filter(c=>(!q||`${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q))&&(!s||c.status===s));list.innerHTML=rows.length?rows.map(c=>`<tr><td><strong>${esc(c.name)}</strong><span class="muted">${esc(c.company||c.email||'')}</span></td><td><span class="badge ${c.status==='Needs Follow-Up'?'amber':''}">${esc(c.status)}</span></td><td>${date(c.last_contact_at)}</td><td><div class="header-actions"><button class="btn btn-secondary" data-follow-up="${c.id}">Prepare follow-up</button><button class="btn btn-danger" data-delete-customer="${c.id}">Delete</button></div></td></tr>`).join(''):`<tr><td colspan="4">${emptyState('No customers yet.','Add your first customer and let Elio help you stay on top of follow-ups.','<button class="btn btn-primary" data-add-customer>Add customer</button>')}</td></tr>`};draw();document.querySelector('[data-customer-search]').oninput=draw;document.querySelector('[data-customer-status]').onchange=draw;document.querySelectorAll('[data-add-customer]').forEach(x=>x.onclick=()=>customerModal(b,()=>renderCustomers(b)));document.querySelectorAll('[data-delete-customer]').forEach(x=>x.onclick=async()=>{if(confirm('Delete this customer?')){await supabase.from('customers').delete().eq('id',x.dataset.deleteCustomer).eq('business_id',b.id);toast('Customer removed.');renderCustomers(b)}});document.querySelectorAll('[data-follow-up]').forEach(x=>x.onclick=()=>followUpModal(b,customers.find(c=>c.id===x.dataset.followUp)));}

function customerModal(b,done){const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal"><div class="modal-header"><div><span class="eyebrow">Customer</span><h2 style="margin-top:5px">Add a relationship.</h2></div><button class="btn btn-quiet" data-close>×</button></div><form><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field"><label>Company</label><input name="company"></div><div class="field"><label>Notes</label><textarea name="notes"></textarea></div><button class="btn btn-primary">Add customer</button></form></div>`;openModal(wrap);wrap.querySelector('[data-close]').onclick=()=>wrap.remove();wrap.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target;const {error}=await supabase.from('customers').insert({business_id:b.id,name:f.name.value.trim(),email:f.email.value.trim(),company:f.company.value.trim(),notes:f.notes.value.trim()});if(error)throw error;await logActivity({businessId:b.id,action:`Added customer “${f.name.value.trim()}”`,entityType:'customer'});wrap.remove();toast('Customer added.');done()};}

function followUpModal(b, customer) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal follow-up-modal"><div class="modal-header"><div><span class="eyebrow">Elio follow-up</span><h2 style="margin-top:5px">Prepare something thoughtful.</h2><p>For ${esc(customer.name)}</p></div><button class="btn btn-quiet" data-close aria-label="Cancel">×</button></div><form><div class="field"><label for="follow-up-context">What should Elio write? <span class="muted">(required)</span></label><textarea id="follow-up-context" name="context" maxlength="3000" rows="3" required placeholder="For example: Thank them for the consultation, answer their question about the service, and invite them to choose a next step."></textarea><small class="muted">Describe what you want sent. Elio uses saved notes, activity, tasks, and previous drafts only to add relevant facts.</small></div><div class="content-grid follow-up-options"><div class="field"><label for="follow-up-purpose">What should be sent?</label><select id="follow-up-purpose" name="purpose"><option>Check in</option><option>Follow up on inquiry</option><option>Re-engage customer</option><option>After purchase</option><option>Payment reminder</option><option>Custom</option></select></div><div class="field"><label for="follow-up-tone">Tone</label><select id="follow-up-tone" name="tone"><option>Friendly</option><option>Professional</option><option>Casual</option></select></div><div class="field"><label for="follow-up-length">Length</label><select id="follow-up-length" name="length"><option>Short</option><option>Medium</option></select></div></div><div class="field follow-up-message-field"><div class="follow-up-composer-label"><label for="follow-up-message">Draft message</label><button class="btn btn-quiet follow-up-generate" data-generate type="button" disabled><span aria-hidden="true">✦</span><span data-generate-label>Generate with Elio</span></button></div><textarea id="follow-up-message" name="message" maxlength="6000" rows="7" placeholder="Your editable follow-up will appear here…"></textarea><div class="follow-up-placement" data-placement hidden><span>There is already text in the draft.</span><div class="header-actions"><button class="btn btn-secondary" data-replace type="button">Replace</button><button class="btn btn-secondary" data-insert type="button">Insert below</button><button class="btn btn-quiet" data-cancel-placement type="button">Cancel</button></div></div><p class="muted" data-draft-status hidden role="status" aria-live="polite"></p></div><p class="muted" data-ai-error hidden role="alert"></p><div class="header-actions follow-up-submit-actions"><button class="btn btn-primary" data-save type="submit" disabled>Save draft for approval</button></div><p class="muted follow-up-disclaimer">Nothing will be sent automatically. Review and edit the draft before saving it for approval.</p></form></div>`;
  openModal(wrap);
  wrap.querySelector('[data-close]').onclick = () => wrap.remove();
  const form = wrap.querySelector('form');
  const contextInput = form.context;
  const message = form.message;
  const generateButton = form.querySelector('[data-generate]');
  const generateLabel = form.querySelector('[data-generate-label]');
  const saveButton = form.querySelector('[data-save]');
  const errorMessage = form.querySelector('[data-ai-error]');
  const draftStatus = form.querySelector('[data-draft-status]');
  const placement = form.querySelector('[data-placement]');
  let generatedSubject = '';
  let suggestedAction = '';

  contextInput.addEventListener('input', () => {
    if (!generateButton.getAttribute('aria-busy')) generateButton.disabled = !contextInput.value.trim();
  });

  const showError = error => {
    errorMessage.textContent = friendlyError(error, 'Elio could not write that draft. Please try again.');
    errorMessage.hidden = false;
  };
  const clearError = () => { errorMessage.hidden = true; errorMessage.textContent = ''; };
  const requestGeneration = async placementMode => {
    if (!contextInput.value.trim()) {
      showError(new Error('Tell Elio what you want the message to say first.'));
      contextInput.focus();
      return;
    }
    clearError();
    placement.hidden = true;
    generateButton.disabled = true;
    saveButton.disabled = true;
    generateButton.setAttribute('aria-busy', 'true');
    followUpDiagnostic('FOLLOW_UP_GENERATION_STARTED', { instructionLength: form.context.value.trim().length, placementMode });
    generateLabel.textContent = 'Elio is writing...';
    draftStatus.textContent = 'Elio is writing...';
    draftStatus.hidden = false;
    try {
      const result = await generateFollowUpDraft({
        customerId: customer.id,
        instruction: form.context.value,
        purpose: form.purpose.value,
        tone: form.tone.value,
        length: form.length.value
      });
      const draft = result.draft.trim();
      followUpDiagnostic('DRAFT_RETURNED', { draftLength: draft.length });
      message.value = placementMode === 'insert' && message.value.trim() ? `${message.value.trim()}\n\n${draft}` : draft;
      followUpDiagnostic('DRAFT_INSERTED', { placementMode });
      generatedSubject = `Follow-up with ${customer.name}`;
      suggestedAction = form.purpose.value;
      saveButton.disabled = false;
      draftStatus.textContent = 'Draft ready. Review and edit it before saving.';
      message.focus();
    } catch (error) {
      showError(error);
      draftStatus.hidden = true;
      saveButton.disabled = !message.value.trim();
    } finally {
      generateButton.disabled = !contextInput.value.trim();
      generateButton.removeAttribute('aria-busy');
      generateLabel.textContent = message.value.trim() ? 'Regenerate with Elio' : 'Generate with Elio';
    }
  };
  generateButton.onclick = () => {
    if (message.value.trim()) {
      placement.hidden = false;
      form.querySelector('[data-replace]').focus();
      return;
    }
    requestGeneration('replace');
  };
  form.querySelector('[data-replace]').onclick = () => requestGeneration('replace');
  form.querySelector('[data-insert]').onclick = () => requestGeneration('insert');
  form.querySelector('[data-cancel-placement]').onclick = () => { placement.hidden = true; generateButton.focus(); };
  form.onsubmit = async event => {
    event.preventDefault();
    clearError();
    if (!message.value.trim()) {
      showError(new Error('Generate a draft or enter a message before saving.'));
      message.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      await createFollowUpWorkflow({ businessId: b.id, customerId: customer.id, subject: generatedSubject || `Follow-up with ${customer.name}`, message: message.value.trim(), suggestedAction: suggestedAction || form.purpose.value, generatedBy: 'Elio' });
      wrap.remove();
      toast('Draft created for approval.');
    } catch (error) {
      showError(error);
      saveButton.disabled = false;
    }
  };
}

async function renderWorkflows(b){const {data,error}=await supabase.from('workflows').select('*').eq('business_id',b.id).order('created_at');if(error)throw error;document.querySelector('#app-content').innerHTML=header('Workflows','Simple routines for the work you repeat.')+`<div class="content-grid">${data.map(w=>`<section class="card"><div class="section-title"><span class="badge ${w.is_active?'green':''}">${w.is_active?'Active':'Paused'}</span><button class="btn ${w.is_active?'btn-quiet':'btn-secondary'}" data-workflow="${w.id}">${w.is_active?'Pause':'Activate'}</button></div><h3>${esc(w.name)}</h3><p style="margin:9px 0 18px">${esc(w.description)}</p><p class="muted"><strong>Trigger:</strong> ${esc(w.trigger_type)}<br><strong>Action:</strong> ${esc(w.action_type)}<br><strong>Approval:</strong> ${w.approval_required?'Required':'Not required'}</p></section>`).join('')}</div>`;document.querySelectorAll('[data-workflow]').forEach(x=>x.onclick=async()=>{const w=data.find(y=>y.id===x.dataset.workflow);await supabase.from('workflows').update({is_active:!w.is_active,updated_at:new Date().toISOString()}).eq('id',w.id).eq('business_id',b.id);await logActivity({businessId:b.id,action:`${w.is_active?'Paused':'Activated'} workflow “${w.name}”`,entityType:'workflow',entityId:w.id});toast(w.is_active?'Workflow paused.':'Workflow activated.');renderWorkflows(b)});}

async function renderMcp(b) {
  const target = document.querySelector('#app-content');
  target.innerHTML = header('MCP connections', 'Give approved tools read-only access to the financial summary you choose.', '<button class="btn btn-primary" data-add-mcp>New connection</button>') + '<section class="card"><div class="section-title"><div><h3>Your connections</h3><p>Tokens are shown once when created. Elio stores only their SHA-256 hash.</p></div><button class="btn btn-quiet" data-refresh-mcp>Refresh</button></div><div data-mcp-list>' + emptyState('Loading MCP connections…', 'Checking your saved connections.') + '</div></section>';
  const list = document.querySelector('[data-mcp-list]');
  const draw = async () => {
    list.innerHTML = emptyState('Loading MCP connections…', 'Checking your saved connections.');
    try {
      const connections = await listMcpConnections();
      list.innerHTML = connections.length ? '<div class="mcp-list">' + connections.map(connectionCard).join('') + '</div>' : emptyState('No MCP connections yet.', 'Create a connection to use Elio data from an MCP-compatible client.', '<button class="btn btn-primary" data-add-mcp>Create connection</button>');
      bindConnections(connections);
      bindAdd();
    } catch (error) { list.innerHTML = emptyState('MCP connections are unavailable.', friendlyError(error, 'Check that the mcp_connections table and RLS policies are installed.')); }
  };
  const bindConnections = connections => {
    document.querySelectorAll('[data-revoke-mcp]').forEach(button => button.onclick = async () => {
      const connection = connections.find(item => item.id === button.dataset.revokeMcp);
      if (!connection || !confirm(`Revoke ${connection.app_name}? Existing clients will stop working.`)) return;
      button.disabled = true;
      try { await revokeMcpConnection(connection.id); toast('MCP connection revoked.'); await draw(); } catch (error) { button.disabled = false; toast(friendlyError(error, 'Elio could not revoke this connection.')); }
    });
    document.querySelectorAll('[data-log-mcp]').forEach(button => button.onclick = () => showMcpLog(button.dataset.logMcp, connections.find(item => item.id === button.dataset.logMcp)?.app_name || 'MCP connection'));
  };
  const bindAdd = () => document.querySelectorAll('[data-add-mcp]').forEach(button => button.onclick = () => mcpEditor(draw));
  document.querySelector('[data-refresh-mcp]').onclick = draw;
  await draw();
  bindAdd();
}

function connectionCard(connection) {
  const revoked = Boolean(connection.revoked_at), expired = connection.expires_at && new Date(connection.expires_at) <= new Date();
  const state = revoked ? ['Revoked', 'red'] : expired ? ['Expired', 'amber'] : ['Active', 'green'];
  const scopes = (connection.scopes || []).map(scope => `<span class="badge blue">${esc(scope)}</span>`).join('');
  return `<article class="mcp-connection card"><div class="section-title"><div><span class="eyebrow">MCP client</span><h3>${esc(connection.app_name)}</h3></div><span class="badge ${state[1]}">${state[0]}</span></div><div class="mcp-meta"><span><strong>Created</strong>${date(connection.created_at)}</span><span><strong>Last used</strong>${connection.last_used_at ? date(connection.last_used_at) : 'Never'}</span><span><strong>Requests</strong>${Number(connection.request_count || 0)}</span>${connection.expires_at ? `<span><strong>Expires</strong>${date(connection.expires_at)}</span>` : ''}</div><div class="mcp-scopes"><strong>Scopes</strong><div>${scopes || '<span class="muted">No scopes configured</span>'}</div></div><div class="header-actions"><button class="btn btn-quiet" data-log-mcp="${connection.id}">View access log</button>${!revoked ? `<button class="btn btn-danger" data-revoke-mcp="${connection.id}">Revoke</button>` : ''}</div></article>`;
}

function mcpEditor(done) {
  const wrap = document.createElement('div'); wrap.className = 'modal-backdrop';
  wrap.innerHTML = '<div class="modal"><div class="modal-header"><div><span class="eyebrow">New MCP connection</span><h2 style="margin-top:5px">Create a read-only access token.</h2></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div><form><div class="field"><label for="mcp-app-name">App name</label><input id="mcp-app-name" name="appName" placeholder="e.g. Claude Desktop" maxlength="120" required></div><div class="field"><label for="mcp-scopes">Scopes</label><input id="mcp-scopes" name="scopes" value="financial.read.summary" required><small class="muted">Comma-separated read-only scopes.</small></div><div class="field"><label for="mcp-expires">Expires (optional)</label><input id="mcp-expires" name="expiresAt" type="date" min="${new Date().toISOString().slice(0, 10)}"><small class="muted">Use expiry for temporary access.</small></div><button class="btn btn-primary" type="submit">Create connection</button></form></div>';
  // openModal wires [data-close] through the lock guard (see modal.js), so the
  // Close button cannot dismiss the modal while the token is pending or shown.
  openModal(wrap);
  wrap.querySelector('form').onsubmit = async event => { event.preventDefault(); const form = event.target; const submit = form.querySelector('button[type="submit"]'); const scopes = form.scopes.value.split(',').map(scope => scope.trim()).filter(Boolean); if (!scopes.length) return; submit.disabled = true; wrap.dataset.locked = 'true'; try { const result = await createMcpConnection({ appName: form.appName.value, scopes, expiresAt: form.expiresAt.value ? new Date(`${form.expiresAt.value}T23:59:59`).toISOString() : null }); wrap.innerHTML = `<div class="modal"><div class="modal-header"><div><span class="eyebrow">Save this token now</span><h2 style="margin-top:5px">It will not be shown again.</h2></div></div><p>Copy this token into your MCP client. Elio stores only its hash.</p><div class="token-box"><code>${esc(result.token)}</code><button class="btn btn-secondary" data-copy-token>Copy token</button></div><button class="btn btn-primary" data-done-mcp>Done</button></div>`; wrap.querySelector('[data-copy-token]').onclick = async () => { await navigator.clipboard.writeText(result.token); toast('Token copied.'); }; wrap.querySelector('[data-done-mcp]').onclick = () => { wrap.remove(); done(); }; } catch (error) { submit.disabled = false; delete wrap.dataset.locked; toast(friendlyError(error, 'Elio could not create this MCP connection.')); } };
}

async function showMcpLog(connectionId, appName) {
  const wrap = document.createElement('div'); wrap.className = 'modal-backdrop'; wrap.innerHTML = `<div class="modal"><div class="modal-header"><div><span class="eyebrow">Access log</span><h2 style="margin-top:5px">${esc(appName)}</h2></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div><div data-mcp-log>${emptyState('Loading access log…', 'Fetching recent tool requests.')}</div></div>`; openModal(wrap); wrap.querySelector('[data-close]').onclick = () => wrap.remove(); try { const entries = await listMcpAccessLog(connectionId); wrap.querySelector('[data-mcp-log]').innerHTML = entries.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tool</th><th>Requested</th><th>Latency</th><th>Result</th></tr></thead><tbody>${entries.map(entry => `<tr><td><strong>${esc(entry.tool_name)}</strong></td><td>${esc(new Date(entry.requested_at).toLocaleString())}</td><td>${entry.latency_ms == null ? '—' : `${Number(entry.latency_ms)} ms`}</td><td><span class="badge ${entry.success ? 'green' : 'red'}">${entry.success ? 'Success' : 'Failed'}</span></td></tr>`).join('')}</tbody></table></div>` : emptyState('No requests recorded.', 'Tool activity will appear here after this connection is used.'); } catch (error) { wrap.querySelector('[data-mcp-log]').innerHTML = emptyState('The access log could not load.', friendlyError(error)); } }

async function renderConnections(b) {
  const apps = [
    { toolkit: 'gmail', name: 'Gmail', category: 'Communication', description: 'Search and summarize messages. Sending remains off until an approved workflow is added.' },
    { toolkit: 'googlecalendar', name: 'Google Calendar', category: 'Productivity', description: 'View events and availability. Creating or changing events remains off until approved.' },
    { toolkit: 'googlesheets', name: 'Google Sheets', category: 'Productivity', description: 'Discover spreadsheets and read data. Updates remain off until approved.' }
  ];
  const target = document.querySelector('#app-content');
  const workspaceCards = apps.map(app => `<section class="card" data-workspace-app="${app.toolkit}"><span class="eyebrow">${app.category}</span><h3 style="margin:8px 0">${app.name}</h3><p data-workspace-status>Checking connection…</p><p class="muted">${app.description}</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button class="btn btn-primary" data-workspace-connect>Connect ${app.name}</button><button class="btn btn-quiet" data-workspace-discover disabled>Discover read-only tools</button></div><pre data-workspace-tools hidden style="white-space:pre-wrap;margin-top:18px"></pre></section>`).join('');
  const providers = [['Outlook', 'Communication'], ['WhatsApp', 'Communication'], ['Stripe', 'Payments'], ['Paystack', 'Payments'], ['Google Drive', 'Productivity']];
  target.innerHTML = header('Connections', 'Connect Google Workspace apps through Composio. Elio keeps app credentials server-side and starts with read-only access.', '<button class="btn btn-quiet" data-refresh-workspace>Refresh connection statuses</button>') + `<section class="card" style="margin-bottom:18px"><span class="eyebrow">Google Workspace</span><h3 style="margin:8px 0">Connect the apps your business uses</h3><p>Choose an app, connect your Google account, approve access, then return to Elio. Each app shows its own verified status.</p></section><div class="content-grid">${workspaceCards}${providers.map(([name, category]) => `<section class="card"><span class="eyebrow">${category}</span><h3 style="margin:8px 0">${name}</h3><p>Connect ${name} when you are ready.</p><span class="badge" style="margin-top:18px">Coming soon</span></section>`).join('')}</div>`;
  const refresh = async () => {
    try {
      const result = await listWorkspaceConnections();
      apps.forEach(app => {
        const card = target.querySelector(`[data-workspace-app="${app.toolkit}"]`);
        const connection = result.toolkits?.[app.toolkit];
        const connected = Boolean(connection?.connection?.isActive);
        card.querySelector('[data-workspace-status]').textContent = connected ? `Connected through Composio. Read-only ${app.name} tools are available.` : `Not connected yet. Connect ${app.name} to authorize Elio.`;
        card.querySelector('[data-workspace-discover]').disabled = !connected;
      });
    } catch (error) {
      const message = friendlyError(error, String(error?.message || 'Connection status is unavailable.'));
      target.querySelectorAll('[data-workspace-status]').forEach(status => { status.textContent = message; });
    }
  };
  target.querySelectorAll('[data-workspace-app]').forEach(card => {
    const toolkit = card.dataset.workspaceApp;
    const name = apps.find(app => app.toolkit === toolkit).name;
    const connect = card.querySelector('[data-workspace-connect]');
    const discover = card.querySelector('[data-workspace-discover]');
    const output = card.querySelector('[data-workspace-tools]');
    connect.onclick = async () => {
      const authorizationTab = window.open('about:blank', '_blank');
      if (!authorizationTab) {
        card.querySelector('[data-workspace-status]').textContent = 'Elio could not open the authorization window. Allow popups for this site, then try again.';
        return;
      }
      authorizationTab.opener = null;
      connect.disabled = true;
      try {
        const result = await authorizeWorkspaceApp(toolkit);
        authorizationTab.location.replace(result.redirectUrl);
        card.querySelector('[data-workspace-status]').textContent = 'Authorization opened in a new tab. Return here after approving access, then refresh the page.';
      } catch (error) {
        authorizationTab.close();
        card.querySelector('[data-workspace-status]').textContent = friendlyError(error, String(error?.message || 'Elio could not start authorization.'));
      } finally {
        connect.disabled = false;
      }
    };
    discover.onclick = async () => { discover.disabled = true; output.hidden = false; output.textContent = `Discovering read-only ${name} tools…`; try { const result = await searchWorkspaceTools(toolkit, `show read-only ${name} tools`); output.textContent = JSON.stringify(result.result, null, 2); } catch (error) { output.textContent = friendlyError(error, 'Tool discovery failed.'); } finally { discover.disabled = false; } };
  });
  target.querySelector('[data-refresh-workspace]').onclick = refresh;
  await refresh();
}

/* ====================================================================
   ASK ELIO — AI assistant page
   A calm conversation surface: dark hero, quick prompts, a composer,
   and grounded answers from assistant-service.js.
   ==================================================================== */

const assistantPrompts = [
  ['What needs my attention today?', '◎', 'Priorities'],
  ['Which customers need follow-ups?', '♧', 'Customers'],
  ['Summarize my business activity.', '↗', 'Activity'],
  ['Which tasks are overdue?', '✓', 'Tasks']
];

let assistantHistory = []; // {question, answer, next_steps, sources, mode, time}

function assistantBubble(item, index) {
  return `<article class="assistant-turn" role="group" aria-label="Elio's answer ${index + 1}">
    <div class="assistant-turn-head">
      <span class="assistant-turn-mark" aria-hidden="true">e</span>
      <div class="assistant-turn-meta">
        <strong>Elio</strong>
        <small class="muted">${esc(item.time)} · ${item.mode === 'real' ? 'AI grounded in your workspace' : 'Workspace summary'}</small>
      </div>
      <button class="btn btn-quiet assistant-copy" data-copy-answer="${index}" type="button" aria-label="Copy this answer">⧉ Copy</button>
    </div>
    <p class="assistant-answer-text">${esc(item.answer)}</p>
    ${item.next_steps?.length ? `<div class="assistant-next"><strong>What to do next</strong><ul>${item.next_steps.slice(0,4).map(step=>`<li>${esc(step)}</li>`).join('')}</ul></div>` : ''}
    ${item.sources?.length ? `<div class="assistant-sources"><small class="muted">Grounded in</small>${item.sources.map(s=>`<span class="badge">${esc(s)}</span>`).join('')}</div>` : ''}
  </article>`;
}

async function renderAssistant(b){
  const brief=await buildDailyBrief(b.id);
  assistantHistory=[];
  document.querySelector('#app-content').innerHTML=header('Ask Elio','A calm place to understand what is happening behind your business.')+`
  <div class="assistant-layout">
    <section class="stack">
      <section class="card brief-card assistant-hero">
        <div>
          <span class="eyebrow" style="color:var(--elio-amber)">Quiet intelligence</span>
          <h2>What would be useful to know?</h2>
          <p>Elio reads your workspace and explains the next useful step. It will not change or send anything without your approval.</p>
        </div>
        <div class="mascot">e</div>
      </section>
      <div class="assistant-quick">
        <span class="eyebrow">Try asking</span>
        <div class="assistant-chips">
          ${assistantPrompts.map(([q,icon,label])=>`<button class="assistant-chip" data-prompt="${esc(q)}" type="button"><span class="assistant-chip-icon" aria-hidden="true">${icon}</span><span class="assistant-chip-text">${esc(q)}</span><span class="assistant-chip-tag">${label}</span></button>`).join('')}
        </div>
      </div>
      <section class="card assistant-conversation" aria-live="polite">
        <div data-answer>
          <div class="assistant-empty">
            <div class="mascot">e</div>
            <h3>Elio is ready.</h3>
            <p>Choose a prompt above or ask your own question. Answers are grounded in your live workspace data.</p>
          </div>
        </div>
      </section>
      <form data-assistant-form class="assistant-composer" aria-label="Ask Elio a question">
        <label class="sr-only" for="assistant-input">Your question for Elio</label>
        <textarea id="assistant-input" maxlength="1200" rows="1" placeholder="Ask Elio about your customers, tasks, approvals, or activity…" required></textarea>
        <div class="assistant-composer-foot">
          <small class="muted" data-question-count>0 / 1200</small>
          <span class="assistant-privacy"><span aria-hidden="true">🔒</span> Nothing is sent or changed without your approval.</span>
          <button class="btn btn-primary" type="submit">Ask Elio <span aria-hidden="true">↗</span></button>
        </div>
      </form>
    </section>
    <aside class="stack assistant-aside">
      <section class="card"><div class="section-title"><div><h3>What Elio sees</h3><p>Live workspace snapshot.</p></div><span class="badge blue">Live</span></div>
        <div class="assistant-facts">
          <div><strong>${brief.approvals.length}</strong><span>Pending approvals</span></div>
          <div><strong>${brief.followUps.length}</strong><span>Customer follow-ups</span></div>
          <div><strong>${brief.overdue.length}</strong><span>Overdue tasks</span></div>
        </div>
        <a class="btn btn-secondary" href="approvals.html" style="width:100%;margin-top:16px">Review approvals</a>
      </section>
      <section class="card"><div class="section-title"><h3>How Elio works</h3></div>
        <div class="list">
          <div class="list-item"><span class="avatar">1</span><div><strong>Observe</strong><p>Reads your current workspace data.</p></div></div>
          <div class="list-item"><span class="avatar">2</span><div><strong>Understand</strong><p>Connects status, dates, and activity.</p></div></div>
          <div class="list-item"><span class="avatar">3</span><div><strong>Recommend</strong><p>Suggests a next step for you to approve.</p></div></div>
        </div>
      </section>
    </aside>
  </div>`;
  // --- behavior wiring ---
  const form=document.querySelector('[data-assistant-form]');
  const input=document.querySelector('#assistant-input');
  const count=document.querySelector('[data-question-count]');
  const answer=document.querySelector('[data-answer]');
  const submit=form.querySelector('button[type=submit]');
  const draw=()=>{answer.innerHTML=assistantHistory.length?assistantHistory.map(assistantBubble).join(''):emptyState('Elio is ready.','Choose a prompt or ask your own question.');};
  const setQ=v=>{input.value=v;count.textContent=`${input.value.length} / 1200`;input.focus();};
  document.querySelectorAll('[data-prompt]').forEach(btn=>btn.onclick=()=>setQ(btn.dataset.prompt));
  input.oninput=()=>{count.textContent=`${input.value.length} / 1200`;input.style.height='auto';input.style.height=Math.min(input.scrollHeight,180)+'px';};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}};
  answer.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-copy-answer]');
    if(!btn)return;
    const item=assistantHistory[Number(btn.dataset.copyAnswer)];
    if(!item)return;
    try{await navigator.clipboard.writeText(item.answer);toast('Answer copied.');}
    catch{toast('Copy is not available here.');}
  });
  form.onsubmit=async e=>{
    e.preventDefault();
    const question=input.value.trim();
    if(!question)return;
    submit.disabled=true;
    answer.insertAdjacentHTML('beforeend','<div class="assistant-thinking" data-thinking><span class="mascot">e</span><div><strong>Elio is checking your workspace…</strong><p>Connecting the relevant details.</p></div></div>');
    answer.querySelector('[data-thinking]')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    try{
      const snapshot={tasks:[],approvals:[],customers:[],activities:[],overdue:[],followUps:brief.followUps};
      const result=await askAssistant({question,snapshot});
      assistantHistory.push({question,answer:result.answer,next_steps:result.next_steps||[],sources:result.sources||[],mode:result.mode,time:new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date())});
      draw();
      answer.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){
      assistantHistory.push({question,answer:friendlyError(error,'Elio could not answer yet. Try again in a moment.'),next_steps:[],sources:[],mode:'local',time:'now'});
      draw();
    }finally{
      submit.disabled=false;
      input.focus();
    }
  };
}

async function renderSettings(b){document.querySelector('#app-content').innerHTML=header('Settings','Shape how Elio fits into your business.')+`<section class="card"><form data-settings><div class="section-title"><div><h3>Business profile</h3><p>These details help Elio make better suggestions.</p></div><button class="btn btn-primary">Save changes</button></div><div class="content-grid"><div><div class="field"><label>Business name</label><input name="name" value="${esc(b.name)}" required></div><div class="field"><label>Industry</label><input name="industry" value="${esc(b.industry)}"></div></div><div><div class="field"><label>Business size</label><select name="size">${['Just me','2–5 people','6–20 people','21–50 people','50+'].map(x=>`<option ${x===b.size?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Communication style</label><select name="communication_style">${['Professional','Friendly','Casual','Formal'].map(x=>`<option ${x===b.communication_style?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Automation level</label><select name="automation_level">${['Manual','Assisted','Automated'].map(x=>`<option ${x===b.automation_level?'selected':''}>${x}</option>`).join('')}</select></div></div></div></form></section>`;document.querySelector('[data-settings]').onsubmit=async e=>{e.preventDefault();const f=e.target;const {error}=await supabase.from('businesses').update({name:f.name.value.trim(),industry:f.industry.value.trim(),size:f.size.value,communication_style:f.communication_style.value,automation_level:f.automation_level.value,updated_at:new Date().toISOString()}).eq('id',b.id);if(error){toast(friendlyError(error));return}await logActivity({businessId:b.id,action:'Updated Elio preferences',entityType:'business',entityId:b.id});toast('Settings saved.');};}

async function renderCustomers(b) {
  const customers = await listCustomers(b.id);
  document.querySelector('#app-content').innerHTML = header('Customers & leads', 'Keep every relationship visible, with the next useful note close at hand.', '<div class="header-actions"><button class="btn btn-quiet" data-add-lead>Add lead</button><button class="btn btn-primary" data-add-customer>Add customer</button></div>') + `<section class="card"><div class="toolbar"><input data-customer-search placeholder="Search name, company, email, or notes" aria-label="Search customers and leads"><select data-customer-status><option value="">All statuses</option><option>Lead</option><option>Active</option><option>Waiting</option><option>Needs Follow-Up</option><option>Inactive</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Person / company</th><th>Status</th><th>Last contact</th><th>Notes</th><th></th></tr></thead><tbody data-customer-list></tbody></table></div></section>`;
  const list = document.querySelector('[data-customer-list]');
  const draw = () => {
    const query = document.querySelector('[data-customer-search]').value.toLowerCase();
    const status = document.querySelector('[data-customer-status]').value;
    const rows = customers.filter(customer => (!query || `${customer.name} ${customer.company || ''} ${customer.email || ''} ${customer.notes || ''}`.toLowerCase().includes(query)) && (!status || customer.status === status));
    list.innerHTML = rows.length ? rows.map(customer => `<tr><td><button class="btn btn-quiet" data-view-customer="${customer.id}" style="padding:0;border:0;text-align:left"><strong>${esc(customer.name)}</strong><span class="muted">${esc(customer.company || customer.email || 'No company added')}</span></button></td><td><span class="badge ${customer.status === 'Lead' ? 'blue' : customer.status === 'Needs Follow-Up' ? 'amber' : customer.status === 'Inactive' ? 'red' : 'green'}">${esc(customer.status)}</span></td><td>${date(customer.last_contact_at)}</td><td><span class="muted">${esc(customer.notes || 'No notes yet')}</span></td><td><div class="header-actions"><button class="btn btn-secondary" data-follow-up="${customer.id}">Prepare follow-up</button><button class="btn btn-quiet" data-edit-customer="${customer.id}">Edit</button><button class="btn btn-danger" data-delete-customer="${customer.id}">Delete</button></div></td></tr>`).join('') : `<tr><td colspan="5">${emptyState('No customers or leads yet.', 'Add a relationship and keep the important context in one place.', '<button class="btn btn-primary" data-add-customer>Add customer</button>')}</td></tr>`;
    document.querySelectorAll('[data-view-customer]').forEach(button => button.onclick = () => customerDetailsModal(b, customers.find(customer => customer.id === button.dataset.viewCustomer), () => renderCustomers(b)));
    document.querySelectorAll('[data-edit-customer]').forEach(button => button.onclick = () => customerEditor(b, customers.find(customer => customer.id === button.dataset.editCustomer), () => renderCustomers(b)));document.querySelectorAll('[data-delete-customer]').forEach(button => button.onclick = async () => { if (!confirm('Delete this customer?')) return; try { const customer = customers.find(item => item.id === button.dataset.deleteCustomer); await deleteCustomer(customer.id, b.id); await logActivity({ businessId: b.id, action: `Deleted customer “${customer.name}”`, entityType: 'customer', entityId: customer.id }); toast('Customer removed.'); await renderCustomers(b); } catch (error) { toast(friendlyError(error, 'Elio could not remove this customer.')); } });
    document.querySelectorAll('[data-follow-up]').forEach(button => button.onclick = () => followUpModal(b, customers.find(customer => customer.id === button.dataset.followUp)));
  };
  draw();
  document.querySelector('[data-customer-search]').oninput = draw;
  document.querySelector('[data-customer-status]').onchange = draw;
  document.querySelectorAll('[data-add-customer]').forEach(button => button.onclick = () => customerEditor(b, null, () => renderCustomers(b), 'Active'));
  document.querySelectorAll('[data-add-lead]').forEach(button => button.onclick = () => customerEditor(b, null, () => renderCustomers(b), 'Lead'));
}

function customerEditor(b, customer, done, defaultStatus = 'Active') {
  const editing = Boolean(customer);
  const value = field => esc(customer?.[field] || '');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal"><div class="modal-header"><div><span class="eyebrow">${editing ? 'Edit record' : defaultStatus === 'Lead' ? 'New lead' : 'New customer'}</span><h2 style="margin-top:5px">${editing ? 'Keep the details current.' : 'Add a relationship.'}</h2></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div><form><div class="field"><label for="crm-name">Name</label><input id="crm-name" name="name" value="${value('name')}" required></div><div class="field"><label for="crm-email">Email</label><input id="crm-email" name="email" type="email" value="${value('email')}"></div><div class="field"><label for="crm-phone">Phone</label><input id="crm-phone" name="phone" value="${value('phone')}"></div><div class="field"><label for="crm-company">Company</label><input id="crm-company" name="company" value="${value('company')}"></div><div class="field"><label for="crm-source">Lead source</label><input id="crm-source" name="lead_source" value="${value('lead_source')}" placeholder="Referral, website, event…"></div><div class="field"><label for="crm-status">Status</label><select id="crm-status" name="status">${['Lead','Active','Waiting','Needs Follow-Up','Inactive'].map(status => `<option ${status === (customer?.status || defaultStatus) ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="field"><label for="crm-last-contact">Last contact</label><input id="crm-last-contact" name="last_contact_at" type="date" value="${customer?.last_contact_at ? customer.last_contact_at.slice(0, 10) : ''}"></div><div class="field"><label for="crm-notes">Notes</label><textarea id="crm-notes" name="notes" placeholder="Useful context, preferences, or the next thing to remember…">${value('notes')}</textarea></div><button class="btn btn-primary" type="submit">${editing ? 'Save details' : defaultStatus === 'Lead' ? 'Add lead' : 'Add customer'}</button></form></div>`;
  openModal(wrap);
  wrap.querySelector('[data-close]').onclick = () => wrap.remove();
  wrap.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    const record = { name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(), company: form.company.value.trim(), lead_source: form.lead_source.value.trim(), status: form.status.value, last_contact_at: form.last_contact_at.value || null, notes: form.notes.value.trim() };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (editing) {
        await updateCustomer(customer.id, b.id, record);
        await logActivity({ businessId: b.id, action: `Updated customer “${record.name}”`, entityType: 'customer', entityId: customer.id });
      } else {
        const created = await createCustomer({ ...record, business_id: b.id });
        await logActivity({ businessId: b.id, action: `Added ${record.status === 'Lead' ? 'lead' : 'customer'} “${record.name}”`, entityType: 'customer', entityId: created.id });
      }
      wrap.remove(); toast(editing ? 'Customer details saved.' : record.status === 'Lead' ? 'Lead added.' : 'Customer added.'); done();
    } catch (error) { button.disabled = false; toast(friendlyError(error, 'Elio could not save this customer record.')); }
  };
}

function customerDetailsModal(b, customer, done) {
  if (!customer) return;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal"><div class="modal-header"><div><span class="eyebrow">Customer details</span><h2 style="margin-top:5px">${esc(customer.name)}</h2><p>${esc(customer.company || customer.email || 'No company added')}</p></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div><div class="list" style="margin-bottom:20px"><div class="list-item"><span class="muted">Status</span><span class="badge ${customer.status === 'Lead' ? 'blue' : 'green'}">${esc(customer.status)}</span></div><div class="list-item"><span class="muted">Email</span><strong>${esc(customer.email || 'Not added')}</strong></div><div class="list-item"><span class="muted">Phone</span><strong>${esc(customer.phone || 'Not added')}</strong></div><div class="list-item"><span class="muted">Last contact</span><strong>${date(customer.last_contact_at)}</strong></div><div class="list-item" style="display:block"><span class="muted">Notes</span><p style="white-space:pre-line;margin-top:8px">${esc(customer.notes || 'No notes yet.')}</p></div></div><div class="header-actions"><button class="btn btn-primary" data-edit>Edit details</button><button class="btn btn-secondary" data-follow>Prepare follow-up</button><button class="btn btn-danger" data-delete>Delete</button></div></div>`;
  openModal(wrap);
  wrap.querySelector('[data-close]').onclick = () => wrap.remove();
  wrap.querySelector('[data-edit]').onclick = () => { wrap.remove(); customerEditor(b, customer, done); };
  wrap.querySelector('[data-follow]').onclick = () => { wrap.remove(); followUpModal(b, customer); };
  wrap.querySelector('[data-delete]').onclick = async () => { if (!confirm(`Delete ${customer.name}?`)) return; try { await deleteCustomer(customer.id, b.id); await logActivity({ businessId: b.id, action: `Deleted customer “${customer.name}”`, entityType: 'customer', entityId: customer.id }); wrap.remove(); toast('Customer removed.'); done(); } catch (error) { toast(friendlyError(error, 'Elio could not remove this record.')); } };
}

async function renderWorkflowsMvp(b) {
  const target = document.querySelector('#app-content');
  target.innerHTML = header('Workflows', 'Simple routines for the work you repeat.') + '<section class="card">' + emptyState('Elio is checking your workflows…', 'Loading your workflow templates.') + '</section>';
  const { data, error } = await supabase.from('workflows').select('*').eq('business_id', b.id).order('created_at');
  if (error) throw error;
  const workflows = data || [];
  const cards = workflows.map(workflow => '<section class="card"><div class="section-title"><span class="badge ' + (workflow.is_active ? 'green' : '') + '">' + (workflow.is_active ? 'Active' : 'Paused') + '</span><button class="btn ' + (workflow.is_active ? 'btn-quiet' : 'btn-secondary') + '" data-workflow-toggle="' + workflow.id + '">' + (workflow.is_active ? 'Pause' : 'Activate') + '</button></div><h3>' + esc(workflow.name) + '</h3><p style="margin:9px 0 18px">' + esc(workflow.description) + '</p><p class="muted"><strong>Trigger:</strong> ' + esc(workflow.trigger_type) + '<br><strong>Action:</strong> ' + esc(workflow.action_type) + '<br><strong>Approval:</strong> ' + (workflow.approval_required ? 'Required' : 'Not required') + '</p></section>').join('');
  target.innerHTML = header('Workflows', 'Simple routines for the work you repeat.') + '<section class="card" style="margin-bottom:20px"><span class="eyebrow">MVP testing</span><h3 style="margin-top:7px">Activation records your preference.</h3><p>These templates are being tested and do not run automatic actions yet.</p></section>' + (workflows.length ? '<div class="content-grid">' + cards + '</div>' : '<section class="card">' + emptyState('No workflow templates yet.', 'Complete onboarding to add Elio’s recommended templates.') + '</section>');
  document.querySelectorAll('[data-workflow-toggle]').forEach(button => {
    button.onclick = async () => {
      const workflow = workflows.find(item => item.id === button.dataset.workflowToggle);
      if (!workflow) return;
      button.disabled = true;
      button.textContent = workflow.is_active ? 'Pausing…' : 'Activating…';
      try {
        const { data: updated, error: updateError } = await supabase.from('workflows').update({ is_active: !workflow.is_active, updated_at: new Date().toISOString() }).eq('id', workflow.id).eq('business_id', b.id).select().single();
        if (updateError) throw updateError;
        try {
          await logActivity({ businessId: b.id, action: (updated.is_active ? 'Activated' : 'Paused') + ' workflow “' + updated.name + '”', entityType: 'workflow', entityId: updated.id, metadata: { previous_active: workflow.is_active, new_active: updated.is_active, mvp_testing: true } });
        } catch (activityError) {
          toast('Workflow updated, but Elio could not save the activity record.');
        }
        toast(updated.is_active ? 'Workflow activated for MVP testing.' : 'Workflow paused.');
        await renderWorkflowsMvp(b);
      } catch (updateError) {
        button.disabled = false;
        button.textContent = workflow.is_active ? 'Pause' : 'Activate';
        toast(friendlyError(updateError, 'Elio could not update this workflow.'));
      }
    };
  });
}

async function renderAssistantMvp(b) {
/*
  const target = document.querySelector('#app-content');
  target.innerHTML = header('Ask Elio', 'A calm, focused view of what is happening behind your business.') + '<section class="card">' + emptyState('Elio is checking your workspace…', 'Gathering tasks, customers, approvals, and recent activity.') + '</section>';
  const [tasks, approvals, customers, activities] = await Promise.all([listTasks(b.id), listApprovals(b.id), listCustomers(b.id), listActivities(b.id, 30)]);
  const today = new Date().toISOString().slice(0, 10);
  const snapshot = { tasks, approvals, customers, activities, overdue: tasks.filter(task => task.status !== 'Completed' && task.due_date && task.due_date < today), followUps: customers.filter(customer => customer.status === 'Needs Follow-Up' || (customer.last_contact_at && Date.now() - new Date(customer.last_contact_at).getTime() > 7 * 86400000)) };
  target.innerHTML = header('Ask Elio', 'Ask about your work. Get a clear answer grounded in your workspace data.') + '<div class="content-grid assistant-layout"><section class="card assistant-card"><div class="brief-card assistant-hero"><div><span class="eyebrow" style="color:var(--elio-amber)">Quiet intelligence</span><h2>What would be useful to know?</h2><p>Elio reads your workspace and explains the next useful step. It will not change or send anything without your approval.</p></div><div class="mascot">e</div></div><div class="assistant-suggestions"><span class="eyebrow">Try asking</span><div class="option-grid"><button class="option" data-prompt="What needs my attention today?">What needs my attention today?</button><button class="option" data-prompt="Which customers need follow-ups?">Which customers need follow-ups?</button><button class="option" data-prompt="Summarize my recent activity.">Summarize my recent activity.</button><button class="option" data-prompt="Which tasks are overdue?">Which tasks are overdue?</button></div></div><div class="assistant-answer" data-answer aria-live="polite"><div class="empty" style="padding:28px 10px"><div class="mascot">e</div><h3>Elio is ready.</h3><p>Choose a prompt or ask your own question.</p></div></div><form data-assistant-form class="assistant-form"><label class="sr-only" for="assistant-input">Ask Elio a question</label><textarea id="assistant-input" maxlength="1200" placeholder="Ask Elio about your customers, tasks, approvals, or activity…" required></textarea><div class="assistant-form-footer"><small class="muted" data-question-count>0 / 1200</small><button class="btn btn-primary" type="submit">Ask Elio <span aria-hidden="true">↗</span></button></div></form></section><aside class="stack"><section class="card"><div class="section-title"><h3>What Elio knows</h3><span class="badge blue">Live data</span></div><div class="metric-grid assistant-metrics"><div class="metric"><strong>${snapshot.tasks.filter(task => task.status !== 'Completed').length}</strong><span>Active tasks</span></div><div class="metric"><strong>${snapshot.followUps.length}</strong><span>Follow-ups</span></div><div class="metric"><strong>${snapshot.approvals.filter(item => item.status === 'Pending').length}</strong><span>Approvals</span></div></div></section><section class="card"><div class="section-title"><h3>How Elio thinks</h3></div><div class="list"><div class="list-item"><span class="avatar">1</span><div><strong>Observe</strong><p>Reads your current workspace data.</p></div></div><div class="list-item"><span class="avatar">2</span><div><strong>Understand</strong><p>Connects status, dates, and activity.</p></div></div><div class="list-item"><span class="avatar">3</span><div><strong>Recommend</strong><p>Suggests a next step for you to approve.</p></div></div></div></section></aside></div>';
  const input = document.querySelector('#assistant-input');
  const count = document.querySelector('[data-question-count]');
  const answer = document.querySelector('[data-answer]');
  const setQuestion = value => { input.value = value; count.textContent = value.length + ' / 1200'; input.focus(); };
  input.oninput = () => { count.textContent = input.value.length + ' / 1200'; };
  document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => setQuestion(button.dataset.prompt));
  document.querySelector('[data-assistant-form]').onsubmit = async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.innerHTML = 'Elio is thinking…';
    answer.innerHTML = '<div class="assistant-thinking"><span class="mascot">e</span><div><strong>Elio is checking your workspace…</strong><p>Connecting the relevant details.</p></div></div>';
    try {
      const result = await askAssistant({ question, snapshot });
      answer.innerHTML = '<div class="assistant-response"><div class="section-title"><div><span class="eyebrow">Elio’s answer</span><h3 style="margin-top:6px">Here’s what I found.</h3></div><span class="badge ' + (result.mode === 'real' ? 'blue' : 'amber') + '">' + (result.mode === 'real' ? 'AI grounded' : 'Local workspace mode') + '</span></div><p class="assistant-answer-text">' + esc(result.answer) + '</p><div class="assistant-next"><strong>Useful next steps</strong><ul>' + result.next_steps.map(step => '<li>' + esc(step) + '</li>').join('') + '</ul></div><div class="assistant-sources">' + result.sources.map(source => '<span class="badge">' + esc(source) + '</span>').join('') + '</div></div>';
    } catch (error) {
      answer.innerHTML = '<div class="card" style="background:var(--danger-light);border-color:transparent"><strong>Elio could not answer that yet.</strong><p style="margin-top:8px">' + esc(friendlyError(error, 'Try again or ask about tasks, customers, approvals, or activity.')) + '</p><button class="btn btn-secondary" data-retry style="margin-top:16px">Try again</button></div>';
      answer.querySelector('[data-retry]').onclick = () => event.target.requestSubmit();
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Ask Elio <span aria-hidden="true">↗</span>';
    }
  };
}

*/
}

async function renderProducts(b) {
  const target = document.querySelector('#app-content');
  target.innerHTML = header('Products', 'Keep your catalog, inventory, and sales view in one calm place.') + '<section class="card">' + emptyState('Elio is checking your products…', 'Loading your product catalog.') + '</section>';
  const products = await listProducts(b.id);
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort();
  const revenue = products.reduce((total, product) => total + Number(product.selling_price || 0) * Number(product.sales || 0), 0);
  const inventory = products.reduce((total, product) => total + Number(product.stock || 0), 0);
  const cards = products.map(product => '<article class="card product-card"><div class="section-title"><span class="badge ' + (product.stock === 0 ? 'red' : product.stock < 5 ? 'amber' : 'green') + '">' + (product.stock === 0 ? 'Out of stock' : product.stock < 5 ? 'Low stock' : 'In stock') + '</span><div class="header-actions"><button class="btn btn-quiet" data-edit-product="' + product.id + '">Edit</button><button class="btn btn-danger" data-delete-product="' + product.id + '">Delete</button></div></div><h3>' + esc(product.name) + '</h3><p class="muted product-category">' + esc(product.category || 'Uncategorized') + '</p><p class="product-description">' + esc(product.description || 'No description added.') + '</p><div class="product-metrics"><div><strong>' + Number(product.stock || 0) + '</strong><span>Stock</span></div><div><strong>' + Number(product.sales || 0) + '</strong><span>Sales</span></div><div><strong>' + Number(product.selling_price || 0).toFixed(2) + '</strong><span>Selling price</span></div></div><div class="product-footer"><span>Cost ' + Number(product.cost || 0).toFixed(2) + '</span><span>Margin ' + (Number(product.selling_price || 0) - Number(product.cost || 0)).toFixed(2) + '</span></div></article>').join('');
  target.innerHTML = header('Products', 'Keep your catalog, inventory, and sales view in one calm place.', '<button class="btn btn-primary" data-add-product>Add product</button>') + '<section class="metric-grid product-summary"><div class="metric"><strong>' + products.length + '</strong><span>Products</span></div><div class="metric"><strong>' + inventory + '</strong><span>Units in stock</span></div><div class="metric"><strong>' + revenue.toFixed(2) + '</strong><span>Recorded sales value</span></div></section><section class="card"><div class="toolbar"><input data-product-search placeholder="Search products" aria-label="Search products"><select data-product-category><option value="">All categories</option>' + categories.map(category => '<option>' + esc(category) + '</option>').join('') + '</select></div><div class="product-grid" data-product-list>' + (cards || emptyState('No products yet.', 'Add your first product to start tracking stock and sales.', '<button class="btn btn-primary" data-add-product>Add product</button>')) + '</div></section>';
  const list = document.querySelector('[data-product-list]');
  const draw = () => { const query = document.querySelector('[data-product-search]').value.toLowerCase(); const category = document.querySelector('[data-product-category]').value; list.innerHTML = products.filter(product => (!query || (product.name + ' ' + product.category + ' ' + product.description).toLowerCase().includes(query)) && (!category || product.category === category)).map(product => '<article class="card product-card"><div class="section-title"><span class="badge ' + (product.stock === 0 ? 'red' : product.stock < 5 ? 'amber' : 'green') + '">' + (product.stock === 0 ? 'Out of stock' : product.stock < 5 ? 'Low stock' : 'In stock') + '</span><div class="header-actions"><button class="btn btn-quiet" data-edit-product="' + product.id + '">Edit</button><button class="btn btn-danger" data-delete-product="' + product.id + '">Delete</button></div></div><h3>' + esc(product.name) + '</h3><p class="muted product-category">' + esc(product.category || 'Uncategorized') + '</p><p class="product-description">' + esc(product.description || 'No description added.') + '</p><div class="product-metrics"><div><strong>' + Number(product.stock || 0) + '</strong><span>Stock</span></div><div><strong>' + Number(product.sales || 0) + '</strong><span>Sales</span></div><div><strong>' + Number(product.selling_price || 0).toFixed(2) + '</strong><span>Selling price</span></div></div><div class="product-footer"><span>Cost ' + Number(product.cost || 0).toFixed(2) + '</span><span>Margin ' + (Number(product.selling_price || 0) - Number(product.cost || 0)).toFixed(2) + '</span></div></article>').join('') || emptyState('No matching products.', 'Try a different search or category.'); bind(); };
  const bind = () => { document.querySelectorAll('[data-edit-product]').forEach(button => button.onclick = () => productEditor(b, products.find(product => product.id === button.dataset.editProduct), () => renderProducts(b))); document.querySelectorAll('[data-delete-product]').forEach(button => button.onclick = async () => { const product = products.find(item => item.id === button.dataset.deleteProduct); if (!product || !confirm('Delete ' + product.name + '?')) return; try { await deleteProduct(product.id, b.id); await logActivity({ businessId: b.id, action: 'Deleted product ' + product.name, entityType: 'product', entityId: product.id }); toast('Product deleted.'); await renderProducts(b); } catch (error) { toast(friendlyError(error, 'Elio could not delete this product.')); } }); document.querySelectorAll('[data-add-product]').forEach(button => button.onclick = () => productEditor(b, null, () => renderProducts(b))); };
  document.querySelector('[data-product-search]').oninput = draw; document.querySelector('[data-product-category]').onchange = draw; bind();
}

function productEditor(b, product, done) {
  const editing = Boolean(product); const value = field => esc(product?.[field] ?? ''); const wrap = document.createElement('div'); wrap.className = 'modal-backdrop';
  wrap.innerHTML = '<div class="modal"><div class="modal-header"><div><span class="eyebrow">' + (editing ? 'Edit product' : 'New product') + '</span><h2 style="margin-top:5px">' + (editing ? 'Keep the product details current.' : 'Add a product to your catalog.') + '</h2></div><button class="btn btn-quiet" data-close aria-label="Close">×</button></div><form><div class="field"><label for="product-name">Name</label><input id="product-name" name="name" value="' + value('name') + '" required></div><div class="field"><label for="product-category">Category</label><input id="product-category" name="category" value="' + value('category') + '" placeholder="e.g. Services, Apparel, Food"></div><div class="content-grid"><div class="field"><label for="product-cost">Cost</label><input id="product-cost" name="cost" type="number" min="0" step="0.01" value="' + value('cost') + '" required></div><div class="field"><label for="product-price">Selling price</label><input id="product-price" name="selling_price" type="number" min="0" step="0.01" value="' + value('selling_price') + '" required></div></div><div class="content-grid"><div class="field"><label for="product-stock">Stock</label><input id="product-stock" name="stock" type="number" min="0" step="1" value="' + value('stock') + '" required></div><div class="field"><label for="product-sales">Recorded sales</label><input id="product-sales" name="sales" type="number" min="0" step="1" value="' + value('sales') + '" required></div></div><div class="field"><label for="product-description">Description</label><textarea id="product-description" name="description" placeholder="What should the team remember about this product?">' + value('description') + '</textarea></div><button class="btn btn-primary" type="submit">' + (editing ? 'Save product' : 'Add product') + '</button></form></div>';
  openModal(wrap); wrap.querySelector('[data-close]').onclick = () => wrap.remove(); wrap.querySelector('form').onsubmit = async event => { event.preventDefault(); const form = event.target; const record = { name: form.name.value.trim(), category: form.category.value.trim(), cost: Math.max(0, Number(form.cost.value) || 0), selling_price: Math.max(0, Number(form.selling_price.value) || 0), stock: Math.max(0, Math.floor(Number(form.stock.value) || 0)), sales: Math.max(0, Math.floor(Number(form.sales.value) || 0)), description: form.description.value.trim() }; const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; try { if (editing) { await updateProduct(product.id, b.id, record); await logActivity({ businessId: b.id, action: 'Updated product ' + record.name, entityType: 'product', entityId: product.id }); } else { const created = await createProduct({ ...record, business_id: b.id }); await logActivity({ businessId: b.id, action: 'Added product ' + record.name, entityType: 'product', entityId: created.id }); } wrap.remove(); toast(editing ? 'Product updated.' : 'Product added.'); await done(); } catch (error) { submit.disabled = false; toast(friendlyError(error, 'Elio could not save this product.')); } };
}

const showBootError = error => {
  const message = friendlyError(error, 'Elio could not load your workspace. Please refresh and try again.');
  document.body.classList.add('elio-ready');
  const bootStatus = document.querySelector('#boot-status');
  const html = `<section class="card"><div class="empty"><div class="mascot">e</div><h3>Elio needs a moment.</h3><p>${message}</p><button class="btn btn-secondary" onclick="location.reload()" style="margin-top:18px">Try again</button></div></section>`;
  if (bootStatus) bootStatus.innerHTML = html;
  else document.body.innerHTML = `<main class="main-content">${html}</main>`;
};

let session;
try {
  session = await requireSession();
  if (session) {
    const business = await getBusiness();
    if (!business) window.location.href = 'onboarding.html'; else await boot(business);
  }
} catch (error) {
  showBootError(error);
}
