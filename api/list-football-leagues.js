const SPORTSRC_V1_FOOTBALL_URL = "https://api.sportsrc.org/?data=matches&category=football";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function normalizeLabel(value) {
  return String(value || "").trim();
}

async function fetchFootballSchedule() {
  const response = await fetch(SPORTSRC_V1_FOOTBALL_URL);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SportSRC football list failed (${response.status}): ${errorText.slice(0, 300)}`);
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

  try {
    const schedule = await fetchFootballSchedule();
    const leaguesMap = new Map();

    schedule.forEach((match) => {
      const league = normalizeLabel(
        pickFirst(
          match.league,
          match.competition,
          match.tournament,
          match.league_name,
          match.category_name,
          "unknown"
        )
      );

      leaguesMap.set(league, (leaguesMap.get(league) || 0) + 1);
    });

    const leagues = Array.from(leaguesMap.entries())
      .map(([league, count]) => ({ league, count }))
      .sort((a, b) => b.count - a.count || a.league.localeCompare(b.league));

    return json(res, 200, {
      ok: true,
      source: SPORTSRC_V1_FOOTBALL_URL,
      totalFootballMatchesSeen: schedule.length,
      leagues
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message
    });
  }
};

