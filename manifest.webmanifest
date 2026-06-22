-- FiskeDex – samlet SQL v22
-- Kjør denne i en NY query i Supabase SQL Editor.
-- Den er trygg å kjøre flere ganger.
-- Den gjør dette:
-- 1) Sørger for riktige tabeller/kolonner.
-- 2) Lar gjester lese, men ikke endre.
-- 3) Lar innloggede redigere.
-- 4) Stopper nye fangster/bilder på '*' = Felles.
-- 5) Lar gamle Felles-fangster slettes.
-- 6) Legger til thumb-kolonne for raskere bildevisning i grid/kort.
-- 7) Legger til sort_order slik at dere kan endre rekkefølgen på fiskene.
-- 8) Legger til profilbilder for fiskere.

-- Tabeller, hvis de ikke finnes fra før.
create table if not exists public.species (
  id text primary key,
  name text not null,
  cat text not null,
  custom boolean default false,
  sil text,
  sort_order integer default 10000
);

create table if not exists public.members (
  name text primary key,
  profile_photo text
);

-- FiskeDex v22: komprimert profilbilde (data-URL) for hver fisker.
alter table public.members add column if not exists profile_photo text;

create table if not exists public.catches (
  species_id text references public.species(id) on delete cascade,
  member text not null,
  dato text default '',
  sted text default '',
  lengde text default '',
  vekt text default '',
  kommentar text default '',
  has_photo boolean default false,
  primary key (species_id, member)
);

create table if not exists public.photos (
  species_id text,
  member text,
  data text,
  primary key (species_id, member)
);

-- Kolonner som er kommet til etter første versjon.
alter table public.catches add column if not exists lat double precision;
alter table public.catches add column if not exists lng double precision;
alter table public.catches add column if not exists created_at timestamptz default now();

alter table public.species add column if not exists info text default '';
alter table public.species add column if not exists min text default '';
alter table public.species add column if not exists fredet boolean default false;


-- FiskeDex v17: egendefinert rekkefølge på fiskene.
alter table public.species add column if not exists sort_order integer default 10000;

-- Gi eksisterende arter en fornuftig startrekkefølge hvis de ikke har fått det ennå.
with ranked as (
  select id, row_number() over (
    partition by cat
    order by id
  ) as rn
  from public.species
  where sort_order is null or sort_order = 10000
)
update public.species s
set sort_order = ranked.rn * 10
from ranked
where s.id = ranked.id;

-- Miniatyrbilde for raskere lasting på PC/mobil.
alter table public.photos add column if not exists thumb text;

-- RLS på.
alter table public.species enable row level security;
alter table public.members enable row level security;
alter table public.catches enable row level security;
alter table public.photos enable row level security;

-- Rettigheter til rollene. Selve hva de får gjøre styres av policyene under.
grant usage on schema public to anon, authenticated;
grant select on public.species, public.members, public.catches, public.photos to anon, authenticated;
grant insert, update, delete on public.species, public.members, public.catches, public.photos to authenticated;

-- Rydd bort gamle policyer fra Claude-versjonene og tidligere FiskeDex-fikser.
drop policy if exists "public_species" on public.species;
drop policy if exists "public_members" on public.members;
drop policy if exists "public_catches" on public.catches;
drop policy if exists "public_photos" on public.photos;

drop policy if exists "auth_species" on public.species;
drop policy if exists "auth_members" on public.members;
drop policy if exists "auth_catches" on public.catches;
drop policy if exists "auth_photos" on public.photos;

drop policy if exists "fiskedex_read_species" on public.species;
drop policy if exists "fiskedex_insert_species" on public.species;
drop policy if exists "fiskedex_update_species" on public.species;
drop policy if exists "fiskedex_delete_species" on public.species;

drop policy if exists "fiskedex_read_members" on public.members;
drop policy if exists "fiskedex_insert_members" on public.members;
drop policy if exists "fiskedex_update_members" on public.members;
drop policy if exists "fiskedex_delete_members" on public.members;

drop policy if exists "fiskedex_read_catches" on public.catches;
drop policy if exists "fiskedex_insert_catches" on public.catches;
drop policy if exists "fiskedex_update_catches" on public.catches;
drop policy if exists "fiskedex_delete_catches" on public.catches;

