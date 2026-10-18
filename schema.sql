-- SSEPD MBPY CRM : Supabase schema + RLS + RPCs.  Run once in SQL Editor.
create extension if not exists pgcrypto;

create table profiles(
  id uuid primary key references auth.users on delete cascade,
  full_name text, employee_code text unique, mobile text, email text,
  role text not null default 'employee' check(role in('admin','employee')),
  is_active boolean not null default true, created_at timestamptz default now());

create table beneficiaries(
  id uuid primary key default gen_random_uuid(),
  application_id text not null unique, application_number text unique,
  district text, application_status text, rejection_reason text, pension_type text, photo text,
  applicant_name text, father_spouse_name text, dob text, age text, gender text, mobile_no text,
  social_category text, sub_division text, address_type text, block text, gp text, village text,
  habitation text, pin text, created_at timestamptz default now());
-- Sensitive columns live in their own admin-only table (RLS is row-level, so this is the safe split)
create table beneficiary_sensitive(
  beneficiary_id uuid primary key references beneficiaries on delete cascade,
  aadhaar_number text, account_holder_name text, account_number text, ifsc_code text, branch_name text);

create table leads(
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null unique references beneficiaries on delete cascade,
  assigned_to uuid references profiles, assigned_at timestamptz,
  status text not null default 'call_pending' check(status in('call_pending','call_connected','lead_generated','documents_received','payment_received','completed')),
  connected_at timestamptz, lead_generated_at timestamptz, documents_at timestamptz, payment_at timestamptz, completed_at timestamptz,
  created_at timestamptz default now());
create table lead_assignments(
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references leads on delete cascade,
  employee_id uuid not null references profiles, assigned_by uuid references profiles,
  assigned_at timestamptz default now(), ended_at timestamptz);
create unique index one_active_assignment on lead_assignments(lead_id) where ended_at is null;

create table call_history(
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references leads on delete cascade,
  employee_id uuid not null references profiles,
  outcome text not null check(outcome in('Connected','Not Connected','Busy','Call Back','Wrong Number','Not Interested','Interested','Documents Pending','Payment Pending')),
  called_at timestamptz not null default now(), notes text, next_followup timestamptz, created_at timestamptz default now());
create table transfer_history(
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references leads,
  application_id text, from_employee uuid references profiles, to_employee uuid references profiles,
  reason text, transferred_by uuid references profiles, transferred_at timestamptz default now());
create table document_status(
  lead_id uuid primary key references leads on delete cascade,
  status text not null default 'Documents Not Received' check(status in('Documents Not Received','Documents Partially Received','Documents Received','Documents Verified')),
  checklist jsonb not null default '{}', updated_by uuid references profiles, updated_at timestamptz default now());
create table payment_records(
  id uuid primary key default gen_random_uuid(), lead_id uuid not null unique references leads on delete cascade,
  status text not null default 'Pending' check(status in('Pending','Received','Failed','Refunded')),
  amount numeric(12,2), paid_on date, mode text, reference text, notes text,
  verified boolean not null default false, verified_by uuid references profiles, verified_at timestamptz,
  recorded_by uuid references profiles, updated_at timestamptz default now());
create table follow_ups(
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references leads on delete cascade,
  employee_id uuid not null references profiles, due_at timestamptz not null, note text,
  done boolean not null default false, created_at timestamptz default now());
create table audit_logs(
  id bigserial primary key, actor uuid, action text, entity text, entity_id text, details jsonb, at timestamptz default now());
create table settings(key text primary key, value jsonb);
insert into settings values('doc_checklist','["Aadhaar copy","Bank passbook","Passport photo","Age/Disability proof","Rejection letter"]');

create index on beneficiaries(district,block,gp,village);
create index on beneficiaries(application_status);
create index on leads(assigned_to,status);
create index on call_history(lead_id,called_at desc);
create index on call_history(employee_id,called_at);
create index on follow_ups(employee_id,due_at) where not done;
create index on transfer_history(lead_id);

-- ---------- helpers ----------
create function is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id=auth.uid() and role='admin' and is_active) $$;
create function is_active_user() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id=auth.uid() and is_active) $$;
create function my_lead(l uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from leads where id=l and assigned_to=auth.uid()) and is_active_user() $$;
create function audit(a text,e text,i text,d jsonb default '{}') returns void language sql security definer set search_path=public as
$$ insert into audit_logs(actor,action,entity,entity_id,details) values(auth.uid(),a,e,i,d) $$;
revoke execute on function audit(text,text,text,jsonb) from public,anon,authenticated;

