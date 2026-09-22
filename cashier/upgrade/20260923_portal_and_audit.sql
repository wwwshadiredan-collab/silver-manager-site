-- Cashier Ledger: additive customer portal, immutable server-side audit, and disputes.
-- Apply only after reviewing against Cashier_Ledger (yfiwexcpkrnfoujgxlcv).
-- Legacy customers, journal, invitation codes and existing policies are preserved.
create schema if not exists ledger_private;
revoke all on schema ledger_private from public, anon, authenticated;

create table public.ledger_audit (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE','ISSUE_PORTAL_CODE','OPEN_DISPUTE')),
  old_value jsonb, new_value jsonb,
  created_at timestamptz not null default now()
);
create index ledger_audit_owner_time_idx on public.ledger_audit (owner_id,created_at desc);
alter table public.ledger_audit enable row level security;
create policy ledger_audit_owner_read on public.ledger_audit for select to authenticated
 using (owner_id = (select auth.uid()));
grant select on public.ledger_audit to authenticated;

create or replace function ledger_private.capture_existing_changes() returns trigger
language plpgsql security definer set search_path='' as $f$
declare v_owner uuid; v_id uuid;
begin
 if TG_TABLE_NAME = 'customers' then
   v_owner := case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end;
 else
   v_owner := case when TG_OP='DELETE' then OLD.owner_id else NEW.owner_id end;
 end if;
 v_id := case when TG_OP='DELETE' then OLD.id else NEW.id end;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,old_value,new_value)
 values (v_owner,(select auth.uid()),TG_TABLE_NAME,v_id,TG_OP,
    case when TG_OP='INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP='DELETE' then null else to_jsonb(NEW) end);
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $f$;
revoke all on function ledger_private.capture_existing_changes() from public;
create trigger ledger_customers_audit after insert or update or delete on public.customers
 for each row execute function ledger_private.capture_existing_changes();
create trigger ledger_journal_audit after insert or update or delete on public.journal
 for each row execute function ledger_private.capture_existing_changes();

create table public.ledger_portal_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  owner_id uuid not null references auth.users(id),
  customer_id uuid not null references public.customers(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(owner_id,customer_id,code_hash)
);
create index ledger_portal_code_lookup on public.ledger_portal_codes(owner_id,customer_id);
alter table public.ledger_portal_codes enable row level security;
create policy ledger_portal_codes_owner_read on public.ledger_portal_codes
 for select to authenticated using (owner_id=(select auth.uid()));
grant select on public.ledger_portal_codes to authenticated;

create table public.ledger_portal_disputes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  customer_id uuid not null references public.customers(id),
  journal_id uuid not null references public.journal(id),
  reason text not null check (char_length(trim(reason)) between 8 and 1000),
  status text not null default 'open' check (status in ('open','accepted','rejected','resolved')),
  owner_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(customer_id,journal_id)
);
create index ledger_disputes_owner_status on public.ledger_portal_disputes(owner_id,status,created_at desc);
alter table public.ledger_portal_disputes enable row level security;
create policy ledger_disputes_owner_read on public.ledger_portal_disputes for select to authenticated
 using (owner_id=(select auth.uid()));
create policy ledger_disputes_owner_update on public.ledger_portal_disputes for update to authenticated
 using (owner_id=(select auth.uid()))
 with check (owner_id=(select auth.uid()));
grant select on public.ledger_portal_disputes to authenticated;
grant update(status,owner_note,resolved_at) on public.ledger_portal_disputes to authenticated;

create or replace function ledger_private.dispute_audit() returns trigger
language plpgsql security definer set search_path='' as $f$
begin
 if TG_OP='UPDATE' then
   if new.id<>old.id or new.owner_id<>old.owner_id or new.customer_id<>old.customer_id
     or new.journal_id<>old.journal_id or new.reason<>old.reason
     or new.created_at<>old.created_at then
       raise exception 'DISPUTE_IDENTITY_IMMUTABLE' using errcode='23514';
   end if;
 end if;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,old_value,new_value)
 values (new.owner_id,(select auth.uid()),'ledger_portal_disputes',new.id,TG_OP,
    case when TG_OP='INSERT' then null else to_jsonb(old) end,to_jsonb(new));
 return new;
end $f$;
revoke all on function ledger_private.dispute_audit() from public;
create trigger ledger_dispute_audit after insert or update on public.ledger_portal_disputes
 for each row execute function ledger_private.dispute_audit();
create or replace function ledger_private.dispute_immutable() returns trigger
language plpgsql set search_path='' as $f$
begin
 if new.id<>old.id or new.owner_id<>old.owner_id or new.customer_id<>old.customer_id
    or new.journal_id<>old.journal_id or new.reason<>old.reason or new.created_at<>old.created_at then
     raise exception 'DISPUTE_IDENTITY_IMMUTABLE' using errcode='23514';
 end if;
 return new;
end $f$;
revoke all on function ledger_private.dispute_immutable() from public;
create trigger ledger_dispute_immutable before update on public.ledger_portal_disputes
 for each row execute function ledger_private.dispute_immutable();

