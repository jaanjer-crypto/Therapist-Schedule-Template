-- Run once in your Supabase project's SQL editor before enabling cloud-config.js.
create table public.schedule_templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  name_key text not null check (length(name_key) between 1 and 100),
  name text not null check (length(trim(name)) between 1 and 100),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1048576),
  primary key (user_id, name_key)
);

alter table public.schedule_templates enable row level security;
revoke all on public.schedule_templates from anon;
grant select, insert, update, delete on public.schedule_templates to authenticated;

create policy "Read own templates" on public.schedule_templates
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own templates" on public.schedule_templates
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own templates" on public.schedule_templates
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Delete own templates" on public.schedule_templates
  for delete to authenticated using ((select auth.uid()) = user_id);
