-- Safety hardening: append-only corrections for confirmed mixed payments, no history deletion.
-- Apply AFTER the portal and multicurrency migrations.
alter table public.ledger_payments drop constraint ledger_payments_state_check;
alter table public.ledger_payments add constraint ledger_payments_state_check
 check(state in ('pending','confirmed','rejected','reversed'));

alter table public.ledger_cash_movements add column reversal_payment_id uuid references public.ledger_payments(id);
create unique index ledger_cash_single_reversal_per_account
 on public.ledger_cash_movements(reversal_payment_id,account_id) where reversal_payment_id is not null;

create table public.ledger_payment_reversals(
 payment_id uuid primary key references public.ledger_payments(id),
 owner_id uuid not null references auth.users(id),
 reversal_journal_id uuid not null unique references public.journal(id),
 reason text not null check(char_length(trim(reason)) between 3 and 500),
 reversed_by uuid not null references auth.users(id),
 reversed_at timestamptz not null default now()
);
create index ledger_payment_reversals_owner_idx on public.ledger_payment_reversals(owner_id,reversed_at desc);
alter table public.ledger_payment_reversals enable row level security;
create policy ledger_payment_reversals_owner_read on public.ledger_payment_reversals for select to authenticated
 using(owner_id=(select auth.uid()) or exists (
 select 1 from public.ledger_staff_members s where s.owner_id=ledger_payment_reversals.owner_id
 and s.user_id=(select auth.uid()) and s.active and s.role='manager'));
grant select on public.ledger_payment_reversals to authenticated;

-- Old offline clients may issue a generic reversal; they cannot reverse a confirmed
-- mixed payment directly because it would change debt without correcting every cash box.
create or replace function ledger_private.protect_ledger_receipt_reversal()
returns trigger language plpgsql security definer set search_path='' as $f$
begin
 if new.category='receipt_reversal' and new.related_id is not null
   and exists(select 1 from public.ledger_payments p
       where p.journal_id=new.related_id and p.owner_id=new.owner_id)
   and coalesce(current_setting('ledger.authorized_reversal',true),'')<>new.related_id::text
 then raise exception 'USE_MIXED_PAYMENT_REVERSAL' using errcode='23514';
 end if;
 return new;
end $f$;
revoke all on function ledger_private.protect_ledger_receipt_reversal() from public,anon,authenticated;
create trigger ledger_require_managed_payment_reversal before insert on public.journal
 for each row execute function ledger_private.protect_ledger_receipt_reversal();

