-- Run after both staged migrations in a single BEGIN ... ROLLBACK transaction.
-- This script MUST NEVER be committed to a production migration or run outside ROLLBACK.
create temp table ledger_upgrade_qa(test text primary key,result text not null);
do $qa$
declare v_owner uuid;v_customer uuid;v_other uuid;v_staff uuid;v_staff_email text;
        v_usd uuid;v_syp uuid;v_usdt uuid;v_payment uuid;v_rejected uuid;v_journal uuid;
        v_request uuid:=gen_random_uuid();v_code text;v_statement jsonb;v_payload jsonb;v_res jsonb;
        v_count_before bigint;v_count_after bigint;v_fail boolean;v_day date:=(now() at time zone 'Asia/Damascus')::date;
begin
 select user_id,id into v_owner,v_customer from public.customers order by created_at limit 1;
 select id into v_other from public.customers where user_id<>v_owner limit 1;
 select id,email into v_staff,v_staff_email from auth.users where id<>v_owner and email is not null limit 1;
 if v_owner is null or v_customer is null or v_other is null or v_staff is null then
   raise exception 'QA_FIXTURES_UNAVAILABLE';end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);

 -- New portal codes do not require a customer email; no legacy invitation is changed.
 v_code:=public.ledger_issue_portal_code(v_customer);
 v_statement:=public.ledger_portal_statement(v_code);
 if v_statement->'customer'->>'name' is null then raise exception 'PORTAL_CUSTOMER_MISSING';end if;
 if v_statement->'customer' ? 'email' then raise exception 'PORTAL_EMAIL_EXPOSED';end if;
 insert into ledger_upgrade_qa values('portal_code_no_email','pass');
 v_fail:=false;
 begin perform public.ledger_issue_portal_code(v_other);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'CROSS_TENANT_CODE_ALLOWED';end if;
 insert into ledger_upgrade_qa values('cross_tenant_issue_denied','pass');

 insert into public.ledger_cash_accounts(owner_id,label,channel,currency)
 values(v_owner,'QA USD','cash','USD') returning id into v_usd;
 insert into public.ledger_cash_accounts(owner_id,label,channel,currency)
 values(v_owner,'QA شام كاش','sham_cash','SYP') returning id into v_syp;
 insert into public.ledger_cash_accounts(owner_id,label,channel,currency)
 values(v_owner,'QA USDT','usdt','USDT') returning id into v_usdt;

 insert into public.journal(owner_id,subject_id,category,value,delta,currency,note)
 values(v_owner,v_customer,'charge',100,100,'USD','QA charge rollback only');
 select count(*) into v_count_before from public.journal where owner_id=v_owner and subject_id=v_customer;
 v_payload:=jsonb_build_array(
   jsonb_build_object('account_id',v_usd,'amount',3),
   jsonb_build_object('account_id',v_syp,'amount',20000),
   jsonb_build_object('account_id',v_usdt,'amount',5));
 v_res:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,v_payload,'QA three-leg payment',v_request);
 v_payment:=(v_res->>'id')::uuid;
 if (v_res->>'settled_amount')::numeric<>10 or v_res->>'state'<>'pending' then
    raise exception 'MIXED_PAYMENT_CALCULATION_FAILED %',v_res;end if;
 select count(*) into v_count_after from public.journal where owner_id=v_owner and subject_id=v_customer;
 if v_count_after<>v_count_before then raise exception 'PENDING_PAYMENT_CHANGED_JOURNAL';end if;
 insert into ledger_upgrade_qa values('mixed_usd_syp_usdt_pending_no_deduction','pass');
 if (select count(*) from public.ledger_payment_parts where payment_id=v_payment)<>3 then
    raise exception 'PAYMENT_PARTS_MISSING';end if;
 if (select fx_syp_per_usd from public.ledger_payments where id=v_payment)<>10000 then
    raise exception 'EXCHANGE_RATE_NOT_FROZEN';end if;
 insert into ledger_upgrade_qa values('fixed_rate_and_three_wallet_legs','pass');

 v_res:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,v_payload,'QA retry',v_request);
 if (v_res->>'id')::uuid<>v_payment or (v_res->>'duplicate')::boolean is not true then
    raise exception 'PREPARE_NOT_IDEMPOTENT';end if;
 insert into ledger_upgrade_qa values('prepare_idempotent','pass');

 -- Replaying with a different user must fail before returning/confirming a foreign payment.
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 v_fail:=false;
 begin perform public.ledger_confirm_payment(v_payment,v_owner);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'UNAUTHORIZED_CONFIRM_ACCEPTED';end if;
 insert into ledger_upgrade_qa values('unauthorized_staff_denied','pass');
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 v_res:=public.ledger_confirm_payment(v_payment,v_owner);
 v_journal:=(v_res->>'journal_id')::uuid;
 select count(*) into v_count_after from public.journal where owner_id=v_owner and subject_id=v_customer;
 if v_count_after<>v_count_before+1 or
    (select delta from public.journal where id=v_journal)<>-10 then
       raise exception 'CONFIRM_RECEIPT_INCORRECT';end if;
 v_res:=public.ledger_confirm_payment(v_payment,v_owner);
 if (v_res->>'journal_id')::uuid<>v_journal or (v_res->>'duplicate')::boolean is not true then
    raise exception 'CONFIRM_NOT_IDEMPOTENT';end if;
 insert into ledger_upgrade_qa values('manual_confirmation_exactly_once','pass');

 v_res:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
     jsonb_build_array(jsonb_build_object('account_id',v_usd,'amount',1)),'QA reject',gen_random_uuid());
 v_rejected:=(v_res->>'id')::uuid;
 perform public.ledger_reject_payment(v_rejected,v_owner,'مرفوض تجريبي');
 select count(*) into v_count_after from public.journal where owner_id=v_owner and subject_id=v_customer;
 if v_count_after<>v_count_before+1 then raise exception 'REJECT_CHANGED_JOURNAL';end if;
 v_fail:=false;begin perform public.ledger_confirm_payment(v_rejected,v_owner);
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'REJECTED_PAYMENT_CONFIRMED';end if;
 insert into ledger_upgrade_qa values('rejection_never_deducts','pass');

 v_res:=public.ledger_cash_balances(v_owner,v_day);
 if jsonb_array_length(v_res)<>3 then raise exception 'BALANCE_ACCOUNTS_MISSING';end if;
 if (select (x->>'expected')::numeric from jsonb_array_elements(v_res) x
    where x->>'account_id'=v_usd::text)<>3 then raise exception 'USD_CASH_BALANCE_FAILED';end if;
 if (select (x->>'expected')::numeric from jsonb_array_elements(v_res) x
    where x->>'account_id'=v_syp::text)<>20000 then raise exception 'SYP_CASH_BALANCE_FAILED';end if;
 if (select (x->>'expected')::numeric from jsonb_array_elements(v_res) x
    where x->>'account_id'=v_usdt::text)<>5 then raise exception 'USDT_CASH_BALANCE_FAILED';end if;
 insert into ledger_upgrade_qa values('separate_currency_wallet_balances','pass');

 v_res:=public.ledger_close_day(v_owner,v_usd,v_day,2.5,'QA variance');
 if (v_res->>'expected')::numeric<>3 or (v_res->>'difference')::numeric<>-0.5 then
    raise exception 'DAY_CLOSE_VARIANCE_WRONG';end if;
 v_fail:=false;begin perform public.ledger_close_day(v_owner,v_usd,v_day,2.5,'duplicate close');
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'DOUBLE_CLOSE_ALLOWED';end if;
 insert into ledger_upgrade_qa values('daily_close_variance_unique','pass');

 -- The customer may dispute only a journal entry belonging to their assigned account.
 perform set_config('request.jwt.claim.sub','',true);
 v_res:=public.ledger_portal_statement(v_code);
 if not exists (select 1 from jsonb_array_elements(v_res->'entries') e
                where e->>'id'=v_journal::text) then raise exception 'STATEMENT_OMITTED_RECEIPT';end if;
 perform public.ledger_portal_dispute(v_code,v_journal,'المبلغ غير مطابق للحوالة');
 v_res:=public.ledger_portal_statement(v_code);
 if jsonb_array_length(v_res->'disputes')<>1 then raise exception 'DISPUTE_NOT_VISIBLE';end if;
 v_fail:=false;begin perform public.ledger_portal_dispute(v_code,v_other,'اعتراض على زبون آخر');
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'CROSS_CUSTOMER_DISPUTE_ALLOWED';end if;
 insert into ledger_upgrade_qa values('customer_statement_dispute_isolation','pass');

 -- Role assignment requires owner authorization; viewer cannot post, cashier can.
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform public.ledger_assign_staff(v_staff_email,'viewer');
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 v_fail:=false;begin perform public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
  jsonb_build_array(jsonb_build_object('account_id',v_usd,'amount',1)),'viewer attempt',gen_random_uuid());
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'VIEWER_POST_ALLOWED';end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform public.ledger_assign_staff(v_staff_email,'cashier');
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 v_res:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
  jsonb_build_array(jsonb_build_object('account_id',v_usd,'amount',1)),'staff draft',gen_random_uuid());
 if v_res->>'state'<>'pending' then raise exception 'CASHIER_CANNOT_PREPARE';end if;
 v_fail:=false;begin perform public.ledger_close_day(v_owner,v_usd,v_day,2.5,'staff close attempt');
 exception when others then v_fail:=true;end;
 if not v_fail then raise exception 'CASHIER_CAN_CLOSE';end if;
 insert into ledger_upgrade_qa values('viewer_cashier_manager_permissions','pass');

 if (select count(*) from public.ledger_audit where owner_id=v_owner)<6
 then raise exception 'AUDIT_TRAIL_MISSING';end if;
 insert into ledger_upgrade_qa values('database_side_audit_trail','pass');
end $qa$;
select test,result from ledger_upgrade_qa order by test;
