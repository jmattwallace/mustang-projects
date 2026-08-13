-- Run once in Supabase SQL Editor before using the Feedback feature.
create type public.feedback_status as enum ('open', 'completed', 'deleted');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  subject text not null default '',
  message text not null,
  status public.feedback_status not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
create policy "users submit feedback" on public.feedback for insert to authenticated with check (submitted_by = auth.uid());
create policy "admins read feedback" on public.feedback for select to authenticated using (public.is_admin());
create policy "admins update feedback" on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
