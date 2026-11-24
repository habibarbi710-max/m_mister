drop policy if exists "active sections are readable" on public.sections;
create policy "active sections are readable"
on public.sections for select
to anon, authenticated
using (active);