-- new auth user -> employee profile (role can NEVER be set from client metadata)
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,employee_code,mobile,email)
 values(new.id,new.raw_user_meta_data->>'full_name',nullif(new.raw_user_meta_data->>'employee_code',''),new.raw_user_meta_data->>'mobile',new.email);
 return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- rejected application => lead
create function make_lead() returns trigger language plpgsql security definer set search_path=public as $$
begin if lower(coalesce(new.application_status,'')) like '%reject%' then
  insert into leads(beneficiary_id) values(new.id) on conflict do nothing; end if; return new; end $$;
create trigger ben_lead after insert or update of application_status on beneficiaries for each row execute function make_lead();

-- ---------- RLS ----------
alter table profiles enable row level security; alter table beneficiaries enable row level security;
alter table beneficiary_sensitive enable row level security; alter table leads enable row level security;
alter table lead_assignments enable row level security; alter table call_history enable row level security;
alter table transfer_history enable row level security; alter table document_status enable row level security;
alter table payment_records enable row level security; alter table follow_ups enable row level security;
alter table audit_logs enable row level security; alter table settings enable row level security;

create policy p_sel on profiles for select using(id=auth.uid() or is_admin());
create policy p_adm on profiles for update using(is_admin()) with check(is_admin());
create policy b_adm on beneficiaries for all using(is_admin()) with check(is_admin());
create policy b_emp on beneficiaries for select using(is_active_user() and exists(select 1 from leads l where l.beneficiary_id=beneficiaries.id and l.assigned_to=auth.uid()));
create policy s_adm on beneficiary_sensitive for all using(is_admin()) with check(is_admin());
create policy l_adm on leads for select using(is_admin());
create policy l_emp on leads for select using(assigned_to=auth.uid() and is_active_user());
create policy la_adm on lead_assignments for select using(is_admin());
create policy c_sel on call_history for select using(is_admin() or my_lead(lead_id));
create policy t_adm on transfer_history for select using(is_admin());
create policy d_sel on document_status for select using(is_admin() or my_lead(lead_id));
create policy pay_sel on payment_records for select using(is_admin() or my_lead(lead_id));
create policy f_sel on follow_ups for select using(is_admin() or (employee_id=auth.uid() and is_active_user()));
create policy a_adm on audit_logs for select using(is_admin());
create policy set_sel on settings for select using(is_admin() or (key='doc_checklist' and is_active_user()));
create policy set_adm on settings for all using(is_admin()) with check(is_admin());
-- No INSERT/UPDATE/DELETE policies exist for employees anywhere: every employee write goes through the RPCs below.

-- ---------- RPCs (all re-check role/ownership server-side) ----------
create function rpc_import_beneficiaries(p_rows jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare n int; tot int:=jsonb_array_length(p_rows);
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 with src as (select * from jsonb_to_recordset(p_rows) as x(district text,application_id text,application_number text,application_status text,
   rejection_reason text,pension_type text,photo text,applicant_name text,father_spouse_name text,dob text,age text,gender text,aadhaar_number text,
   mobile_no text,social_category text,sub_division text,address_type text,block text,gp text,village text,habitation text,pin text,
   account_holder_name text,account_number text,ifsc_code text,branch_name text) where coalesce(application_id,'')<>''),
 ib as (insert into beneficiaries(district,application_id,application_number,application_status,rejection_reason,pension_type,photo,applicant_name,
   father_spouse_name,dob,age,gender,mobile_no,social_category,sub_division,address_type,block,gp,village,habitation,pin)
   select district,application_id,nullif(application_number,''),application_status,rejection_reason,pension_type,photo,applicant_name,
   father_spouse_name,dob,age,gender,mobile_no,social_category,sub_division,address_type,block,gp,village,habitation,pin from src
   on conflict do nothing returning id,application_id)
 insert into beneficiary_sensitive select ib.id,s.aadhaar_number,s.account_holder_name,s.account_number,s.ifsc_code,s.branch_name
   from ib join src s using(application_id) on conflict do nothing;
 get diagnostics n=row_count;
 perform audit('import','beneficiaries',null,jsonb_build_object('rows',tot,'inserted',n));
 return jsonb_build_object('total',tot,'inserted',n,'duplicates_skipped',tot-n);
end $$;

create function rpc_assign(p_leads uuid[],p_emp uuid) returns int language plpgsql security definer set search_path=public as $$
declare l uuid; n int:=0;
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from profiles where id=p_emp and role='employee' and is_active) then raise exception 'Employee not active'; end if;
 foreach l in array p_leads loop
  update leads set assigned_to=p_emp,assigned_at=now() where id=l and assigned_to is null and status<>'completed'
    and exists(select 1 from beneficiaries b where b.id=beneficiary_id and lower(b.application_status) like '%reject%');
  if found then insert into lead_assignments(lead_id,employee_id,assigned_by) values(l,p_emp,auth.uid()); n:=n+1;
    perform audit('assign','lead',l::text,jsonb_build_object('to',p_emp)); end if;
 end loop; return n;
