create table if not exists public.app_state (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  owner_id uuid references auth.users (id) on delete cascade,
  scope text not null default 'authenticated'
    check (scope in ('public', 'authenticated', 'user', 'teacher', 'admin')),
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_state_owner_key_idx on public.app_state (owner_id, key);
create index if not exists app_state_scope_key_idx on public.app_state (scope, key);
create unique index if not exists app_state_global_key_idx on public.app_state (key) where owner_id is null;
create unique index if not exists app_state_user_key_idx on public.app_state (owner_id, key) where owner_id is not null;

alter table public.app_state enable row level security;

drop policy if exists "public app state readable" on public.app_state;
create policy "public app state readable"
on public.app_state for select
to anon, authenticated
using (scope = 'public');

drop policy if exists "authenticated app state readable" on public.app_state;
create policy "authenticated app state readable"
on public.app_state for select
to authenticated
using (
  scope = 'authenticated'
  or (scope = 'user' and owner_id = (select auth.uid()))
  or (
    scope in ('teacher', 'admin')
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and blocked = false
        and (scope = 'teacher' and role in ('teacher', 'admin')
          or scope = 'admin' and role = 'admin')
    )
  )
);

drop policy if exists "users write own app state" on public.app_state;
create policy "users write own app state"
on public.app_state for insert
to authenticated
with check (scope = 'user' and owner_id = (select auth.uid()));

drop policy if exists "users update own app state" on public.app_state;
create policy "users update own app state"
on public.app_state for update
to authenticated
using (scope = 'user' and owner_id = (select auth.uid()))
with check (scope = 'user' and owner_id = (select auth.uid()));

drop policy if exists "admins write global app state" on public.app_state;
create policy "admins write global app state"
on public.app_state for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and blocked = false
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and blocked = false
  )
);

drop policy if exists "teachers write teacher app state" on public.app_state;
create policy "teachers write teacher app state"
on public.app_state for all
to authenticated
using (
  scope = 'teacher'
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('teacher', 'admin') and blocked = false
  )
)
with check (
  scope = 'teacher'
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('teacher', 'admin') and blocked = false
  )
);

grant select on public.app_state to anon, authenticated;
grant insert, update, delete on public.app_state to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-attachments',
  'app-attachments',
  false,
  10485760,
  array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv','text/markdown','text/rtf','image/jpeg','image/png',
    'image/webp','image/gif','audio/mpeg','audio/wav','audio/mp4','video/mp4',
    'video/webm','video/quicktime','application/zip'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users read own attachments" on storage.objects;
create policy "users read own attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'app-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users upload own attachments" on storage.objects;
create policy "users upload own attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'app-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users update own attachments" on storage.objects;
create policy "users update own attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'app-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'app-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users delete own attachments" on storage.objects;
create policy "users delete own attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'app-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
