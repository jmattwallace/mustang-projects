-- Run once in the Supabase SQL Editor before using target dates.
alter table public.projects add column if not exists target_date date;
alter table public.project_stages add column if not exists target_date date;

create or replace function public.update_project_finance_and_stages(
  target_project uuid,
  new_title text,
  new_completion smallint,
  new_gross numeric,
  new_net numeric,
  new_target_date date,
  stage_values jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare allocation_total integer;
begin
  if not exists (select 1 from public.projects where id = target_project and owner_id = auth.uid()) then
    raise exception 'Only the project owner can edit this project.';
  end if;

  if jsonb_typeof(stage_values) = 'array' then
    select coalesce(sum((value ->> 'allocation')::integer), 0)
      into allocation_total from jsonb_array_elements(stage_values);
    if allocation_total <> 100 then
      raise exception 'Stage target percentages must total 100%%.';
    end if;
    update public.project_stages s set
      name = v.value ->> 'name',
      allocation = (v.value ->> 'allocation')::smallint,
      progress = (v.value ->> 'progress')::smallint,
      target_date = nullif(v.value ->> 'target_date', '')::date
    from jsonb_array_elements(stage_values) v(value)
    where s.id = (v.value ->> 'id')::uuid and s.project_id = target_project;

    update public.projects set
      title = new_title,
      completion = new_completion,
      projected_gross = new_gross,
      projected_net = new_net,
      target_date = (select max(target_date) from public.project_stages where project_id = target_project),
      updated_at = now()
    where id = target_project;
  else
    update public.projects set
      title = new_title,
      completion = new_completion,
      projected_gross = new_gross,
      projected_net = new_net,
      target_date = new_target_date,
      updated_at = now()
    where id = target_project;
  end if;
end; $$;

grant execute on function public.update_project_finance_and_stages(uuid, text, smallint, numeric, numeric, date, jsonb) to authenticated;