end $$;

create function rpc_transfer(p_lead uuid,p_new uuid,p_reason text default null,p_override boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare l leads; aid text;
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 select * into l from leads where id=p_lead for update;
 if l.assigned_to is null then raise exception 'Lead is not assigned yet'; end if;
 if l.status='completed' and not p_override then raise exception 'Completed lead: override confirmation required'; end if;
 if l.assigned_to=p_new then raise exception 'Choose a different employee'; end if;
 if not exists(select 1 from profiles where id=p_new and role='employee' and is_active) then raise exception 'Employee not active'; end if;
 select application_id into aid from beneficiaries where id=l.beneficiary_id;
 update lead_assignments set ended_at=now() where lead_id=p_lead and ended_at is null;
 insert into lead_assignments(lead_id,employee_id,assigned_by) values(p_lead,p_new,auth.uid());
 update leads set assigned_to=p_new,assigned_at=now() where id=p_lead;          -- status & call history untouched
 update follow_ups set employee_id=p_new where lead_id=p_lead and not done;
 insert into transfer_history(lead_id,application_id,from_employee,to_employee,reason,transferred_by) values(p_lead,aid,l.assigned_to,p_new,p_reason,auth.uid());
 perform audit('transfer','lead',p_lead::text,jsonb_build_object('from',l.assigned_to,'to',p_new,'override',p_override));
end $$;

create function rpc_log_call(p_lead uuid,p_outcome text,p_called_at timestamptz,p_notes text,p_next timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare l leads;
begin
 select * into l from leads where id=p_lead for update;
 if l.id is null or l.assigned_to is distinct from auth.uid() or not is_active_user() then raise exception 'not allowed'; end if;
 insert into call_history(lead_id,employee_id,outcome,called_at,notes,next_followup) values(p_lead,auth.uid(),p_outcome,coalesce(p_called_at,now()),p_notes,p_next);
 if l.status='call_pending' and p_outcome in('Connected','Interested','Call Back','Not Interested','Documents Pending','Payment Pending') then
   update leads set status='call_connected',connected_at=now() where id=p_lead; l.status:='call_connected'; end if;
 if p_outcome='Interested' and l.status='call_connected' then
   update leads set status='lead_generated',lead_generated_at=now() where id=p_lead; end if;
 update follow_ups set done=true where lead_id=p_lead and not done;
 if p_next is not null then insert into follow_ups(lead_id,employee_id,due_at,note) values(p_lead,auth.uid(),p_next,p_outcome||coalesce(': '||p_notes,'')); end if;
 perform audit('call','lead',p_lead::text,jsonb_build_object('outcome',p_outcome));
end $$;

create function rpc_set_stage(p_lead uuid,p_stage text) returns void language plpgsql security definer set search_path=public as $$
declare l leads; st text[]:=array['call_pending','call_connected','lead_generated','documents_received','payment_received','completed'];
begin
 select * into l from leads where id=p_lead for update;
 if l.id is null or l.assigned_to is distinct from auth.uid() or not is_active_user() then raise exception 'not allowed'; end if;
 if array_position(st,p_stage) is distinct from array_position(st,l.status)+1 then raise exception 'Stages must follow the workflow order'; end if;
 if p_stage='documents_received' and not exists(select 1 from document_status where lead_id=p_lead and status in('Documents Received','Documents Verified')) then raise exception 'Save document status as Received first'; end if;
 if p_stage='payment_received' and not exists(select 1 from payment_records where lead_id=p_lead and status='Received') then raise exception 'Record a payment with status Received first'; end if;
 update leads set status=p_stage,
   connected_at=case when p_stage='call_connected' then now() else connected_at end,
   lead_generated_at=case when p_stage='lead_generated' then now() else lead_generated_at end,
   documents_at=case when p_stage='documents_received' then now() else documents_at end,
   payment_at=case when p_stage='payment_received' then now() else payment_at end,
   completed_at=case when p_stage='completed' then now() else completed_at end where id=p_lead;
 perform audit('stage','lead',p_lead::text,jsonb_build_object('to',p_stage));
end $$;

create function rpc_save_docs(p_lead uuid,p_status text,p_checklist jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not my_lead(p_lead) then raise exception 'not allowed'; end if;
 insert into document_status(lead_id,status,checklist,updated_by) values(p_lead,p_status,coalesce(p_checklist,'{}'),auth.uid())
 on conflict(lead_id) do update set status=excluded.status,checklist=excluded.checklist,updated_by=auth.uid(),updated_at=now();
 perform audit('docs','lead',p_lead::text,jsonb_build_object('status',p_status));
end $$;

create function rpc_save_payment(p_lead uuid,p_status text,p_amount numeric,p_date date,p_mode text,p_ref text,p_notes text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not my_lead(p_lead) then raise exception 'not allowed'; end if;
 insert into payment_records(lead_id,status,amount,paid_on,mode,reference,notes,recorded_by) values(p_lead,p_status,p_amount,p_date,p_mode,p_ref,p_notes,auth.uid())
 on conflict(lead_id) do update set status=excluded.status,amount=excluded.amount,paid_on=excluded.paid_on,mode=excluded.mode,reference=excluded.reference,
   notes=excluded.notes,recorded_by=auth.uid(),updated_at=now(),verified=false,verified_by=null,verified_at=null;   -- any edit voids admin verification
 perform audit('payment','lead',p_lead::text,jsonb_build_object('status',p_status,'amount',p_amount));
end $$;

create function rpc_verify_payment(p_lead uuid,p_ok boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 update payment_records set verified=p_ok,verified_by=case when p_ok then auth.uid() end,verified_at=case when p_ok then now() end where lead_id=p_lead;
 perform audit('verify_payment','lead',p_lead::text,jsonb_build_object('ok',p_ok));
end $$;

create function admin_summary(p_from date default null,p_to date default null) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 return jsonb_build_object(
  'beneficiaries',(select count(*) from beneficiaries),'rejected',(select count(*) from leads),
  'assigned',(select count(*) from leads where assigned_to is not null),'unassigned',(select count(*) from leads where assigned_to is null),
  'employees',(select count(*) from profiles where role='employee'),
  'by_emp',(select coalesce(jsonb_agg(x),'[]') from (select p.id,p.full_name,p.employee_code,p.is_active,
    (select count(*) from leads l where l.assigned_to=p.id) assigned,
    (select count(*) from call_history c where c.employee_id=p.id and (p_from is null or c.called_at::date>=p_from) and (p_to is null or c.called_at::date<=p_to)) calls,
    (select count(*) from call_history c where c.employee_id=p.id and c.outcome in('Connected','Interested','Call Back','Not Interested','Documents Pending','Payment Pending') and (p_from is null or c.called_at::date>=p_from) and (p_to is null or c.called_at::date<=p_to)) connected,
    (select count(*) from leads l where l.assigned_to=p.id and l.lead_generated_at is not null and (p_from is null or l.lead_generated_at::date>=p_from) and (p_to is null or l.lead_generated_at::date<=p_to)) leads,
    (select count(*) from leads l where l.assigned_to=p.id and l.documents_at is not null and (p_from is null or l.documents_at::date>=p_from) and (p_to is null or l.documents_at::date<=p_to)) docs,
    (select count(*) from leads l where l.assigned_to=p.id and l.payment_at is not null and (p_from is null or l.payment_at::date>=p_from) and (p_to is null or l.payment_at::date<=p_to)) payments,
    (select count(*) from leads l where l.assigned_to=p.id and l.completed_at is not null and (p_from is null or l.completed_at::date>=p_from) and (p_to is null or l.completed_at::date<=p_to)) completed
    from profiles p where p.role='employee' order by p.full_name) x));
end $$;
