-- Run once in Supabase SQL Editor. This repairs the project-create policy
-- for Google-authenticated users while preserving single-owner security.
drop policy if exists "users create own projects" on public.projects;
create policy "users create own projects" on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = projects.owner_id
        and lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and p.is_active
    )
  );
