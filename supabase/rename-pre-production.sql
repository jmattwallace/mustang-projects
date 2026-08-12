-- Run once in Supabase SQL Editor to rename existing and future stage records.
update public.project_stages set name = 'Pre-Production' where stage_key = 'pre';

create or replace function public.enable_project_stages(target_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.projects where id = target_project and owner_id = auth.uid()) then raise exception 'Only the project owner can enable stages.'; end if;
  insert into public.project_stages (project_id, stage_key, name, allocation, progress, color)
  select target_project, v.stage_key, v.name, v.allocation, 0, v.color
  from (values ('pre', 'Pre-Production', 15, '#779c79'), ('production', 'Production', 25, '#779c79'), ('post_production', 'Post-production', 50, '#779c79'), ('confirm', 'Confirm', 10, '#779c79')) as v(stage_key, name, allocation, color)
  where not exists (select 1 from public.project_stages where project_id = target_project);
  update public.projects set mode='staged', updated_at=now() where id=target_project;
end; $$;
