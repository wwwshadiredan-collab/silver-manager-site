-- Append this file to both staged migrations and wrap all in BEGIN; ... ROLLBACK;
-- Real Postgres role/RLS checks: no changes survive.
select set_config('qa.owner',(select user_id::text from public.customers order by created_at limit 1),true);
select set_config('qa.foreign',(select user_id::text from public.customers
 where user_id<>current_setting('qa.owner')::uuid limit 1),true);
select set_config('qa.staff',(select id::text from auth.users
 where id not in (select distinct user_id from public.customers) and email is not null limit 1),true);
select set_config('qa.email',(select email from auth.users where id=current_setting('qa.staff')::uuid),true);
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
select public.ledger_assign_staff(current_setting('qa.email'),'viewer');

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.staff'),true);
do $rls$
declare v_owner uuid:=current_setting('qa.owner')::uuid;
 v_foreign uuid:=current_setting('qa.foreign')::uuid;
 n int;
begin
 if v_owner is null or v_foreign is null then raise exception 'RLS_QA_FIXTURES_MISSING';end if;
 select count(*) into n from public.customers where user_id=v_owner;
 if n<1 then raise exception 'ASSIGNED_CUSTOMERS_NOT_VISIBLE';end if;
 select count(*) into n from public.customers where user_id=v_foreign;
 if n<>0 then raise exception 'FOREIGN_CUSTOMERS_LEAK';end if;
 select count(*) into n from public.journal where owner_id=v_foreign;
 if n<>0 then raise exception 'FOREIGN_JOURNAL_LEAK';end if;
 select count(*) into n from public.ledger_audit where owner_id=v_owner;
 if n<>0 then raise exception 'VIEWER_CAN_READ_SENSITIVE_AUDIT';end if;
 if not exists(select 1 from public.ledger_staff_members
   where owner_id=v_owner and user_id=(select auth.uid()) and role='viewer')
 then raise exception 'MEMBERSHIP_INVISIBLE';end if;
end $rls$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $rls$
declare n int;
begin
 begin
  select count(*) into n from public.customers;
  if n<>0 then raise exception 'ANON_CUSTOMERS_LEAK';end if;
 exception when insufficient_privilege then null;end;
 begin
  select count(*) into n from public.journal;
  if n<>0 then raise exception 'ANON_JOURNAL_LEAK';end if;
 exception when insufficient_privilege then null;end;
 begin
  select count(*) into n from public.ledger_portal_codes;
  if n<>0 then raise exception 'ANON_PORTAL_CODE_HASH_LEAK';end if;
 exception when insufficient_privilege then null;end;
 begin
  select count(*) into n from public.ledger_payments;
  if n<>0 then raise exception 'ANON_PAYMENTS_LEAK';end if;
 exception when insufficient_privilege then null;end;
end $rls$;
reset role;
select 'RLS authenticated assigned staff + anonymous cross-tenant isolation PASS' as test;
