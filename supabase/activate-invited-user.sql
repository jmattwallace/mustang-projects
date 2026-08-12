-- Run this once in Supabase SQL Editor. It safely activates an invited user
-- at sign-in, including people whose Google identity was created before
-- their invitation row existed.
create or replace function public.activate_invited_user() returns boolean
language plpgsql security definer set search_path = public as $$
declare invitation public.invitations;
declare signed_in_email text;
begin
  signed_in_email := auth.jwt() ->> 'email';
  if exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    return true;
  end if;
  select * into invitation from public.invitations
  where lower(email) = lower(signed_in_email) and accepted_at is null;
  if invitation.id is null then return false; end if;
  insert into public.profiles (id, email, display_name, role)
  values (auth.uid(), signed_in_email, coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', signed_in_email), invitation.role)
  on conflict (id) do update set is_active = true;
  update public.invitations set accepted_at = now() where id = invitation.id;
  return true;
end;
$$;
grant execute on function public.activate_invited_user() to authenticated;
