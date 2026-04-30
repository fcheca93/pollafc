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
- `CRON_SECRET`
  Required if you want Vercel Cron Jobs to call the endpoint securely with the built-in `Authorization: Bearer <CRON_SECRET>` header
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

## 7. Vercel cron

This repo includes a [vercel.json](C:/Users/fchec/OneDrive/Documentos/Apps/Polla%20Mundialista/pollafc/vercel.json) cron config:

```txt
*/10 10-23 * * *
```

That means:

- every 10 minutes
- from 10:00 UTC to 23:59 UTC
- 84 executions per day

Important:

- Vercel Cron timezone is always UTC
- on Vercel Hobby, schedules more frequent than once per day are not supported
- on Vercel Pro or higher, this schedule works as expected
