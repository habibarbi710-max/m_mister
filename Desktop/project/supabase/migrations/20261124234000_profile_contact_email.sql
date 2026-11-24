alter table public.profile_private
  add column if not exists email text;

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
  insert into public.profiles(
    id, full_name, section_id, role, blocked, approval_status
  )
  values(
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), 'Élève'),
    selected_section_id,
    'student',
    false,
    'pending'
  );
  insert into public.profile_private(user_id, phone, email)
  values(new.id, new.phone, new.email);
  return new;
end;
$$;
