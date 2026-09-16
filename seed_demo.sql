-- Optional development seed. Run only after signing in and completing onboarding.
-- It creates sample records in the currently authenticated user's business.
-- Do not run this against a customer workspace.
do $$
declare b uuid; c1 uuid; c2 uuid; t1 uuid;
begin
  select id into b from public.businesses where owner_id = auth.uid();
  if b is null then raise exception 'Complete onboarding first.'; end if;
  insert into public.customers (business_id,name,email,company,status,last_contact_at,notes) values
    (b,'Sarah Johnson','sarah@example.com','Acme Limited','Needs Follow-Up',now()-interval '9 days','Asked for a proposal.'),
    (b,'Jordan Lee','jordan@example.com','Bright Media','Active',now()-interval '2 days','Current client.')
    returning id into c1;
  select id into c2 from public.customers where business_id=b and email='jordan@example.com';
  insert into public.tasks (business_id,customer_id,title,description,status,priority,source,due_date,created_by)
    values (b,c1,'Follow up on proposal','Check whether Acme has questions.','Needs Attention','High','Elio',current_date,auth.uid()) returning id into t1;
  insert into public.approvals (business_id,task_id,customer_id,action_type,title,description,content)
    values (b,t1,c1,'Follow-Up','Send follow-up to Sarah Johnson','A customer has not responded in 9 days.','{"subject":"Following up on your proposal","message":"Hi Sarah, I wanted to follow up on the proposal and see if any questions came up.","suggested_action":"Review and send when ready."}');
  insert into public.activities (business_id,actor,action,entity_type,entity_id) values (b,'System','Loaded development seed data','business',b);
end $$;
