-- Additive upgrade for existing Cashier_Ledger; do not drop or rewrite legacy tables.
-- Apply after 20260923_portal_and_audit.sql. Monetary postings use atomic server RPCs.
create table public.ledger_staff_members (
 owner_id uuid not null references auth.users(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('viewer','cashier','manager')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(owner_id,user_id),
 check(owner_id<>user_id)
);
create index ledger_staff_user_idx on public.ledger_staff_members(user_id,active);
alter table public.ledger_staff_members enable row level security;
create policy ledger_staff_read on public.ledger_staff_members for select to authenticated
 using(owner_id=(select auth.uid()) or user_id=(select auth.uid()));
grant select on public.ledger_staff_members to authenticated;

create or replace function ledger_private.can_work(p_owner uuid,p_level text default 'read')
returns boolean language sql stable security definer set search_path='' as $f$
 select (select auth.uid())=p_owner or exists(
   select 1 from public.ledger_staff_members m where m.owner_id=p_owner
     and m.user_id=(select auth.uid()) and m.active
     and (p_level='read' or (p_level='cashier' and m.role in ('cashier','manager'))
       or (p_level='manager' and m.role='manager'))
 )
$f$;
revoke all on function ledger_private.can_work(uuid,text) from public,anon,authenticated;

create table public.ledger_cash_accounts(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 label text not null check(char_length(trim(label)) between 2 and 80),
 channel text not null check(channel in ('cash','sham_cash','syriatel_cash','local_wallet','usdt')),
 currency text not null check(currency in ('USD','SYP','USDT')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,owner_id,currency),
 check((channel='usdt' and currency='USDT') or (channel<>'usdt' and currency in ('USD','SYP')))
);
create index ledger_accounts_owner_idx on public.ledger_cash_accounts(owner_id);
alter table public.ledger_cash_accounts enable row level security;
create policy ledger_cash_accounts_read on public.ledger_cash_accounts for select to authenticated
 using(owner_id=(select auth.uid()) or exists(
 select 1 from public.ledger_staff_members m where m.owner_id=ledger_cash_accounts.owner_id
 and m.user_id=(select auth.uid()) and m.active));
create policy ledger_cash_accounts_insert on public.ledger_cash_accounts for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy ledger_cash_accounts_update on public.ledger_cash_accounts for update to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
grant select,insert to authenticated on public.ledger_cash_accounts;
grant update(label,active) on public.ledger_cash_accounts to authenticated;

create table public.ledger_payments(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 customer_id uuid not null references public.customers(id),
 request_id uuid not null,
 debt_currency text not null check(debt_currency in ('USD','SYP')),
 fx_syp_per_usd numeric(20,6) not null check(fx_syp_per_usd>0),
 usdt_usd_rate numeric(20,8) not null check(usdt_usd_rate>0),
 settled_amount numeric(20,2) not null check(settled_amount>0),
 state text not null default 'pending' check(state in ('pending','confirmed','rejected')),
 memo text,
 created_by uuid not null references auth.users(id),
 confirmed_by uuid references auth.users(id),
 confirmed_at timestamptz,
 journal_id uuid unique references public.journal(id),
 created_at timestamptz not null default now(),
 unique(owner_id,request_id),
 unique(id,owner_id)
);
create index ledger_payments_owner_customer_idx on public.ledger_payments(owner_id,customer_id,created_at desc);
alter table public.ledger_payments enable row level security;
create policy ledger_payments_read on public.ledger_payments for select to authenticated
 using(owner_id=(select auth.uid()) or exists(
 select 1 from public.ledger_staff_members m where m.owner_id=ledger_payments.owner_id
 and m.user_id=(select auth.uid()) and m.active));
grant select on public.ledger_payments to authenticated;

create table public.ledger_payment_parts(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 payment_id uuid not null,
 account_id uuid not null,
 currency text not null check(currency in ('USD','SYP','USDT')),
 amount numeric(20,6) not null check(amount>0),
 settlement_value numeric(20,6) not null check(settlement_value>0),
 created_at timestamptz not null default now(),
 foreign key(payment_id,owner_id) references public.ledger_payments(id,owner_id),
 foreign key(account_id,owner_id,currency) references public.ledger_cash_accounts(id,owner_id,currency)
);
create index ledger_payment_parts_payment_idx on public.ledger_payment_parts(payment_id);
alter table public.ledger_payment_parts enable row level security;
create policy ledger_payment_parts_read on public.ledger_payment_parts for select to authenticated
 using(owner_id=(select auth.uid()) or exists(
 select 1 from public.ledger_staff_members m where m.owner_id=ledger_payment_parts.owner_id
 and m.user_id=(select auth.uid()) and m.active));
grant select on public.ledger_payment_parts to authenticated;

create table public.ledger_cash_movements(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 account_id uuid not null references public.ledger_cash_accounts(id),
 amount numeric(20,6) not null check(amount<>0),
 reason text not null check(reason in ('opening','deposit','withdrawal','expense','correction')),
 note text not null check(length(trim(note)) between 3 and 500),
 related_id uuid references public.ledger_cash_movements(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index ledger_one_opening_per_account on public.ledger_cash_movements(account_id) where reason='opening';
create index ledger_cash_movements_owner_idx on public.ledger_cash_movements(owner_id,account_id,created_at);
alter table public.ledger_cash_movements enable row level security;
create policy ledger_cash_movements_read on public.ledger_cash_movements for select to authenticated
 using(owner_id=(select auth.uid()) or exists(
 select 1 from public.ledger_staff_members m where m.owner_id=ledger_cash_movements.owner_id
 and m.user_id=(select auth.uid()) and m.active));
grant select on public.ledger_cash_movements to authenticated;

create table public.ledger_day_closings(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 account_id uuid not null references public.ledger_cash_accounts(id),
 local_day date not null,
 expected_balance numeric(20,6) not null,
 counted_balance numeric(20,6) not null,
 difference numeric(20,6) not null,
 note text,
 closed_by uuid not null references auth.users(id),
 closed_at timestamptz not null default now(),
 unique(owner_id,account_id,local_day)
);
create index ledger_closings_owner_day on public.ledger_day_closings(owner_id,local_day desc);
alter table public.ledger_day_closings enable row level security;
create policy ledger_closings_read on public.ledger_day_closings for select to authenticated
 using(owner_id=(select auth.uid()) or exists(
 select 1 from public.ledger_staff_members m where m.owner_id=ledger_day_closings.owner_id
 and m.user_id=(select auth.uid()) and m.active));
grant select on public.ledger_day_closings to authenticated;

create or replace function public.ledger_assign_staff(p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_uid uuid; v_owner uuid:=(select auth.uid());
begin
 if v_owner is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 if p_role not in ('viewer','cashier','manager') then raise exception 'INVALID_ROLE'; end if;
 select id into v_uid from auth.users where lower(email)=lower(trim(p_email)) limit 1;
 if v_uid is null or v_uid=v_owner then raise exception 'STAFF_ACCOUNT_NOT_FOUND_OR_SELF' using errcode='22023'; end if;
 insert into public.ledger_staff_members(owner_id,user_id,role,active)
 values(v_owner,v_uid,p_role,true)
 on conflict(owner_id,user_id) do update set role=excluded.role,active=true;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,new_value)
 values(v_owner,v_owner,'ledger_staff_members',v_uid,'UPDATE',jsonb_build_object('role',p_role));
 return jsonb_build_object('status','active','role',p_role);
end $f$;

create or replace function public.ledger_prepare_payment(
 p_owner uuid,p_customer uuid,p_debt_currency text,
 p_fx_syp_per_usd numeric,p_usdt_usd_rate numeric,
 p_legs jsonb,p_note text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_actor uuid:=(select auth.uid()); v_customer_owner uuid;
        v_leg jsonb; v_account record; v_amount numeric; v_settle numeric;
        v_total numeric:=0; v_count int; v_payment uuid; v_old record;
begin
 if not ledger_private.can_work(p_owner,'cashier') then
    raise exception 'CASHIER_PERMISSION_REQUIRED' using errcode='42501'; end if;
 if p_debt_currency not in ('USD','SYP') or p_fx_syp_per_usd<=0 or p_usdt_usd_rate<=0 or
    p_fx_syp_per_usd is null or p_usdt_usd_rate is null or p_legs is null or
    jsonb_typeof(p_legs)<>'array' or jsonb_array_length(p_legs) not between 1 and 8 or
    p_request_id is null then raise exception 'INVALID_PAYMENT_REQUEST' using errcode='22023'; end if;
 -- A duplicate retry must not create a second payment or alter a prior rate.
 select id,settled_amount,state into v_old from public.ledger_payments
  where owner_id=p_owner and request_id=p_request_id;
 if found then return jsonb_build_object('id',v_old.id,'settled_amount',v_old.settled_amount,'state',v_old.state,'duplicate',true); end if;
 select user_id into v_customer_owner from public.customers where id=p_customer and not is_archived;
 if v_customer_owner is distinct from p_owner then raise exception 'CUSTOMER_NOT_IN_BUSINESS' using errcode='42501'; end if;
 for v_leg in select value from jsonb_array_elements(p_legs) loop
   select id,currency,active into v_account from public.ledger_cash_accounts
     where id=(v_leg->>'account_id')::uuid and owner_id=p_owner;
   if not found or not v_account.active then raise exception 'INVALID_CASH_ACCOUNT' using errcode='22023'; end if;
   v_amount=(v_leg->>'amount')::numeric;
   if v_amount is null or v_amount<=0 or v_amount>100000000000000 then
      raise exception 'INVALID_AMOUNT' using errcode='22023'; end if;
   v_settle:=case v_account.currency
     when 'USD' then v_amount
     when 'SYP' then v_amount / p_fx_syp_per_usd
     when 'USDT' then v_amount * p_usdt_usd_rate end;
   if p_debt_currency='SYP' then v_settle:=v_settle*p_fx_syp_per_usd; end if;
   v_total:=v_total+v_settle;
 end loop;
 v_total:=round(v_total,2);
 if v_total<=0 then raise exception 'PAYMENT_TOO_SMALL' using errcode='22023'; end if;
 begin
   insert into public.ledger_payments
    (owner_id,customer_id,request_id,debt_currency,fx_syp_per_usd,usdt_usd_rate,
     settled_amount,state,memo,created_by)
   values(p_owner,p_customer,p_request_id,p_debt_currency,p_fx_syp_per_usd,
     p_usdt_usd_rate,v_total,'pending',left(trim(coalesce(p_note,'')),500),v_actor)
   returning id into v_payment;
 exception when unique_violation then
   select id,settled_amount,state into v_old from public.ledger_payments
    where owner_id=p_owner and request_id=p_request_id;
   if not found then raise; end if;
   return jsonb_build_object('id',v_old.id,'settled_amount',v_old.settled_amount,'state',v_old.state,'duplicate',true);
 end;
 for v_leg in select value from jsonb_array_elements(p_legs) loop
    select id,currency into v_account from public.ledger_cash_accounts
      where id=(v_leg->>'account_id')::uuid and owner_id=p_owner;
    v_amount:=(v_leg->>'amount')::numeric;
    v_settle:=case v_account.currency
       when 'USD' then v_amount when 'SYP' then v_amount/p_fx_syp_per_usd
       when 'USDT' then v_amount*p_usdt_usd_rate end;
    if p_debt_currency='SYP' then v_settle:=v_settle*p_fx_syp_per_usd; end if;
    insert into public.ledger_payment_parts(owner_id,payment_id,account_id,currency,amount,settlement_value)
      values(p_owner,v_payment,v_account.id,v_account.currency,v_amount,round(v_settle,6));
 end loop;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,new_value)
 values(p_owner,v_actor,'ledger_payments',v_payment,'INSERT',
 jsonb_build_object('state','pending','fx_syp_per_usd',p_fx_syp_per_usd,
 'usdt_usd_rate',p_usdt_usd_rate,'settled_amount',v_total,'debt_currency',p_debt_currency));
 return jsonb_build_object('id',v_payment,'settled_amount',v_total,'currency',p_debt_currency,'state','pending','duplicate',false);
end $f$;

create or replace function public.ledger_confirm_payment(p_payment uuid,p_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_actor uuid:=(select auth.uid()); v_payment public.ledger_payments%rowtype;
        v_debt numeric; v_journal uuid;
begin
 if not ledger_private.can_work(p_owner,'cashier') then raise exception 'CASHIER_PERMISSION_REQUIRED' using errcode='42501'; end if;
 select * into v_payment from public.ledger_payments
   where id=p_payment and owner_id=p_owner for update;
 if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='22023'; end if;
 if v_payment.state='confirmed' then
    return jsonb_build_object('state','confirmed','journal_id',v_payment.journal_id,'duplicate',true); end if;
 if v_payment.state<>'pending' then raise exception 'PAYMENT_NOT_PENDING' using errcode='22023'; end if;
 -- Serialize concurrent confirmations for the same customer.
 perform 1 from public.customers where id=v_payment.customer_id and user_id=p_owner for update;
 if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode='42501'; end if;
 select coalesce(sum(delta),0) into v_debt from public.journal
    where owner_id=p_owner and subject_id=v_payment.customer_id and currency=v_payment.debt_currency;
 if v_payment.settled_amount>v_debt then
    raise exception 'PAYMENT_EXCEEDS_DEBT current:% submitted:%',v_debt,v_payment.settled_amount using errcode='22023'; end if;
 insert into public.journal
  (owner_id,subject_id,category,currency,value,secondary_value,delta,note,happened_at)
 values(p_owner,v_payment.customer_id,'receipt',v_payment.debt_currency,
    v_payment.settled_amount,0,-v_payment.settled_amount,
    concat('دفعة متعددة القنوات #',v_payment.id::text,' | ',coalesce(v_payment.memo,'')),now())
 returning id into v_journal;
 update public.ledger_payments set state='confirmed',journal_id=v_journal,
    confirmed_by=v_actor,confirmed_at=now() where id=v_payment.id;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,old_value,new_value)
 values(p_owner,v_actor,'ledger_payments',v_payment.id,'UPDATE',
   jsonb_build_object('state','pending'),jsonb_build_object('state','confirmed','journal_id',v_journal));
 return jsonb_build_object('state','confirmed','journal_id',v_journal,'duplicate',false);
end $f$;

create or replace function public.ledger_reject_payment(p_payment uuid,p_owner uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_payment public.ledger_payments%rowtype; v_actor uuid:=(select auth.uid());
begin
 if not ledger_private.can_work(p_owner,'cashier') then raise exception 'CASHIER_PERMISSION_REQUIRED' using errcode='42501'; end if;
 if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023'; end if;
 select * into v_payment from public.ledger_payments
   where id=p_payment and owner_id=p_owner for update;
 if not found or v_payment.state<>'pending' then raise exception 'PAYMENT_NOT_PENDING' using errcode='22023'; end if;
 update public.ledger_payments set state='rejected',memo=concat(coalesce(memo,''),' | مرفوض: ',left(trim(p_reason),300))
  where id=p_payment;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,old_value,new_value)
 values(p_owner,v_actor,'ledger_payments',p_payment,'UPDATE',
 jsonb_build_object('state','pending'),jsonb_build_object('state','rejected','reason',left(trim(p_reason),300)));
 return jsonb_build_object('state','rejected');
end $f$;

create or replace function public.ledger_add_cash_movement(
 p_owner uuid,p_account uuid,p_amount numeric,p_reason text,p_note text,p_related uuid default null)
returns uuid language plpgsql security definer set search_path='' as $f$
declare v_actor uuid:=(select auth.uid());v_id uuid;
begin
 if not ledger_private.can_work(p_owner,'manager') then raise exception 'MANAGER_PERMISSION_REQUIRED' using errcode='42501'; end if;
 if p_amount is null or p_amount=0 or abs(p_amount)>100000000000000
   or p_reason not in ('opening','deposit','withdrawal','expense','correction')
   or char_length(trim(coalesce(p_note,''))) not between 3 and 500
   then raise exception 'INVALID_MOVEMENT' using errcode='22023'; end if;
 if not exists(select 1 from public.ledger_cash_accounts where id=p_account and owner_id=p_owner and active)
 then raise exception 'CASH_ACCOUNT_NOT_FOUND' using errcode='42501'; end if;
 if p_related is not null and not exists(select 1 from public.ledger_cash_movements
 where id=p_related and owner_id=p_owner and account_id=p_account)
 then raise exception 'RELATED_MOVEMENT_NOT_FOUND' using errcode='42501'; end if;
 insert into public.ledger_cash_movements(owner_id,account_id,amount,reason,note,related_id,created_by)
 values(p_owner,p_account,p_amount,p_reason,trim(p_note),p_related,v_actor) returning id into v_id;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,new_value)
 values(p_owner,v_actor,'ledger_cash_movements',v_id,'INSERT',
 jsonb_build_object('account_id',p_account,'amount',p_amount,'reason',p_reason,'related',p_related));
 return v_id;
end $f$;

create or replace function public.ledger_cash_balances(p_owner uuid,p_local_day date default null)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_day date:=coalesce(p_local_day,(now() at time zone 'Asia/Damascus')::date);
begin
 if not ledger_private.can_work(p_owner,'read') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'account_id',a.id,'label',a.label,'channel',a.channel,'currency',a.currency,
  'expected',coalesce((select sum(pp.amount) from public.ledger_payment_parts pp
    join public.ledger_payments p on p.id=pp.payment_id
    where pp.account_id=a.id and p.owner_id=p_owner and p.state='confirmed'
     and (p.confirmed_at at time zone 'Asia/Damascus')::date<=v_day),0)
     +coalesce((select sum(m.amount) from public.ledger_cash_movements m
      where m.account_id=a.id and m.owner_id=p_owner
      and (m.created_at at time zone 'Asia/Damascus')::date<=v_day),0))
  order by a.created_at) from public.ledger_cash_accounts a where a.owner_id=p_owner),'[]'::jsonb);
