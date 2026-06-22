-- FiskeDex v22 – profilbilder for fiskere
-- Kjør denne filen i Supabase SQL Editor hvis du allerede har kjørt v17/v18-SQL.
-- Den er trygg å kjøre flere ganger.

alter table public.members add column if not exists profile_photo text;
alter table public.members enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.members to anon, authenticated;
grant update on public.members to authenticated;

-- Legg bare til FiskeDex-policyene dersom de ikke finnes fra før.
-- Hvis dere allerede har kjørt den komplette FiskeDex-SQL-en, endres ingenting her.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='members' and policyname='fiskedex_read_members'
  ) then
    create policy "fiskedex_read_members" on public.members
      for select to anon, authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='members' and policyname='fiskedex_update_members'
  ) then
    create policy "fiskedex_update_members" on public.members
      for update to authenticated using (true) with check (true);
  end if;
end $$;
