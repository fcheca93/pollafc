const { getPollingPlan } = require("../results-sync-strategy.js");

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io/";
const DEFAULT_PROVIDER = "api_football";
const DEFAULT_TIMEZONE = "UTC";
const API_FOOTBALL_STATUS_PARAMS = ["NS", "TBD", "1H", "HT", "2H", "ET", "BT", "P", "FT", "AET", "PEN"];
const TOURNAMENT_LEAGUE_IDS = {
  world_cup_2026: Number(process.env.API_FOOTBALL_WORLD_CUP_LEAGUE_ID || 1),
  champions_league: Number(process.env.API_FOOTBALL_CHAMPIONS_LEAGUE_ID || 2)
};

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function getRequestToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  if (req.query && req.query.token) return req.query.token;
  return "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDate(dateValue) {
  if (!dateValue) return new Date().toISOString().slice(0, 10);
  return String(dateValue).slice(0, 10);
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreValue(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function mapProviderStatus(rawStatus) {
  const status = String(rawStatus || "").toUpperCase();
  if (!status) return "programado";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(status)) return "en_juego";
  if (["FT", "AET", "PEN"].includes(status)) return "finalizado";
  return "programado";
}

function extractProviderMatch(rawMatch) {
  const fixture = rawMatch.fixture || {};
  const teams = rawMatch.teams || {};
  const goals = rawMatch.goals || {};
  const fixtureStatus = fixture.status || {};
  const league = rawMatch.league || {};

  return {
    provider_match_id: String(fixture.id || rawMatch.id || ""),
    provider: DEFAULT_PROVIDER,
    torneo: league.id === TOURNAMENT_LEAGUE_IDS.champions_league ? "champions_league" : "world_cup_2026",
    fecha: normalizeDate(fixture.date),
    estado: mapProviderStatus(fixtureStatus.short),
    provider_status_raw: fixtureStatus.short || null,
    inicia_en_utc: fixture.date || null,
    equipo_local: teams.home?.name || "",
    equipo_visitante: teams.away?.name || "",
    goles_local_real: scoreValue(goals.home),
    goles_visitante_real: scoreValue(goals.away)
  };
}

async function fetchApiFootballFixtures(date, leagueId, apiKey) {
  const url = new URL(`${API_FOOTBALL_BASE_URL}fixtures`);
  url.searchParams.set("date", date);
  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", "2026");

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API-Football fixtures failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.response) ? payload.response : [];
}

async function fetchSupabasePartidos(supabaseUrl, serviceRoleKey, date) {
  const url = new URL(`${supabaseUrl}/rest/v1/partidos`);
  url.searchParams.set("select", "*");
  url.searchParams.set("fecha", `eq.${date}`);

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase fetch partidos failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  return response.json();
}