end $f$;

create or replace function public.ledger_close_day(
 p_owner uuid,p_account uuid,p_day date,p_counted numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_actor uuid:=(select auth.uid());v_expected numeric;v_id uuid;
begin
 if not ledger_private.can_work(p_owner,'manager') then raise exception 'MANAGER_PERMISSION_REQUIRED' using errcode='42501'; end if;
 if p_day is null or p_day>(now() at time zone 'Asia/Damascus')::date or
   p_counted is null or p_counted<0 then raise exception 'INVALID_CLOSING' using errcode='22023'; end if;
 perform 1 from public.ledger_cash_accounts where id=p_account and owner_id=p_owner for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode='42501'; end if;
 if exists(select 1 from public.ledger_day_closings where owner_id=p_owner
    and account_id=p_account and local_day=p_day) then raise exception 'DAY_ALREADY_CLOSED' using errcode='23505'; end if;
 select coalesce(sum(pp.amount),0) into v_expected
 from public.ledger_payment_parts pp join public.ledger_payments p on p.id=pp.payment_id
 where pp.owner_id=p_owner and pp.account_id=p_account and p.state='confirmed'
   and (p.confirmed_at at time zone 'Asia/Damascus')::date<=p_day;
 v_expected:=v_expected+coalesce((select sum(amount) from public.ledger_cash_movements
   where owner_id=p_owner and account_id=p_account
   and (created_at at time zone 'Asia/Damascus')::date<=p_day),0);
 insert into public.ledger_day_closings(owner_id,account_id,local_day,expected_balance,
   counted_balance,difference,note,closed_by)
 values(p_owner,p_account,p_day,v_expected,p_counted,p_counted-v_expected,
    left(trim(coalesce(p_note,'')),500),v_actor) returning id into v_id;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,new_value)
 values(p_owner,v_actor,'ledger_day_closings',v_id,'INSERT',
  jsonb_build_object('account_id',p_account,'expected',v_expected,'counted',p_counted,
                     'difference',p_counted-v_expected,'local_day',p_day));
 return jsonb_build_object('id',v_id,'expected',v_expected,'counted',p_counted,
    'difference',p_counted-v_expected);
