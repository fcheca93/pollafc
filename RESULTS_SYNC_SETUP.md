# PollaFC results sync

## 1. Run the SQL

Run [supabase-results-sync.sql](C:/Users/fchec/OneDrive/Documentos/New%20project/supabase-results-sync.sql) in the Supabase SQL editor.

## 2. Add env vars in Vercel

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SPORTSRC_API_KEY`
- `RESULTS_SYNC_TOKEN`
- `RESULTS_TIMEZONE`
  Suggested value: `America/Mexico_City`
- `RESULTS_DAILY_BUDGET`
  Suggested value: `1000`

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

## 6. Frontend behavior

The app now shows:

- `En juego X-Y` when `estado = en_juego`
- `Final X-Y` when `estado = finalizado`

If there is no real score yet, it keeps showing the prediction pill as before.

