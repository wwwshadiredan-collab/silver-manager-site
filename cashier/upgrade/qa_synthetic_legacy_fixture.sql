-- CI ONLY: anonymized shape-compatible snapshot of the existing Cashier Ledger legacy schema.
-- Fake identifiers, fake emails, fake balances. NEVER use production user data here.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table auth.users(
 id uuid primary key,
 email text,
 created_at timestamptz not null default now()
);
insert into auth.users(id,email,created_at) values
 ('10000000-0000-4000-8000-000000000001','owner1@qa.invalid','2026-09-20 00:00:00Z'),
 ('20000000-0000-4000-8000-000000000002','owner2@qa.invalid','2026-09-20 00:00:00Z'),
 ('30000000-0000-4000-8000-000000000003','staff@qa.invalid','2026-09-20 00:00:00Z');
create table public.customers(
 user_id uuid not null references auth.users(id),
 name text not null check(char_length(trim(name))>0),
 phone text,
 notes text,
 id uuid primary key default gen_random_uuid(),
 is_archived boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.journal(
 owner_id uuid not null references auth.users(id),
 subject_id uuid,
 category text not null,
 note text,
 related_id uuid,
 id uuid primary key default gen_random_uuid(),
 value numeric not null default 0,
 secondary_value numeric not null default 0,
 delta numeric not null default 0,
 happened_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 currency text not null default 'USD' check(currency in ('USD','SYP'))
);
create table public.audit_events(
 owner_id uuid not null references auth.users(id),
 label text not null,
 ref_type text,
 ref_id uuid,
 id uuid primary key default gen_random_uuid(),
 payload jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table public.signup_invitation_codes(
 code_hash text primary key,
 active boolean not null default true,
 max_uses integer not null default 1,
 uses integer not null default 0,
 created_at timestamptz not null default now(),
 recipient_email text,
 expires_at timestamptz,
 redeemed_email text,
 redeemed_at timestamptz
);
create table public.cashier_invite_admins(
 user_id uuid primary key references auth.users(id)
);
alter table public.customers enable row level security;
alter table public.journal enable row level security;
alter table public.audit_events enable row level security;
alter table public.signup_invitation_codes enable row level security;
alter table public.cashier_invite_admins enable row level security;
create policy customers_own_insert on public.customers for insert to authenticated with check ((select auth.uid())=user_id);
create policy customers_own_select on public.customers for select to authenticated using((select auth.uid())=user_id);
create policy customers_own_update on public.customers for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy journal_own_insert on public.journal for insert to authenticated with check ((select auth.uid())=owner_id);
create policy journal_own_select on public.journal for select to authenticated using((select auth.uid())=owner_id);
create policy audit_own_insert on public.audit_events for insert to authenticated with check((select auth.uid())=owner_id);
create policy audit_own_select on public.audit_events for select to authenticated using((select auth.uid())=owner_id);
grant usage on schema public,auth to authenticated;
grant select,insert,update on public.customers to authenticated;
grant select,insert on public.journal,public.audit_events to authenticated;
grant usage on schema public to anon;
grant execute on function auth.uid() to authenticated,anon;

insert into public.customers(user_id,id,name,created_at) values
 ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','Synthetic Customer A','2026-09-20 00:00:00Z'),
 ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000005','Synthetic Customer B','2026-09-21 00:00:00Z');
insert into public.journal(owner_id,subject_id,category,value,delta,currency,note,created_at,happened_at)
select case when n<=5 then '10000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000002'::uuid end,
 case when n<=5 then '40000000-0000-4000-8000-000000000004'::uuid else '50000000-0000-4000-8000-000000000005'::uuid end,
 'charge',n,n,'USD','Synthetic legacy event '||n,'2026-09-20 00:00:00Z'::timestamptz+n*interval '1 minute',
 '2026-09-20 00:00:00Z'::timestamptz+n*interval '1 minute'
from generate_series(1,9) n;
insert into public.audit_events(owner_id,label,created_at)
select '10000000-0000-4000-8000-000000000001','Synthetic legacy event '||n,
 '2026-09-20 00:00:00Z'::timestamptz+n*interval '1 minute' from generate_series(1,11)n;
insert into public.signup_invitation_codes(code_hash,active,max_uses,uses)
 values(repeat('a',64),true,1,0),(repeat('b',64),true,1,0);
insert into public.cashier_invite_admins(user_id)
 values('10000000-0000-4000-8000-000000000001');
