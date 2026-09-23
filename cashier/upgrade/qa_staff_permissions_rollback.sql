-- QA only. Execute AFTER the three additive draft migrations inside BEGIN ... ROLLBACK.
-- Uses only existing fixture identities; no staff invitation email sent, no real financial change persists.
create temp table qa_staff_permissions(test text primary key, result text not null);
do $qa$
declare
 v_owner uuid;v_customer uuid;v_foreign_owner uuid;v_staff uuid;v_email text;
 v_account uuid;v_pending uuid;v_confirmed uuid;v_result jsonb;
 v_denied boolean;v_count integer;v_original_journal bigint;
begin
 select user_id,id into v_owner,v_customer from public.customers order by created_at limit 1;
 select distinct user_id into v_foreign_owner from public.customers where user_id<>v_owner limit 1;
 select id,email into v_staff,v_email from auth.users
  where id<>v_owner and id<>coalesce(v_foreign_owner,gen_random_uuid()) and email is not null limit 1;
 if v_owner is null or v_customer is null or v_foreign_owner is null or v_staff is null
 then raise exception 'QA_STAFF_FIXTURES_MISSING';end if;
 perform set_config('qa.staff_owner',v_owner::text,true);
 v_original_journal:=(select count(*) from public.journal);
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.ledger_cash_accounts(owner_id,label,channel,currency)
 values(v_owner,'QA staff USD cash','cash','USD') returning id into v_account;
 insert into public.journal(owner_id,subject_id,category,currency,value,delta,note)
 values(v_owner,v_customer,'charge','USD',10,10,'STAFF_QA_ROLLBACK_ONLY');
 perform public.ledger_assign_staff(v_email,'viewer');
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 if not ledger_private.can_work(v_owner,'read')
 or ledger_private.can_work(v_owner,'cashier')
 or ledger_private.can_work(v_owner,'manager')
 then raise exception 'VIEWER_ROLE_INCORRECT';end if;
 v_denied:=false;
 begin
  perform public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
    jsonb_build_array(jsonb_build_object('account_id',v_account,'amount',1)),
    'viewer forbidden',gen_random_uuid());
 exception when insufficient_privilege or raise_exception then v_denied:=true;
 end;
 if not v_denied then raise exception 'VIEWER_PREPARE_ALLOWED';end if;
 v_denied:=false;
 begin
  perform public.ledger_add_cash_movement(v_owner,v_account,1,'deposit','viewer forbidden',null);
 exception when insufficient_privilege or raise_exception then v_denied:=true;
 end;
 if not v_denied then raise exception 'VIEWER_CASH_MOVEMENT_ALLOWED';end if;
 insert into qa_staff_permissions values('viewer_can_read_but_not_post_or_adjust','pass');

 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform public.ledger_assign_staff(v_email,'cashier');
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 if not ledger_private.can_work(v_owner,'cashier') or ledger_private.can_work(v_owner,'manager')
 then raise exception 'CASHIER_ROLE_INCORRECT';end if;
 v_result:=public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
    jsonb_build_array(jsonb_build_object('account_id',v_account,'amount',1)),
    'cashier staged',gen_random_uuid());
 v_pending:=(v_result->>'id')::uuid;
 if v_result->>'state'<>'pending' then raise exception 'CASHIER_PREPARE_FAILED';end if;
 v_result:=public.ledger_confirm_payment(v_pending,v_owner);
 v_confirmed:=(v_result->>'journal_id')::uuid;
 if v_result->>'state'<>'confirmed' then raise exception 'CASHIER_CONFIRM_FAILED';end if;
 v_denied:=false;
 begin
  perform public.ledger_close_day(v_owner,v_account,(now() at time zone 'Asia/Damascus')::date,1,'cashier forbidden');
 exception when insufficient_privilege or raise_exception then v_denied:=true;
 end;
 if not v_denied then raise exception 'CASHIER_CLOSE_ALLOWED';end if;
 insert into qa_staff_permissions values('cashier_can_confirm_but_not_close','pass');

 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform public.ledger_assign_staff(v_email,'manager');
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 if not ledger_private.can_work(v_owner,'manager') then raise exception 'MANAGER_ROLE_INCORRECT';end if;
 v_result:=public.ledger_close_day(v_owner,v_account,(now() at time zone 'Asia/Damascus')::date,1,'manager close QA');
 if v_result->>'id' is null then raise exception 'MANAGER_CLOSE_FAILED';end if;
 insert into qa_staff_permissions values('manager_can_close_and_read_audit','pass');

 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 v_result:=public.ledger_disable_staff(v_email);
 if v_result->>'already_disabled'<>'false' then raise exception 'FIRST_DISABLE_NOT_ACKNOWLEDGED';end if;
 select count(*) into v_count from public.ledger_audit
  where owner_id=v_owner and entity_type='ledger_staff_members'
    and new_value @> '{"active":false}'::jsonb;
 v_result:=public.ledger_disable_staff(v_email);
 if v_result->>'already_disabled'<>'true' then raise exception 'SECOND_DISABLE_NOT_IDEMPOTENT';end if;
 if v_count<>(select count(*) from public.ledger_audit
  where owner_id=v_owner and entity_type='ledger_staff_members'
    and new_value @> '{"active":false}'::jsonb)
 then raise exception 'DUPLICATE_DISABLE_CREATED_AUDIT_EVENT';end if;
 insert into qa_staff_permissions values('duplicate_staff_disable_idempotent','pass');
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 if ledger_private.can_work(v_owner,'read')
 or ledger_private.can_work(v_owner,'cashier')
 or ledger_private.can_work(v_owner,'manager')
 then raise exception 'DISABLED_STAFF_STILL_AUTHORIZED';end if;
 v_denied:=false;
 begin perform public.ledger_cash_balances(v_owner,null);
 exception when insufficient_privilege or raise_exception then v_denied:=true;end;
 if not v_denied then raise exception 'DISABLED_STAFF_CAN_READ_CASH';end if;
 v_denied:=false;
 begin perform public.ledger_prepare_payment(v_owner,v_customer,'USD',10000,1,
    jsonb_build_array(jsonb_build_object('account_id',v_account,'amount',1)),
    'disabled forbidden',gen_random_uuid());
 exception when insufficient_privilege or raise_exception then v_denied:=true;end;
 if not v_denied then raise exception 'DISABLED_STAFF_CAN_PREPARE';end if;
 insert into qa_staff_permissions values('revocation_blocks_existing_session_rpcs','pass');

 if ledger_private.can_work(v_foreign_owner,'read') then
 raise exception 'FOREIGN_WORKSPACE_READ_ALLOWED';end if;
 insert into qa_staff_permissions values('cross_tenant_workspace_denied','pass');
end $qa$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.staff_owner'),true);
do $qa$
declare v_owner uuid:=current_setting('qa.staff_owner')::uuid;v_staff uuid;
 v_email text;v_count integer;
begin
 select s.user_id into v_staff from public.ledger_staff_members s
  where s.owner_id=v_owner and not s.active limit 1;
 if v_staff is null then raise exception 'REVOKED_MEMBERSHIP_MISSING';end if;
 perform set_config('request.jwt.claim.sub',v_staff::text,true);
 select count(*) into v_count from public.customers where user_id=v_owner;
 if v_count<>0 then raise exception 'REVOKED_STAFF_CUSTOMER_RLS_LEAK';end if;
 select count(*) into v_count from public.journal where owner_id=v_owner;
 if v_count<>0 then raise exception 'REVOKED_STAFF_JOURNAL_RLS_LEAK';end if;
 select count(*) into v_count from public.ledger_audit where owner_id=v_owner;
 if v_count<>0 then raise exception 'REVOKED_STAFF_AUDIT_RLS_LEAK';end if;
end $qa$;
reset role;
insert into qa_staff_permissions values('revocation_immediately_hides_customer_journal_audit_rows','pass');
select test,result from qa_staff_permissions order by test;
