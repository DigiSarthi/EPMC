-- PATCH 3 : re-applied detection + daily status update + close/reopen lead. Run once in SQL Editor.

alter table leads add column if not exists superseded_by uuid references beneficiaries(id);
alter table leads add column if not exists closed_reason text;     -- reapplied_auto | reapplied_told | status_changed | not_interested | wrong_number
alter table leads add column if not exists closed_at timestamptz;
alter table leads add column if not exists detect_skip boolean not null default false;  -- admin reopened: never auto-close again

-- Same person = same name + father/spouse name + mobile (case, spaces, punctuation ignored; last 10 digits of mobile)
create or replace function nk(t text) returns text language sql immutable as
$$ select btrim(regexp_replace(regexp_replace(lower(coalesce(t,'')),'[^a-z0-9 ]',' ','g'),'\s+',' ','g')) $$;
create or replace function person_key(n text,f text,m text) returns text language sql immutable as
$$ select nk(n)||'|'||nk(f)||'|'||right(regexp_replace(coalesce(m,''),'\D','','g'),10) $$;
create index if not exists ben_person on beneficiaries (person_key(applicant_name,father_spouse_name,mobile_no));

-- Daily update: copy newest Application Status / Rejection Reason from the file onto existing records
create or replace function rpc_update_status(p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 update beneficiaries b set application_status=s.application_status, rejection_reason=coalesce(nullif(s.rejection_reason,''),b.rejection_reason)
 from jsonb_to_recordset(p_rows) as s(application_id text,application_status text,rejection_reason text)
 where b.application_id=s.application_id and nullif(s.application_status,'') is not null
   and (b.application_status is distinct from s.application_status or b.rejection_reason is distinct from coalesce(nullif(s.rejection_reason,''),b.rejection_reason));
 get diagnostics n=row_count; return n;
end $$;

-- Auto-close leads whose applicant already re-applied (newer application, same person) or whose status is no longer "rejected"
create or replace function rpc_detect_reapplied() returns int language plpgsql security definer set search_path=public as $$
declare n1 int; n2 int;
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 with cand as (
  select l.id lead_id,
   (select b2.id from beneficiaries b2
     where b2.id<>b.id and person_key(b2.applicant_name,b2.father_spouse_name,b2.mobile_no)=person_key(b.applicant_name,b.father_spouse_name,b.mobile_no)
       and (b2.apply_date>b.apply_date or (b2.apply_date is not null and b.apply_date is null)
            or (b2.apply_date is not distinct from b.apply_date and b2.created_at>b.created_at))
     order by b2.apply_date desc nulls last, b2.created_at desc limit 1) newer
  from leads l join beneficiaries b on b.id=l.beneficiary_id
  where l.closed_reason is null and not l.detect_skip and l.status<>'completed'
    and length(right(regexp_replace(coalesce(b.mobile_no,''),'\D','','g'),10))=10)
 update leads l set superseded_by=c.newer, closed_reason='reapplied_auto', closed_at=now()
 from cand c where l.id=c.lead_id and c.newer is not null;
 get diagnostics n1=row_count;
 update leads l set closed_reason='status_changed', closed_at=now()
 from beneficiaries b where b.id=l.beneficiary_id and l.closed_reason is null and not l.detect_skip and l.status<>'completed'
   and lower(coalesce(b.application_status,'')) not like '%reject%';
 get diagnostics n2=row_count;
 update follow_ups set done=true where not done and lead_id in(select id from leads where closed_reason is not null);
 perform audit('detect_reapplied','leads',null,jsonb_build_object('reapplied',n1,'status_changed',n2));
 return n1+n2;
end $$;

-- Employee closes own lead (e.g. applicant says "I already re-applied")
create or replace function rpc_close_lead(p_lead uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_reason not in('reapplied_told','not_interested','wrong_number') then raise exception 'Invalid reason'; end if;
 update leads set closed_reason=p_reason, closed_at=now() where id=p_lead and assigned_to=auth.uid() and is_active_user() and closed_reason is null and status<>'completed';
 if not found then raise exception 'not allowed'; end if;
 update follow_ups set done=true where lead_id=p_lead and not done;
 perform audit('close_lead','lead',p_lead::text,jsonb_build_object('reason',p_reason));
end $$;

create or replace function rpc_reopen_lead(p_lead uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 update leads set closed_reason=null, closed_at=null, superseded_by=null, detect_skip=true where id=p_lead;
 perform audit('reopen_lead','lead',p_lead::text,'{}');
end $$;

-- A closed lead can no longer move forward or receive calls (server-side guard)
create or replace function block_closed() returns trigger language plpgsql as $$
begin
 if tg_table_name='call_history' then
   if exists(select 1 from leads where id=new.lead_id and closed_reason is not null) then raise exception 'Lead is closed'; end if;
 elsif old.closed_reason is not null and new.status is distinct from old.status then raise exception 'Lead is closed';
 end if;
 return new;
end $$;
drop trigger if exists blk_call on call_history; create trigger blk_call before insert on call_history for each row execute function block_closed();
drop trigger if exists blk_lead on leads; create trigger blk_lead before update of status on leads for each row execute function block_closed();

-- Assignment must skip closed leads
create or replace function rpc_assign(p_leads uuid[],p_emp uuid) returns int language plpgsql security definer set search_path=public as $$
declare l uuid; n int:=0;
begin
 if not is_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from profiles where id=p_emp and role='employee' and is_active) then raise exception 'Employee not active'; end if;
 foreach l in array p_leads loop
  update leads set assigned_to=p_emp,assigned_at=now() where id=l and assigned_to is null and closed_reason is null and status<>'completed'
    and exists(select 1 from beneficiaries b where b.id=beneficiary_id and lower(b.application_status) like '%reject%');
  if found then insert into lead_assignments(lead_id,employee_id,assigned_by) values(l,p_emp,auth.uid()); n:=n+1;
    perform audit('assign','lead',l::text,jsonb_build_object('to',p_emp)); end if;
 end loop; return n;
end $$;
