# Tournament discovery

Use this endpoint to verify whether SportSRC is exposing a tournament in its football feed before building automatic imports.

## URL

```txt
/api/discover-tournament?torneo=champions_league
```

Supported values:

- `champions_league`
- `world_cup_2026`

## What to check

- `totalFootballMatchesSeen`
- `tournamentMatchesSeen`
- `leagues`
- `sample`

If `tournamentMatchesSeen` is greater than `0`, we can build the automatic importer for that tournament with much more confidence.

## Inspect all football leagues in the feed

```txt
/api/list-football-leagues
```

Use it to see the exact competition names that SportSRC is returning right now.
