import { supabase, requireSession, ensureProfile, friendlyError } from './supabase-client.js';
import { logActivity } from './activity-service.js';

const session = await requireSession({ redirect: 'login.html' });
if (session) {
  const form = document.querySelector('#onboarding-form'); const steps = [...document.querySelectorAll('[data-step]')]; let step = 1;
  const state = { businessName:'', industry:'', size:'', helpAreas:[], communicationStyle:'Friendly', automationLevel:'Assisted' };
  const show = n => { steps.forEach(el => el.hidden = Number(el.dataset.step) !== n); document.querySelectorAll('.step-dot').forEach((el,i)=>el.classList.toggle('active',i<n)); step=n; };
  const setMessage = text => { const el=document.querySelector('[data-message]'); if(el) el.textContent=text; };
  document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click',()=>{
    const key=button.dataset.choice; const value=button.dataset.value;
    if(key==='helpAreas'){ if(state.helpAreas.includes(value)){state.helpAreas=state.helpAreas.filter(x=>x!==value);button.classList.remove('selected')}else{state.helpAreas.push(value);button.classList.add('selected')} }
    else { state[key]=value; button.parentElement.querySelectorAll('[data-choice]').forEach(x=>x.classList.remove('selected')); button.classList.add('selected'); }
  }));
  document.querySelectorAll('[data-next]').forEach(btn=>btn.addEventListener('click',()=>{
    if(step===2){state.businessName=form.businessName.value.trim();state.industry=form.industry.value.trim();if(!state.businessName||!state.industry||!state.size){setMessage('Add your business details and choose a team size to continue.');return}}
    if(step===3&&!state.helpAreas.length){setMessage('Choose at least one area where Elio can help.');return} setMessage(''); show(Math.min(5,step+1));
  }));
  document.querySelectorAll('[data-back]').forEach(btn=>btn.addEventListener('click',()=>show(Math.max(1,step-1))));
  form.addEventListener('submit',async event=>{event.preventDefault();const btn=form.querySelector('[type=submit]');btn.disabled=true;setMessage('Elio is setting up your workspace…');try{
    await ensureProfile(session.user, session.user.user_metadata?.full_name || '');
    const {data:business,error}=await supabase.from('businesses').upsert({owner_id:session.user.id,name:state.businessName,industry:state.industry,size:state.size,help_areas:state.helpAreas,communication_style:state.communicationStyle,automation_level:state.automationLevel},{onConflict:'owner_id'}).select().single();if(error)throw error;
    await supabase.rpc('seed_elio_workflows',{target_business_id:business.id}); await logActivity({businessId:business.id,actor:'System',action:'Completed onboarding',entityType:'business',entityId:business.id}); window.location.href='dashboard.html';
  }catch(error){setMessage(friendlyError(error,'Elio could not save your setup. Please try again.'));btn.disabled=false}}); show(1);
}
