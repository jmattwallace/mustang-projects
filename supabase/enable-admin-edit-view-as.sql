-- Run once in the Supabase SQL Editor after add-actual-paid.sql.
-- Lets an administrator work inside a selected person's project board while
-- retaining that person's profile/account privacy.

create or replace function public.can_edit_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.projects p
    where p.id = target_project
      and (p.owner_id = auth.uid() or public.is_admin())
  );
$$;

drop policy if exists "read groups" on public.project_groups;
drop policy if exists "manage own groups" on public.project_groups;
drop policy if exists "admins read all groups" on public.project_groups;
create policy "read groups" on public.project_groups for select to authenticated
  using (creator_id = auth.uid() or public.is_admin());
create policy "manage own groups" on public.project_groups for all to authenticated
  using (creator_id = auth.uid() or public.is_admin())
  with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists "manage own arrangements" on public.saved_arrangements;
create policy "manage own arrangements" on public.saved_arrangements for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create or replace function public.admin_log_project_edit(target_project uuid, action_name text)
returns void language plpgsql security definer set search_path = public as $$
declare target_owner uuid;
begin
  select owner_id into target_owner from public.projects where id = target_project;
  if target_owner is null then raise exception 'Project not found.'; end if;
  if public.is_admin() and target_owner <> auth.uid() then
    insert into public.admin_audit_log (admin_id, action, subject_user_id, project_id, detail)
    values (auth.uid(), action_name, target_owner, target_project, jsonb_build_object('via', 'view_as'));
  end if;
end;
$$;
grant execute on function public.admin_log_project_edit(uuid, text) to authenticated;

create or replace function public.create_project_for_owner(target_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare project_id uuid;
declare owner_to_use uuid;
begin
  owner_to_use := coalesce(target_owner, auth.uid());
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if owner_to_use <> auth.uid() and not public.is_admin() then
    raise exception 'Only an administrator can create a project for another user.';
  end if;
  if not exists (select 1 from public.profiles where id = owner_to_use and is_active) then
    raise exception 'The selected user does not have an active profile.';
  end if;
  insert into public.projects (owner_id, title, mode)
  values (owner_to_use, 'Untitled project', 'simple')
  returning id into project_id;
  perform public.admin_log_project_edit(project_id, 'created project');
  return project_id;
end;
$$;
grant execute on function public.create_project_for_owner(uuid) to authenticated;

create or replace function public.enable_project_stages(target_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_project(target_project) then
    raise exception 'Only the project owner or an administrator can enable stages.';
  end if;
  insert into public.project_stages (project_id, stage_key, name, allocation, progress, color)
  select target_project, v.stage_key, v.name, v.allocation, 0, v.color
  from (values
    ('pre', 'Pre-Production', 15, '#9c8344'),
    ('production', 'Production', 25, '#cf2626'),
    ('post_production', 'Post-production', 50, '#e7df2b'),
    ('confirm', 'Confirm', 10, '#3d7d2a')
  ) as v(stage_key, name, allocation, color)
  where not exists (select 1 from public.project_stages where project_id = target_project);
  update public.projects set mode = 'staged', updated_at = now() where id = target_project;
  perform public.admin_log_project_edit(target_project, 'enabled project stages');
end;
$$;
grant execute on function public.enable_project_stages(uuid) to authenticated;

create or replace function public.update_project_finance_and_stages(
  target_project uuid, new_title text, new_completion smallint, new_gross numeric,
  new_net numeric, new_actual_paid numeric, new_paid_in_full boolean,
  new_target_date date, stage_values jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare allocation_total integer;
begin
  if not public.can_edit_project(target_project) then
    raise exception 'Only the project owner or an administrator can edit this project.';
  end if;
  if jsonb_typeof(stage_values) = 'array' then
    select coalesce(sum((value ->> 'allocation')::integer), 0) into allocation_total from jsonb_array_elements(stage_values);
    if allocation_total <> 100 then raise exception 'Stage target percentages must total 100%%.'; end if;
    update public.project_stages s set
      name = v.value ->> 'name', allocation = (v.value ->> 'allocation')::smallint,
      progress = (v.value ->> 'progress')::smallint,
      target_date = nullif(v.value ->> 'target_date', '')::date
    from jsonb_array_elements(stage_values) v(value)
    where s.id = (v.value ->> 'id')::uuid and s.project_id = target_project;
    update public.projects set title = new_title, completion = new_completion,
      projected_gross = new_gross, projected_net = new_net, actual_paid = new_actual_paid,
      paid_in_full = new_paid_in_full,
      target_date = (select max(target_date) from public.project_stages where project_id = target_project),
      updated_at = now() where id = target_project;
  else
    update public.projects set title = new_title, completion = new_completion,
      projected_gross = new_gross, projected_net = new_net, actual_paid = new_actual_paid,
      paid_in_full = new_paid_in_full, target_date = new_target_date, updated_at = now()
    where id = target_project;
  end if;
  perform public.admin_log_project_edit(target_project, 'updated project');
end;
$$;
grant execute on function public.update_project_finance_and_stages(uuid, text, smallint, numeric, numeric, numeric, boolean, date, jsonb) to authenticated;
