-- Mustang Projects Review: run this once in Supabase SQL Editor.
create extension if not exists "pgcrypto";

create type public.project_status as enum ('active', 'completed', 'cancelled', 'archived');
create type public.app_role as enum ('standard', 'admin');
create type public.project_mode as enum ('simple', 'staged');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.app_role not null default 'standard',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Google users become app users only when an administrator has invited their
-- exact email address. A non-invited Google sign-in has no profile and must be
-- denied by the app after authentication.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_by uuid references public.profiles(id),
  role public.app_role not null default 'standard',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.create_invited_profile() returns trigger language plpgsql security definer set search_path = public as $$
declare invitation public.invitations;
begin
  select * into invitation from public.invitations where lower(email) = lower(new.email) and accepted_at is null;
  if invitation.id is not null then
    insert into public.profiles (id, email, display_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), invitation.role);
    update public.invitations set accepted_at = now() where id = invitation.id;
  end if;
  return new;
end;
$$;
create trigger on_google_user_created after insert on auth.users for each row execute function public.create_invited_profile();

create function public.activate_invited_user() returns boolean language plpgsql security definer set search_path = public as $$
declare invitation public.invitations; signed_in_email text;
begin
  signed_in_email := auth.jwt() ->> 'email';
  if exists (select 1 from public.profiles where id = auth.uid() and is_active) then return true; end if;
  select * into invitation from public.invitations where lower(email) = lower(signed_in_email) and accepted_at is null;
  if invitation.id is null then return false; end if;
  insert into public.profiles (id, email, display_name, role)
  values (auth.uid(), signed_in_email, coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', signed_in_email), invitation.role)
  on conflict (id) do update set is_active = true;
  update public.invitations set accepted_at = now() where id = invitation.id;
  return true;
end;
$$;
grant execute on function public.activate_invited_user() to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  title text not null default 'Untitled project',
  client_name text,
  status public.project_status not null default 'active',
  mode public.project_mode not null default 'simple',
  completion smallint not null default 0 check (completion between 0 and 100),
  projected_gross numeric(12,2) not null default 0 check (projected_gross >= 0),
  projected_net numeric(12,2) not null default 0 check (projected_net >= 0),
  position numeric not null default extract(epoch from now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_key text not null check (stage_key in ('pre', 'production', 'post_production', 'confirm')),
  name text not null,
  allocation smallint not null check (allocation between 0 and 100),
  progress smallint not null default 0 check (progress between 0 and 100),
  color text not null,
  unique(project_id, stage_key)
);

create table public.project_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text not null default '#2763d9',
  created_at timestamptz not null default now(),
  unique(creator_id, name)
);

create table public.project_group_memberships (
  project_id uuid not null references public.projects(id) on delete cascade,
  group_id uuid not null references public.project_groups(id) on delete cascade,
  primary key (project_id, group_id)
);

create table public.project_shares (
  project_id uuid not null references public.projects(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, viewer_id)
);

create table public.project_dates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  label text not null,
  date_value date not null,
  start_time time,
  end_time time,
  note text
);

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  note_type text not null default 'General',
  body text not null default '',
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table public.saved_arrangements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  positions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(positions) = 'object')
);
create unique index saved_arrangements_three_per_user on public.saved_arrangements(owner_id, name);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  subject_user_id uuid references public.profiles(id),
  project_id uuid references public.projects(id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active);
$$;
create function public.can_read_project(target_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.projects p where p.id = target_project and (p.owner_id = auth.uid() or public.is_admin() or exists(select 1 from public.project_shares s where s.project_id = p.id and s.viewer_id = auth.uid())));
$$;
create function public.can_edit_project(target_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.projects p where p.id = target_project and p.owner_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_groups enable row level security;
alter table public.project_group_memberships enable row level security;
alter table public.project_shares enable row level security;
alter table public.project_dates enable row level security;
alter table public.project_notes enable row level security;
alter table public.expenses enable row level security;
alter table public.saved_arrangements enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "profiles visible to signed-in users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "admins manage invitations" on public.invitations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read permitted projects" on public.projects for select to authenticated using (public.can_read_project(id));
create policy "users create own projects" on public.projects for insert to authenticated with check (owner_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = projects.owner_id and lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and p.is_active));
create policy "owners edit projects" on public.projects for update to authenticated using (public.can_edit_project(id)) with check (public.can_edit_project(id));
create policy "owners delete projects" on public.projects for delete to authenticated using (public.can_edit_project(id));
create policy "read project children" on public.project_stages for select to authenticated using (public.can_read_project(project_id));
create policy "owners manage stages" on public.project_stages for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "read groups" on public.project_groups for select to authenticated using (creator_id = auth.uid());
create policy "manage own groups" on public.project_groups for all to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy "read group memberships" on public.project_group_memberships for select to authenticated using (public.can_read_project(project_id));
create policy "owners manage group memberships" on public.project_group_memberships for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "read shares" on public.project_shares for select to authenticated using (public.can_read_project(project_id));
create policy "owners manage shares" on public.project_shares for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "read dates" on public.project_dates for select to authenticated using (public.can_read_project(project_id));
create policy "owners manage dates" on public.project_dates for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "read notes" on public.project_notes for select to authenticated using (public.can_read_project(project_id));
create policy "owners manage notes" on public.project_notes for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "read expenses" on public.expenses for select to authenticated using (public.can_read_project(project_id));
create policy "owners manage expenses" on public.expenses for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "manage own arrangements" on public.saved_arrangements for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "admins read audit log" on public.admin_audit_log for select to authenticated using (public.is_admin());

-- Validate the stage allocation rule whenever a stage row changes.
create function public.validate_stage_allocations() returns trigger language plpgsql as $$
declare total integer; target uuid;
begin
  target := coalesce(new.project_id, old.project_id);
  select coalesce(sum(allocation), 0) into total from public.project_stages where project_id = target;
  if total <> 100 and (select count(*) from public.project_stages where project_id = target) = 4 then
    raise exception 'The four stage allocations must total 100%%.';
  end if;
  return coalesce(new, old);
end;
$$;
create constraint trigger stage_allocations_total_100 after insert or update or delete on public.project_stages deferrable initially deferred for each row execute function public.validate_stage_allocations();
