alter table public.grupos
  add column if not exists torneo text;

alter table public.partidos
  add column if not exists torneo text;

update public.grupos
set torneo = 'world_cup_2026'
where torneo is null;

update public.partidos
set torneo = 'world_cup_2026'
where torneo is null;

create index if not exists grupos_torneo_idx
  on public.grupos (torneo);

create index if not exists partidos_torneo_idx
  on public.partidos (torneo);

comment on column public.grupos.torneo is 'Torneo de la polla: world_cup_2026 o champions_league.';
comment on column public.partidos.torneo is 'Torneo al que pertenece el partido.';

