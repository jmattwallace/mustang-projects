-- Run once in Supabase SQL Editor. Project creation is performed in one
-- transaction and ownership is always forced to the signed-in user.
create or replace function public.create_new_project()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare project_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and is_active
  ) then
    raise exception 'An active signed-in profile is required to create a project.';
  end if;

  insert into public.projects (owner_id, title)
  values (auth.uid(), 'Untitled project')
  returning id into project_id;

  insert into public.project_stages (project_id, stage_key, name, allocation, progress, color)
  values
    (project_id, 'pre', 'Pre', 15, 0, '#9c8344'),
    (project_id, 'production', 'Production', 25, 0, '#cf2626'),
    (project_id, 'post_production', 'Post-production', 50, 0, '#e7df2b'),
    (project_id, 'confirm', 'Confirm', 10, 0, '#3d7d2a');

  return project_id;
end;
$$;

grant execute on function public.create_new_project() to authenticated;