async function patchSupabasePartido(supabaseUrl, serviceRoleKey, partidoId, payload) {
  const url = new URL(`${supabaseUrl}/rest/v1/partidos`);
  url.searchParams.set("id", `eq.${partidoId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase update partido ${partidoId} failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  return response.json();
}

function findLocalMatch(localMatches, providerMatch) {
  if (providerMatch.provider_match_id) {
    const byProviderId = localMatches.find(
      (match) =>
        String(match.provider || DEFAULT_PROVIDER) === providerMatch.provider &&
        String(match.provider_match_id || "") === providerMatch.provider_match_id
    );
    if (byProviderId) return byProviderId;
  }

  const localName = normalizeText(providerMatch.equipo_local);
  const awayName = normalizeText(providerMatch.equipo_visitante);

  return localMatches.find((match) => {
    const sameDate = normalizeDate(match.fecha) === providerMatch.fecha;
    const sameTournament = !match.torneo || match.torneo === providerMatch.torneo;
    const sameHome = normalizeText(match.equipo_local) === localName;
    const sameAway = normalizeText(match.equipo_visitante) === awayName;
    return sameDate && sameTournament && sameHome && sameAway;
  });
}

function buildUpdatePayload(localMatch, providerMatch) {
  const payload = {
    provider: providerMatch.provider,
    provider_match_id: providerMatch.provider_match_id || localMatch.provider_match_id || null,
    torneo: providerMatch.torneo || localMatch.torneo || "world_cup_2026",
    estado: providerMatch.estado || localMatch.estado || "programado",
    provider_status_raw: providerMatch.provider_status_raw || null,
    inicia_en_utc: providerMatch.inicia_en_utc || localMatch.inicia_en_utc || null,
    goles_local_real: providerMatch.goles_local_real,
    goles_visitante_real: providerMatch.goles_visitante_real,
    resultado_actualizado_en: new Date().toISOString()
  };

  const changedEntries = Object.entries(payload).filter(([key, value]) => {
    const currentValue = localMatch[key] ?? null;
    return currentValue !== (value ?? null);
  });

  return Object.fromEntries(changedEntries);
}

function getTodayInTimeZone(timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

module.exports = async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { error: "Method not allowed" });
  }

  const expectedToken = process.env.RESULTS_SYNC_TOKEN || "";
  if (expectedToken && getRequestToken(req) !== expectedToken) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiFootballKey = process.env.API_FOOTBALL_KEY;
  const configuredProvider = process.env.RESULTS_PROVIDER || DEFAULT_PROVIDER;
  const timeZone = process.env.RESULTS_TIMEZONE || DEFAULT_TIMEZONE;
  const date = normalizeDate((req.query && req.query.date) || getTodayInTimeZone(timeZone));
  const dailyBudget = Number(process.env.RESULTS_DAILY_BUDGET || 100);
  const dryRun = String((req.query && req.query.dryRun) || "").toLowerCase() === "true";
  const force = String((req.query && req.query.force) || "").toLowerCase() === "true";

  if (configuredProvider !== DEFAULT_PROVIDER) {
    return json(res, 400, {
      ok: false,
      error: `Unsupported RESULTS_PROVIDER: ${configuredProvider}`,
      expected: DEFAULT_PROVIDER
    });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey || !apiFootballKey) {
    return json(res, 500, {
      error: "Missing env vars",
      required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "API_FOOTBALL_KEY"]
    });
  }

  const plan = getPollingPlan(date, dailyBudget);
  if (!plan.shouldPoll && !force) {
    return json(res, 200, {
      ok: true,
      date,
      skipped: true,
      reason: plan.recommendation,
      plan
    });
  }

  try {
    const [worldCupFixtures, championsFixtures, localMatches] = await Promise.all([
      fetchApiFootballFixtures(date, TOURNAMENT_LEAGUE_IDS.world_cup_2026, apiFootballKey),
      fetchApiFootballFixtures(date, TOURNAMENT_LEAGUE_IDS.champions_league, apiFootballKey),
      fetchSupabasePartidos(supabaseUrl, supabaseServiceRoleKey, date)
    ]);

    const providerMatches = uniqueBy(
      [...worldCupFixtures, ...championsFixtures]
        .map(extractProviderMatch)
        .filter((match) => match.equipo_local && match.equipo_visitante),
      (match) => `${match.provider_match_id}|${match.fecha}|${match.equipo_local}|${match.equipo_visitante}`
    );

    const updates = [];
    const unmatched = [];

    for (const providerMatch of providerMatches) {
      const localMatch = findLocalMatch(localMatches, providerMatch);
      if (!localMatch) {
        unmatched.push({
          fecha: providerMatch.fecha,
          torneo: providerMatch.torneo,
          equipo_local: providerMatch.equipo_local,
          equipo_visitante: providerMatch.equipo_visitante,
          provider_match_id: providerMatch.provider_match_id,
          estado: providerMatch.estado
        });
        continue;
      }

      const payload = buildUpdatePayload(localMatch, providerMatch);
      if (Object.keys(payload).length === 0) continue;

      updates.push({
        partido_id: localMatch.id,
        local: {
          torneo: localMatch.torneo,
          equipo_local: localMatch.equipo_local,
          equipo_visitante: localMatch.equipo_visitante
        },
        payload
      });
    }

    if (!dryRun) {
      for (const update of updates) {
        await patchSupabasePartido(supabaseUrl, supabaseServiceRoleKey, update.partido_id, update.payload);
      }
    }

    const providerMatchesByStatus = providerMatches.reduce((acc, match) => {
      acc[match.estado] = (acc[match.estado] || 0) + 1;
      return acc;
    }, {});

    return json(res, 200, {
      ok: true,
      date,
      dryRun,
      force,
      provider: DEFAULT_PROVIDER,
      plan,
      providerMatchesSeen: providerMatches.length,
      providerMatchesByStatus,
      apiFootballLeagueIds: TOURNAMENT_LEAGUE_IDS,
      apiFootballStatusParamsUsed: API_FOOTBALL_STATUS_PARAMS,
      localMatchesSeen: localMatches.length,
      updated: updates.length,
      unmatched: unmatched.length,
      updates,
      unmatched
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      date,
      error: error.message,
      errorName: error.name || null,
      errorCause: error.cause ? String(error.cause) : null
    });
  }
};
