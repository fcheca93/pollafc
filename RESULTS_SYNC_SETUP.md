# PollaFC results sync

## 1. Run the SQL

Run [supabase-results-sync.sql](C:/Users/fchec/OneDrive/Documentos/New%20project/supabase-results-sync.sql) in the Supabase SQL editor.

## 2. Add env vars in Vercel

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_FOOTBALL_KEY`
- `RESULTS_PROVIDER`
  Exact value: `api_football`
- `RESULTS_SYNC_TOKEN`
- `RESULTS_TIMEZONE`
  Suggested value: `America/Mexico_City`
- `RESULTS_DAILY_BUDGET`
  Suggested value: `100`
- `API_FOOTBALL_WORLD_CUP_LEAGUE_ID`
  Optional override if you want to change the World Cup competition id later

## 3. Match your local rows with the provider

The sync endpoint works best if `partidos.provider_match_id` is filled.

If you do not have those IDs yet, the endpoint falls back to matching by:

- `fecha`
- `equipo_local`
- `equipo_visitante`

That fallback is useful to start, but the safest production setup is saving the provider match ID.

## 4. Manual test

After deploy, call:

```txt
/api/sync-results?token=YOUR_TOKEN&date=2026-06-11&dryRun=true
```

If the output looks good, run again without `dryRun=true`.

If you want to test the endpoint on a specific World Cup day even when the planner would skip it, force the lookup with:

```txt
/api/sync-results?token=YOUR_TOKEN&date=2026-04-07&dryRun=true&force=true
```

The endpoint now pulls fixtures only for:

- `world_cup_2026`

## 5. What the sync updates

The endpoint updates these fields in `partidos`:

- `provider`
- `provider_match_id`
- `provider_status_raw`
- `estado`
- `goles_local_real`
- `goles_visitante_real`
- `inicia_en_utc`
- `resultado_actualizado_en`

In the response JSON, check these fields first:

- `providerMatchesSeen`
- `providerMatchesByStatus`
- `updated`
- `unmatched`

## 6. Frontend behavior

The app now shows:

- `Final X-Y` when `estado = finalizado`

If there is no final score yet, it keeps showing the prediction pill as before.