create or replace function public.ledger_issue_portal_code(p_customer_id uuid) returns text
language plpgsql security definer set search_path='' as $f$
declare v_owner uuid:=(select auth.uid()); v_code text;
begin
 if v_owner is null or not exists
 (select 1 from public.customers where id=p_customer_id and user_id=v_owner and not is_archived)
 then raise exception 'CUSTOMER_NOT_FOUND' using errcode='42501'; end if;
 update public.ledger_portal_codes set revoked_at=now()
 where owner_id=v_owner and customer_id=p_customer_id and revoked_at is null;
 v_code := 'LC-' || upper(replace(gen_random_uuid()::text,'-',''));
 insert into public.ledger_portal_codes(code_hash,owner_id,customer_id,expires_at)
 values (encode(sha256(convert_to(v_code,'UTF8')),'hex'),v_owner,p_customer_id,
         now() + interval '180 days');
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,new_value)
 values (v_owner,v_owner,'ledger_portal_codes',p_customer_id,'ISSUE_PORTAL_CODE',
         jsonb_build_object('customer_id',p_customer_id,'expires_in_days',180));
 return v_code;
end $f$;

create or replace function public.ledger_portal_statement(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v_code text; v_link record;
begin
 v_code:=upper(trim(coalesce(p_code,'')));
 if v_code !~ '^LC-[0-9A-F]{32}$' then
   raise exception 'INVALID_OR_REVOKED_CODE' using errcode='28000';
 end if;
 select l.owner_id,l.customer_id,c.name into v_link
 from public.ledger_portal_codes l
 join public.customers c on c.id=l.customer_id and c.user_id=l.owner_id
 where l.code_hash=encode(sha256(convert_to(v_code,'UTF8')),'hex')
   and l.revoked_at is null and l.expires_at > now()
 limit 1;
 if not found then raise exception 'INVALID_OR_REVOKED_CODE' using errcode='28000'; end if;
 return jsonb_build_object(
  'customer',jsonb_build_object('name',v_link.name),
  'balance', (select jsonb_build_object(
      'USD',coalesce(sum(delta) filter (where currency='USD'),0),
      'SYP',coalesce(sum(delta) filter (where currency='SYP'),0))
    from public.journal where owner_id=v_link.owner_id and subject_id=v_link.customer_id),
  'entries',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'date',e.happened_at,'category',e.category,
      'currency',e.currency,'amount',e.value,'balance_change',e.delta,
      'note',e.note,'related_id',e.related_id) order by e.happened_at desc,e.id)
    from (select id,happened_at,category,currency,value,delta,note,related_id
       from public.journal where owner_id=v_link.owner_id and subject_id=v_link.customer_id
         and category not like 'expense%'
       order by happened_at desc,id limit 200) e),'[]'::jsonb),
  'disputes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'journal_id',d.journal_id,'status',d.status,
      'reason',d.reason,'response',d.owner_note,'created_at',d.created_at)
      order by d.created_at desc)
    from public.ledger_portal_disputes d
    where d.owner_id=v_link.owner_id and d.customer_id=v_link.customer_id),'[]'::jsonb)
 );
end $f$;

create or replace function public.ledger_portal_dispute(
 p_code text,p_journal_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $f$
declare v_code text; v_link record; v_id uuid;
begin
 v_code:=upper(trim(coalesce(p_code,'')));
 if v_code !~ '^LC-[0-9A-F]{32}$' or length(trim(coalesce(p_reason,''))) not between 8 and 1000 then
   raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 select l.owner_id,l.customer_id into v_link from public.ledger_portal_codes l
 join public.customers c on c.id=l.customer_id and c.user_id=l.owner_id
 where l.code_hash=encode(sha256(convert_to(v_code,'UTF8')),'hex')
   and l.revoked_at is null and l.expires_at > now() limit 1;
 if not found or not exists (
   select 1 from public.journal j where j.id=p_journal_id
     and j.owner_id=v_link.owner_id and j.subject_id=v_link.customer_id
     and j.category not like 'expense%'
 ) then raise exception 'INVALID_CODE_OR_ENTRY' using errcode='42501'; end if;
 insert into public.ledger_portal_disputes(owner_id,customer_id,journal_id,reason)
 values(v_link.owner_id,v_link.customer_id,p_journal_id,trim(p_reason))
 on conflict(customer_id,journal_id) do nothing returning id into v_id;
 if v_id is null then raise exception 'DISPUTE_ALREADY_EXISTS' using errcode='23505'; end if;
 return v_id;
end $f$;

revoke all on function public.ledger_issue_portal_code(uuid) from public,anon,authenticated;
revoke all on function public.ledger_portal_statement(text) from public,anon,authenticated;
revoke all on function public.ledger_portal_dispute(text,uuid,text) from public,anon,authenticated;
grant execute on function public.ledger_issue_portal_code(uuid) to authenticated;
grant execute on function public.ledger_portal_statement(text) to anon,authenticated;
grant execute on function public.ledger_portal_dispute(text,uuid,text) to anon,authenticated;
