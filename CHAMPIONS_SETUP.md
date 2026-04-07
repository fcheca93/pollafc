# Champions setup

## 1. Run the tournament migration first

Run [supabase-tournaments.sql](C:/Users/fchec/OneDrive/Documentos/New%20project/supabase-tournaments.sql) in Supabase before creating Champions pools.

## 2. Add Champions matches to `partidos`

You have two easy options:

- CSV import with [champions-partidos-template.csv](C:/Users/fchec/OneDrive/Documentos/New%20project/champions-partidos-template.csv)
- SQL insert with [champions-partidos-example.sql](C:/Users/fchec/OneDrive/Documentos/New%20project/champions-partidos-example.sql)

## 3. Required fields for Champions rows

- `torneo`: `champions_league`
- `jornada`
- `fecha`
- `hora`
- `equipo_local`
- `equipo_visitante`

Recommended too:

- `estadio`
- `flag_local`
- `flag_visitante`
- `estado`

## 4. Important rule

Every Champions match must have:

```txt
torneo = champions_league
```

Otherwise it will show up in the World Cup pools.