drop policy if exists "fiskedex_read_photos" on public.photos;
drop policy if exists "fiskedex_insert_photos" on public.photos;
drop policy if exists "fiskedex_update_photos" on public.photos;
drop policy if exists "fiskedex_delete_photos" on public.photos;

-- Alle kan lese. Dette er gjestemodus.
create policy "fiskedex_read_species" on public.species
  for select to anon, authenticated using (true);

create policy "fiskedex_read_members" on public.members
  for select to anon, authenticated using (true);

create policy "fiskedex_read_catches" on public.catches
  for select to anon, authenticated using (true);

create policy "fiskedex_read_photos" on public.photos
  for select to anon, authenticated using (true);

-- Bare innloggede kan endre arter og fiskere.
create policy "fiskedex_insert_species" on public.species
  for insert to authenticated with check (true);

create policy "fiskedex_update_species" on public.species
  for update to authenticated using (true) with check (true);

create policy "fiskedex_delete_species" on public.species
  for delete to authenticated using (true);

create policy "fiskedex_insert_members" on public.members
  for insert to authenticated with check (true);

create policy "fiskedex_update_members" on public.members
  for update to authenticated using (true) with check (true);

create policy "fiskedex_delete_members" on public.members
  for delete to authenticated using (true);

-- Fangster: nye/endrede fangster kan ikke være på Felles ('*').
-- Sletting er likevel lov, slik at gamle Felles-fangster kan ryddes bort.
create policy "fiskedex_insert_catches" on public.catches
  for insert to authenticated with check (member <> '*');

create policy "fiskedex_update_catches" on public.catches
  for update to authenticated using (true) with check (member <> '*');

create policy "fiskedex_delete_catches" on public.catches
  for delete to authenticated using (true);

-- Bilder: nye/endrede bilder kan ikke være på Felles ('*').
-- Sletting er lov for å rydde gamle Felles-bilder.
create policy "fiskedex_insert_photos" on public.photos
  for insert to authenticated with check (member <> '*');

create policy "fiskedex_update_photos" on public.photos
  for update to authenticated using (true) with check (member <> '*');

create policy "fiskedex_delete_photos" on public.photos
  for delete to authenticated using (true);

-- Realtime. Ignorer feilen hvis tabellen allerede er lagt til.
do $$ begin
  alter publication supabase_realtime add table public.species;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.catches;
exception when duplicate_object then null;
end $$;

-- FiskeDex v10 ekstra funksjoner:
-- Vær/reaksjoner på fangst.
alter table public.catches add column if not exists weather_summary text default '';
alter table public.catches add column if not exists tide_summary text default '';
alter table public.catches add column if not exists reactions jsonb default '{}'::jsonb;

-- Flere bilder per fangst.
create table if not exists public.catch_gallery (
  id bigint generated by default as identity primary key,
  species_id text not null references public.species(id) on delete cascade,
  member text not null,
  data text not null,
  thumb text,
  created_at timestamptz default now()
);

alter table public.catch_gallery enable row level security;
grant select on public.catch_gallery to anon, authenticated;
grant insert, update, delete on public.catch_gallery to authenticated;
grant usage, select on sequence public.catch_gallery_id_seq to authenticated;

drop policy if exists "fiskedex_read_gallery" on public.catch_gallery;
drop policy if exists "fiskedex_insert_gallery" on public.catch_gallery;
drop policy if exists "fiskedex_update_gallery" on public.catch_gallery;
drop policy if exists "fiskedex_delete_gallery" on public.catch_gallery;

create policy "fiskedex_read_gallery" on public.catch_gallery for select to anon, authenticated using (true);
create policy "fiskedex_insert_gallery" on public.catch_gallery for insert to authenticated with check (member <> '*');
create policy "fiskedex_update_gallery" on public.catch_gallery for update to authenticated using (member <> '*') with check (member <> '*');
create policy "fiskedex_delete_gallery" on public.catch_gallery for delete to authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table public.catch_gallery;
exception when duplicate_object then null;
end $$;
