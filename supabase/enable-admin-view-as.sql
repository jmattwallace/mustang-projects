-- Run once in Supabase SQL Editor to allow an administrator's read-only
-- View As board to include the selected user's private group labels/colors.
create policy "admins read all groups" on public.project_groups
for select to authenticated using (public.is_admin());
