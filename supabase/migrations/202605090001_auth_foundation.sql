create type public.user_role as enum ('admin', 'employee');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

create or replace function public.has_role(check_user_id uuid, check_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role = check_role
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  should_bootstrap_admin boolean;
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name);

  select not exists (
    select 1
    from public.user_roles
    where role = 'admin'
  )
  into should_bootstrap_admin;

  if should_bootstrap_admin then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "Users can select own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Admins can select all profiles"
on public.profiles
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Users can select own role rows"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can select all role rows"
on public.user_roles
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