end $f$;

-- All monetary tables are append-only to browser roles; validated RPCs own state transitions.
revoke all on function public.ledger_assign_staff(text,text) from public,anon,authenticated;
revoke all on function public.ledger_prepare_payment(uuid,uuid,text,numeric,numeric,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.ledger_confirm_payment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ledger_reject_payment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ledger_add_cash_movement(uuid,uuid,numeric,text,text,uuid) from public,anon,authenticated;
revoke all on function public.ledger_cash_balances(uuid,date) from public,anon,authenticated;
revoke all on function public.ledger_close_day(uuid,uuid,date,numeric,text) from public,anon,authenticated;
grant execute on function public.ledger_assign_staff(text,text) to authenticated;
grant execute on function public.ledger_prepare_payment(uuid,uuid,text,numeric,numeric,jsonb,text,uuid) to authenticated;
grant execute on function public.ledger_confirm_payment(uuid,uuid) to authenticated;
grant execute on function public.ledger_reject_payment(uuid,uuid,text) to authenticated;
grant execute on function public.ledger_add_cash_movement(uuid,uuid,numeric,text,text,uuid) to authenticated;
grant execute on function public.ledger_cash_balances(uuid,date) to authenticated;
grant execute on function public.ledger_close_day(uuid,uuid,date,numeric,text) to authenticated;