create or replace function public.ledger_reverse_payment(p_owner uuid,p_payment uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_actor uuid:=(select auth.uid());v_payment public.ledger_payments%rowtype;
        v_reversal uuid;v_part record;v_today date:=(now() at time zone 'Asia/Damascus')::date;
begin
 if not ledger_private.can_work(p_owner,'manager')
 then raise exception 'MANAGER_PERMISSION_REQUIRED' using errcode='42501';end if;
 if char_length(trim(coalesce(p_reason,''))) not between 3 and 500
 then raise exception 'REVERSAL_REASON_REQUIRED' using errcode='22023';end if;
 select * into v_payment from public.ledger_payments where id=p_payment and owner_id=p_owner for update;
 if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode='22023';end if;
 if v_payment.state='reversed' then
  select reversal_journal_id into v_reversal from public.ledger_payment_reversals where payment_id=p_payment;
  return jsonb_build_object('state','reversed','journal_id',v_reversal,'duplicate',true);
 end if;
 if v_payment.state<>'confirmed' or v_payment.journal_id is null
 then raise exception 'PAYMENT_NOT_CONFIRMED' using errcode='22023';end if;
 perform 1 from public.customers where id=v_payment.customer_id and user_id=p_owner for update;
 if not found then raise exception 'CUSTOMER_MISSING' using errcode='42501';end if;
 if exists(select 1 from public.ledger_day_closings cl
   join public.ledger_payment_parts part on part.owner_id=p_owner and part.account_id=cl.account_id
   where part.payment_id=p_payment and cl.owner_id=p_owner and cl.local_day=v_today)
 then raise exception 'CASH_ACCOUNT_ALREADY_CLOSED_TODAY' using errcode='22023';end if;
 if exists(select 1 from public.journal
   where owner_id=p_owner and related_id=v_payment.journal_id)
 then raise exception 'PAYMENT_ALREADY_REVERSED_EXTERNALLY' using errcode='23514';end if;
 perform set_config('ledger.authorized_reversal',v_payment.journal_id::text,true);
 insert into public.journal(owner_id,subject_id,category,currency,value,secondary_value,
                             delta,note,related_id,happened_at)
 values(p_owner,v_payment.customer_id,'receipt_reversal',v_payment.debt_currency,
   -v_payment.settled_amount,0,v_payment.settled_amount,
   concat('عكس دفعة مختلطة: ',trim(p_reason)),v_payment.journal_id,now())
 returning id into v_reversal;
 -- Restrict the privilege to the exact receipt and drop it before any other statement.
 perform set_config('ledger.authorized_reversal','',true);
 for v_part in
  select account_id,sum(amount) as received from public.ledger_payment_parts
  where owner_id=p_owner and payment_id=p_payment group by account_id
 loop
  insert into public.ledger_cash_movements
   (owner_id,account_id,amount,reason,note,created_by,reversal_payment_id)
  values(p_owner,v_part.account_id,-v_part.received,'correction',
   concat('عكس دفعة مختلطة ',p_payment::text,' : ',trim(p_reason)),v_actor,p_payment);
 end loop;
 insert into public.ledger_payment_reversals
  (payment_id,owner_id,reversal_journal_id,reason,reversed_by)
 values(p_payment,p_owner,v_reversal,trim(p_reason),v_actor);
 update public.ledger_payments set state='reversed' where id=p_payment;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,old_value,new_value)
 values(p_owner,v_actor,'ledger_payments',p_payment,'UPDATE',
   jsonb_build_object('state','confirmed','journal_id',v_payment.journal_id),
   jsonb_build_object('state','reversed','reversal_journal_id',v_reversal,'reason',trim(p_reason)));
 return jsonb_build_object('state','reversed','journal_id',v_reversal,'duplicate',false);
end $f$;

create or replace function public.ledger_disable_staff(p_email text) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v_owner uuid:=(select auth.uid());v_user uuid;
begin
 if v_owner is null then raise exception 'OWNER_ONLY' using errcode='42501';end if;
 select id into v_user from auth.users where lower(email)=lower(trim(p_email));
 if v_user is null then raise exception 'STAFF_NOT_FOUND' using errcode='22023';end if;
 update public.ledger_staff_members set active=false
   where owner_id=v_owner and user_id=v_user and active;
 if not found then raise exception 'STAFF_MEMBERSHIP_NOT_FOUND' using errcode='22023';end if;
 insert into public.ledger_audit(owner_id,actor_id,entity_type,entity_id,action,new_value)
 values(v_owner,v_owner,'ledger_staff_members',v_user,'UPDATE',jsonb_build_object('active',false));
 return jsonb_build_object('active',false);
end $f$;

revoke all on function public.ledger_reverse_payment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ledger_disable_staff(text) from public,anon,authenticated;
grant execute on function public.ledger_reverse_payment(uuid,uuid,text) to authenticated;
grant execute on function public.ledger_disable_staff(text) to authenticated;

-- Enrich ONLY the linked customer's statement with the frozen exchange rate and their payment legs.
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
      'note',e.note,'related_id',e.related_id,
      'payment_details',(select jsonb_build_object(
         'fx_syp_per_usd',p.fx_syp_per_usd,'usdt_usd_rate',p.usdt_usd_rate,
         'settled_amount',p.settled_amount,'debt_currency',p.debt_currency,
         'legs',coalesce((select jsonb_agg(jsonb_build_object(
                'method',a.channel,'wallet',a.label,
                'currency',part.currency,'amount',part.amount)
                order by a.created_at,part.id)
             from public.ledger_payment_parts part
             join public.ledger_cash_accounts a on a.id=part.account_id
                and a.owner_id=p.owner_id
             where part.payment_id=p.id and part.owner_id=p.owner_id),'[]'::jsonb))
         from public.ledger_payments p
         where p.owner_id=v_link.owner_id and p.customer_id=v_link.customer_id
           and p.journal_id=e.id limit 1)) order by e.happened_at desc,e.id)
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

