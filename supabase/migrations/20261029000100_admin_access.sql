-- Private allowlist for staff accounts that can review loan applications.
create table if not exists public.loan_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.loan_admin_users enable row level security;
revoke all on table public.loan_admin_users from anon, authenticated;
grant all on table public.loan_admin_users to service_role;
