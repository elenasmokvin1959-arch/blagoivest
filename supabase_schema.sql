create table if not exists public.app_users (
  phone text primary key,
  name text not null,
  country_code text,
  sponsor text references public.app_users(phone) on delete set null,
  password_hash text not null,
  password_salt text not null,
  app_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_sponsor_idx on public.app_users(sponsor);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_users_updated_at on public.app_users;

create trigger set_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;

drop policy if exists "server only app users" on public.app_users;

create policy "server only app users"
on public.app_users
for all
using (false)
with check (false);
