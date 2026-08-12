-- Run once in Supabase SQL Editor. Updates all stage target/completion values
-- atomically and enforces a 100% total allocation.
create or replace function public.update_project_with_stages(
  target_project uuid,
  new_title text,
  new_completion smallint,
  stage_values jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare allocation_total integer;
begin
  if not exists (select 1 from public.projects where id = target_project and owner_id = auth.uid()) then
    raise exception 'Only the project owner can edit this project.';
  end if;
  if new_completion not between 0 and 100 then raise exception 'Overall completion must be from 0 to 100.'; end if;
  if jsonb_typeof(stage_values) = 'array' then
    select coalesce(sum((value ->> 'allocation')::integer), 0) into allocation_total from jsonb_array_elements(stage_values);
    if allocation_total <> 100 then raise exception 'Stage target percentages must total 100%%.'; end if;
    update public.project_stages s set allocation = (v.value ->> 'allocation')::smallint, progress = (v.value ->> 'progress')::smallint
    from jsonb_array_elements(stage_values) v(value)
    where s.id = (v.value ->> 'id')::uuid and s.project_id = target_project;
  end if;
  update public.projects set title = new_title, completion = new_completion, updated_at = now() where id = target_project;
end;
$$;
grant execute on function public.update_project_with_stages(uuid, text, smallint, jsonb) to authenticated;
