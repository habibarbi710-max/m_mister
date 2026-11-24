alter table public.profiles
  add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id);

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
  insert into public.profiles (
    id, full_name, section_id, role, blocked, approval_status, approved_at, approved_by
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Élève'),
    selected_section_id,
    'student',
    false,
    'pending',
    null,
    null
  );
  insert into public.profile_private (user_id, phone)
  values (new.id, new.phone);
  return new;
end;
$$;
