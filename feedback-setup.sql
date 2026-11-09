-- Työaika: run in Supabase SQL Editor.
-- Replace OWNER_EMAIL_HERE with your actual email before running.
-- Supabase -> Authentication -> Providers -> Email -> enable email OTP.
-- Supabase email template must contain {{ .Token }} to deliver a numeric OTP.
create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 3000),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);
create index if not exists feedback_messages_created_at_idx
  on public.feedback_messages (created_at desc);
create table if not exists public.feedback_admins (
  email text primary key
);
alter table public.feedback_messages enable row level security;
alter table public.feedback_admins enable row level security;
revoke all on public.feedback_admins from anon, authenticated;
-- Only the owner of the database can edit feedback_admins.
insert into public.feedback_admins(email)
  values (lower('OWNER_EMAIL_HERE'))
  on conflict (email) do nothing;
create or replace function public.is_feedback_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.feedback_admins a
    where a.email = lower((auth.jwt() ->> 'email')::text)
      and (auth.jwt() ->> 'email_verified')::text = 'true'
  )
$$;
revoke all on function public.is_feedback_admin() from public;
grant execute on function public.is_feedback_admin() to authenticated;
drop policy if exists "Anyone may submit feedback" on public.feedback_messages;
create policy "Anyone may submit feedback" on public.feedback_messages
for insert to anon, authenticated with check (is_read = false);
drop policy if exists "Only admin may read feedback" on public.feedback_messages;
create policy "Only admin may read feedback" on public.feedback_messages
for select to authenticated using (public.is_feedback_admin());
drop policy if exists "Only admin may mark feedback read" on public.feedback_messages;
create policy "Only admin may mark feedback read" on public.feedback_messages
for update to authenticated
using (public.is_feedback_admin()) with check (public.is_feedback_admin());
grant insert on public.feedback_messages to anon, authenticated;
grant select, update on public.feedback_messages to authenticated;
-- Notifications by email are NOT configured by this script.
-- Consider CAPTCHA/rate limits before accepting public submissions.
