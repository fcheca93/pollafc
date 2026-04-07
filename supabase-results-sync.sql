alter table public.partidos
  add column if not exists provider text,
  add column if not exists provider_match_id text,
  add column if not exists provider_status_raw text,
  add column if not exists estado text default 'programado',
  add column if not exists goles_local_real integer,
  add column if not exists goles_visitante_real integer,
  add column if not exists inicia_en_utc timestamptz,
  add column if not exists finalizado_en_utc timestamptz,
  add column if not exists resultado_actualizado_en timestamptz;

create unique index if not exists partidos_provider_match_unique_idx
  on public.partidos (provider, provider_match_id)
  where provider_match_id is not null;

create index if not exists partidos_fecha_idx
  on public.partidos (fecha);

create index if not exists partidos_estado_idx
  on public.partidos (estado);

comment on column public.partidos.provider is 'Proveedor externo del resultado, por ejemplo sportsrc.';
comment on column public.partidos.provider_match_id is 'ID del partido en la API externa.';
comment on column public.partidos.estado is 'programado, en_juego o finalizado.';
comment on column public.partidos.provider_status_raw is 'Estado crudo devuelto por la API.';
comment on column public.partidos.resultado_actualizado_en is 'Ultima vez que se sincronizo el resultado.';

