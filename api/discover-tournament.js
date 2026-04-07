const SPORTSRC_V1_FOOTBALL_URL = "https://api.sportsrc.org/?data=matches&category=football";

const TOURNAMENT_KEYWORDS = {
  champions_league: ["champions", "uefa champions"],
  world_cup_2026: ["world cup", "mundial", "fifa world cup"]
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function leagueText(match) {
  return normalizeText(
    pickFirst(
      match.league,
      match.competition,
      match.tournament,
      match.league_name,
      match.category_name
    )
  );
}

function mapMatch(match) {
  return {
    id: pickFirst(match.id, match.match_id, match.event_id),
    league: pickFirst(match.league, match.competition, match.tournament, null),
    startsAt: pickFirst(match.date, match.time, match.timestamp, null),
    home: pickFirst(match.home, match.homeTeam?.name, match.team1?.name, match.team1, null),
    away: pickFirst(match.away, match.awayTeam?.name, match.team2?.name, match.team2, null)
  };
}

async function fetchFootballSchedule() {
  const response = await fetch(SPORTSRC_V1_FOOTBALL_URL);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SportSRC discover failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.matches)) return payload.matches;
  return [];
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const torneo = String((req.query && req.query.torneo) || "champions_league");
  const keywords = TOURNAMENT_KEYWORDS[torneo];

  if (!keywords) {
    return json(res, 400, {
      error: "Unsupported torneo",
      supported: Object.keys(TOURNAMENT_KEYWORDS)
    });
  }

  try {
    const schedule = await fetchFootballSchedule();
    const filtered = schedule.filter((match) => {
      const league = leagueText(match);
      return keywords.some((keyword) => league.includes(keyword));
    });

    const leagues = {};
    filtered.forEach((match) => {
      const league = pickFirst(match.league, match.competition, match.tournament, "unknown");
      leagues[league] = (leagues[league] || 0) + 1;
    });

    return json(res, 200, {
      ok: true,
      torneo,
      source: SPORTSRC_V1_FOOTBALL_URL,
      totalFootballMatchesSeen: schedule.length,
      tournamentMatchesSeen: filtered.length,
      leagues,
      sample: filtered.slice(0, 20).map(mapMatch)
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      torneo,
      error: error.message
    });
  }
};

