-- Append after qa_transaction_rollback.sql inside the SAME rollback transaction.
do $qa$
declare v_owner uuid;v_customer uuid;v_closed_account uuid;v_staff uuid;v_email text;
 v_new_account uuid;v_result jsonb;v_payment uuid;v_journal uuid;v_reversed uuid;v_fail boolean;
 v_today date:=(now() at time zone 'Asia/Damascus')::date;
begin
 select owner_id,customer_id into v_owner,v_customer from public.ledger_payments
 where memo='QA three-leg payment' limit 1;
 select id into v_closed_account from public.ledger_cash_accounts
 where owner_id=v_owner and label='QA USD' limit 1;
 select m.user_id,u.email into v_staff,v_email from public.ledger_staff_members m
 join auth.users u on u.id=m.user_id where m.owner_id=v_owner and m.role='cashier' limit 1;
 if v_owner is null or v_closed_account is null or v_staff is null then raise exception 'REVERSE_QA_FIXTURES_MISSING';end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 -- The old QA already closed this account: no confirmed or manual movements after close.
 v_result:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
    jsonb_build_array(jsonb_build_object('account_id',v_closed_account,'amount',1)),
    'QA post-close payment',gen_random_uuid());
 v_fail:=false;
 begin perform public.ledger_confirm_payment((v_result->>'id')::uuid,v_owner);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'CLOSED_DAY_ACCEPTED_NEW_PAYMENT';end if;
 v_fail:=false;
 begin perform public.ledger_add_cash_movement(v_owner,v_closed_account,1,'deposit','QA after close',null);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'CLOSED_DAY_ACCEPTED_MANUAL_MOVEMENT';end if;
 insert into ledger_upgrade_qa values('closed_day_blocks_late_movements','pass');

 insert into public.ledger_cash_accounts(owner_id,label,channel,currency)
 values(v_owner,'QA reversal USD','cash','USD') returning id into v_new_account;
 insert into public.journal(owner_id,subject_id,category,value,delta,currency,note)
 values(v_owner,v_customer,'charge',25,25,'USD','QA reversal charge rollback only');
 v_result:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
    jsonb_build_array(jsonb_build_object('account_id',v_new_account,'amount',6)),
    'QA reverse payment',gen_random_uuid());
 v_payment:=(v_result->>'id')::uuid;
 v_result:=public.ledger_confirm_payment(v_payment,v_owner);
 v_journal:=(v_result->>'journal_id')::uuid;

 -- No bypass via the legacy generic reversal API.
 v_fail:=false;
 begin
  insert into public.journal(owner_id,subject_id,category,currency,value,delta,related_id)
  values(v_owner,v_customer,'receipt_reversal','USD',-6,6,v_journal);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'LEGACY_REVERSAL_BYPASS';end if;
 insert into ledger_upgrade_qa values('unsafe_legacy_reversal_blocked','pass');

 v_result:=public.ledger_reverse_payment(v_owner,v_payment,'فشل التحويل إلى المحفظة');
 v_reversed:=(v_result->>'journal_id')::uuid;
 if v_result->>'state'<>'reversed' or
   (select delta from public.journal where id=v_reversed)<>6 then
   raise exception 'REVERSAL_WRONG_DEBT_EFFECT';end if;
 if (select sum(amount) from public.ledger_cash_movements
    where reversal_payment_id=v_payment and account_id=v_new_account)<>-6 then
   raise exception 'REVERSAL_CASH_NOT_RECORDED';end if;
 if (select (b->>'expected')::numeric from jsonb_array_elements(
     public.ledger_cash_balances(v_owner,v_today)) b
     where b->>'account_id'=v_new_account::text)<>0 then
   raise exception 'REVERSAL_CASH_BALANCE_WRONG';end if;
 v_result:=public.ledger_reverse_payment(v_owner,v_payment,'duplicate retry');
 if (v_result->>'journal_id')::uuid<>v_reversed or (v_result->>'duplicate')::boolean is not true
 then raise exception 'REVERSAL_NOT_IDEMPOTENT';end if;
 if (select count(*) from public.ledger_cash_movements where reversal_payment_id=v_payment)<>1
 then raise exception 'DUPLICATE_REVERSAL_MOVEMENT';end if;
 insert into ledger_upgrade_qa values('reversal_debt_cash_idempotency','pass');

 perform public.ledger_disable_staff(v_email);
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 v_fail:=false;
 begin perform public.ledger_cash_balances(v_owner,v_today);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'DISABLED_STAFF_ACCESS_ALLOWED';end if;
 insert into ledger_upgrade_qa values('disabled_staff_access_denied','pass');
end $qa$;
-- Verify the no-email portal exposes ONLY this customer’s frozen rate and three actual wallets.
do $qa$
declare v_owner uuid; v_customer uuid;v_entry uuid;v_code text;v_statement jsonb;v_line jsonb;v_old_hash text;
begin
 select owner_id,customer_id,journal_id into v_owner,v_customer,v_entry
 from public.ledger_payments where memo='QA three-leg payment' limit 1;
 select code_hash into v_old_hash from public.ledger_portal_codes
 where owner_id=v_owner and customer_id=v_customer and revoked_at is null limit 1;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 v_code:=public.ledger_issue_portal_code(v_customer);
 if v_old_hash is not null and
  not exists (select 1 from public.ledger_portal_codes
       where code_hash=v_old_hash and revoked_at is not null)
 then raise exception 'PREVIOUS_PORTAL_CODE_STILL_ACTIVE';end if;
 if (select count(*) from public.ledger_portal_codes
       where owner_id=v_owner and customer_id=v_customer and revoked_at is null)<>1
 then raise exception 'MULTIPLE_ACTIVE_PORTAL_CODES';end if;
 perform set_config('request.jwt.claim.sub','',true);
 v_statement:=public.ledger_portal_statement(v_code);
 select e into v_line from jsonb_array_elements(v_statement->'entries') e
 where e->>'id'=v_entry::text limit 1;
 if v_line is null or (v_line->'payment_details'->>'fx_syp_per_usd')::numeric<>10000 or
    jsonb_array_length(v_line->'payment_details'->'legs')<>3
 then raise exception 'PORTAL_PAYMENT_BREAKDOWN_MISSING';end if;
 if v_statement->'customer' ? 'email' then raise exception 'PORTAL_EMAIL_LEAK';end if;
 insert into ledger_upgrade_qa values('portal_frozen_fx_three_wallet_breakdown','pass');
 insert into ledger_upgrade_qa values('reissuing_code_revokes_previous','pass');
end $qa$;
select test,result from ledger_upgrade_qa order by test;
