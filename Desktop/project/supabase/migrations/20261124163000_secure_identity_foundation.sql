create table if not exists public.sections (
  id text primary key,
  name text not null unique,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.sections (id, name, display_order) values
  ('math', 'Mathématiques', 0),
  ('science', 'Sciences expérimentales', 1),
  ('technical', 'Technique', 2),
  ('economy', 'Économie et gestion', 3),
  ('computer-science', 'Informatique', 4),
  ('letters', 'Lettres', 5),
  ('sport', 'Sport', 6)
on conflict (id) do update
set name = excluded.name, display_order = excluded.display_order;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  section_id text references public.sections (id) on delete set null,
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  blocked boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  updated_at timestamptz not null default now()
);

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and blocked = false
  );
$$;

create or replace function public.prevent_self_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() = old.id
    and not public.is_current_user_admin()
    and (new.role is distinct from old.role or new.blocked is distinct from old.blocked) then
    raise exception 'Profile role and messaging status can only be changed by an administrator';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
before update on public.profiles
for each row execute function public.prevent_self_privilege_change();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_section_id text;
begin
  selected_section_id := nullif(new.raw_user_meta_data ->> 'sectionId', '');

  insert into public.profiles (id, full_name, section_id, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Élève'),
    selected_section_id,
    'student'
  );

  insert into public.profile_private (user_id, phone)
  values (new.id, new.phone);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

alter table public.sections enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

drop policy if exists "active sections are readable" on public.sections;
create policy "active sections are readable"
on public.sections for select
to anon, authenticated
using (active);

drop policy if exists "admins manage sections" on public.sections;
create policy "admins manage sections"
on public.sections for all
to authenticated
using ((select public.is_current_user_admin()))
with check ((select public.is_current_user_admin()));

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or (select public.is_current_user_admin()));

drop policy if exists "users create own student profile" on public.profiles;
create policy "users create own student profile"
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()) and role = 'student' and blocked = false);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()) or (select public.is_current_user_admin()))
with check (id = (select auth.uid()) or (select public.is_current_user_admin()));

drop policy if exists "users read own private profile" on public.profile_private;
create policy "users read own private profile"
on public.profile_private for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_current_user_admin()));

drop policy if exists "users insert own private profile" on public.profile_private;
create policy "users insert own private profile"
on public.profile_private for insert
to authenticated
with check (user_id = (select auth.uid()) or (select public.is_current_user_admin()));

drop policy if exists "users update own private profile" on public.profile_private;
create policy "users update own private profile"
on public.profile_private for update
to authenticated
using (user_id = (select auth.uid()) or (select public.is_current_user_admin()))
with check (user_id = (select auth.uid()) or (select public.is_current_user_admin()));

grant select on public.sections to anon, authenticated;
grant insert, update, delete on public.sections to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.profile_private to authenticated;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;
revoke all on function public.prevent_self_privilege_change() from public, anon, authenticated;
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
