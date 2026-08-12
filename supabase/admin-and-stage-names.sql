-- Run once in Supabase SQL Editor.
-- Lets project owners rename stages, and supports the Admin/Reporting panel.
create or replace function public.update_project_finance_and_stages(target_project uuid, new_title text, new_completion smallint, new_gross numeric, new_net numeric, stage_values jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare allocation_total integer;
begin
  if not exists (select 1 from public.projects where id = target_project and owner_id = auth.uid()) then raise exception 'Only the project owner can edit this project.'; end if;
  if jsonb_typeof(stage_values) = 'array' then
    select coalesce(sum((value ->> 'allocation')::integer), 0) into allocation_total from jsonb_array_elements(stage_values);
    if allocation_total <> 100 then raise exception 'Stage target percentages must total 100%%.'; end if;
    update public.project_stages s set name=(v.value->>'name'), allocation=(v.value->>'allocation')::smallint, progress=(v.value->>'progress')::smallint from jsonb_array_elements(stage_values) v(value) where s.id=(v.value->>'id')::uuid and s.project_id=target_project;
  end if;
  update public.projects set title=new_title, completion=new_completion, projected_gross=new_gross, projected_net=new_net, updated_at=now() where id=target_project;
end; $$;
grant execute on function public.update_project_finance_and_stages(uuid, text, smallint, numeric, numeric, jsonb) to authenticated;

create or replace function public.admin_invite_user(invited_email text, invited_role public.app_role default 'standard')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  insert into public.invitations(email, invited_by, role) values(lower(trim(invited_email)), auth.uid(), invited_role)
  on conflict(email) do update set role=excluded.role, invited_by=excluded.invited_by, accepted_at=null;
end; $$;
grant execute on function public.admin_invite_user(text, public.app_role) to authenticated;
