-- CI-only fingerprint of fake legacy data, independent of newly created ledger tables.
select md5(
 coalesce((select jsonb_agg(to_jsonb(c) order by c.id)::text from public.customers c),'[]')||
 coalesce((select jsonb_agg(to_jsonb(j) order by j.id)::text from public.journal j),'[]')||
 coalesce((select jsonb_agg(to_jsonb(a) order by a.id)::text from public.audit_events a),'[]')||
 coalesce((select jsonb_agg(to_jsonb(i) order by i.code_hash)::text from public.signup_invitation_codes i),'[]')||
 coalesce((select jsonb_agg(to_jsonb(k) order by k.user_id)::text from public.cashier_invite_admins k),'[]')
);
