-- Run once in Supabase SQL Editor.
-- New projects default to Simple. Existing projects with stage records remain Staged.
do $$ begin
  create type public.project_mode as enum ('simple', 'staged');
exception when duplicate_object then null;
end $$;

alter table public.projects add column if not exists mode public.project_mode not null default 'simple';
update public.projects set mode = 'staged' where exists (
  select 1 from public.project_stages s where s.project_id = projects.id
);

create or replace function public.create_new_project()
returns uuid language plpgsql security definer set search_path = public as $$
declare project_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'An active signed-in profile is required to create a project.';
  end if;
  insert into public.projects (owner_id, title, mode)
  values (auth.uid(), 'Untitled project', 'simple')
  returning id into project_id;
  return project_id;
end;
$$;

create or replace function public.enable_project_stages(target_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.projects where id = target_project and owner_id = auth.uid()) then
    raise exception 'Only the project owner can enable stages.';
  end if;
  insert into public.project_stages (project_id, stage_key, name, allocation, progress, color)
  select target_project, v.stage_key, v.name, v.allocation, 0, v.color
  from (values
    ('pre', 'Pre', 15, '#9c8344'),
    ('production', 'Production', 25, '#cf2626'),
    ('post_production', 'Post-production', 50, '#e7df2b'),
    ('confirm', 'Confirm', 10, '#3d7d2a')
  ) as v(stage_key, name, allocation, color)
  where not exists (select 1 from public.project_stages where project_id = target_project);
  update public.projects set mode = 'staged', updated_at = now() where id = target_project;
end;
$$;
grant execute on function public.create_new_project() to authenticated;
grant execute on function public.enable_project_stages(uuid) to authenticated;
