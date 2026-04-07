const { getPollingPlan } = require("../results-sync-strategy.js");

const SPORTSRC_BASE_URL = "https://api.sportsrc.org/v2/";
const DEFAULT_PROVIDER = "sportsrc";
const DEFAULT_TIMEZONE = "UTC";
const PROVIDER_STATUS_BUCKETS = ["scheduled", "upcoming", "inprogress", "finished"];

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
  const status = normalizeText(rawStatus);
  if (!status) return "programado";
  if (status.includes("inprogress") || status.includes("live") || status.includes("1st") || status.includes("2nd") || status.includes("half")) {
    return "en_juego";
  }
  if (status.includes("finish") || status.includes("full time") || status.includes("ft") || status.includes("ended")) {
    return "finalizado";
  }
  return "programado";
}

function extractTeamName(team, fallbackKeys = []) {
  if (!team) return "";
  if (typeof team === "string") return team;
  for (const key of ["name", "team_name", "short_name", ...fallbackKeys]) {
    if (team[key]) return team[key];
  }
  return "";
}

function extractProviderMatch(rawMatch) {
  const homeTeam = rawMatch.homeTeam || rawMatch.home || rawMatch.teams?.home || rawMatch.local || {};
  const awayTeam = rawMatch.awayTeam || rawMatch.away || rawMatch.teams?.away || rawMatch.visitante || {};
  const score = rawMatch.score || rawMatch.scores || rawMatch.goals || {};
  const status = rawMatch.status || rawMatch.state || rawMatch.fixture?.status || rawMatch.match_status || "";

  return {
    provider_match_id: String(rawMatch.id || rawMatch.match_id || rawMatch.fixture_id || rawMatch.event_id || ""),
    provider: DEFAULT_PROVIDER,
    fecha: normalizeDate(rawMatch.date || rawMatch.match_date || rawMatch.utc_date || rawMatch.fixture?.date),
    estado: mapProviderStatus(status.short || status.long || status),
    provider_status_raw: status.short || status.long || status || null,
    inicia_en_utc: rawMatch.date || rawMatch.utc_date || rawMatch.fixture?.date || null,
    equipo_local: extractTeamName(homeTeam, ["home_name"]),
    equipo_visitante: extractTeamName(awayTeam, ["away_name"]),
    goles_local_real: scoreValue(
      score.home,
      score.home_score,
      score.fulltime?.home,
      rawMatch.home_score,
      rawMatch.goals_home
    ),
    goles_visitante_real: scoreValue(
      score.away,
      score.away_score,
      score.fulltime?.away,
      rawMatch.away_score,
      rawMatch.goals_away
    )
  };
}

async function fetchSportSrcMatches(date, status, apiKey) {
  const url = new URL(SPORTSRC_BASE_URL);
  url.searchParams.set("type", "matches");
  url.searchParams.set("sport", "football");
  url.searchParams.set("date", date);
  url.searchParams.set("status", status);

  const response = await fetch(url, {
    headers: {
      "X-API-KEY": apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SportSRC ${status} request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.matches)) return payload.matches;
  return [];
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
    const sameHome = normalizeText(match.equipo_local) === localName;
    const sameAway = normalizeText(match.equipo_visitante) === awayName;
    return sameDate && sameHome && sameAway;
  });
}

function buildUpdatePayload(localMatch, providerMatch) {
  const payload = {
    provider: providerMatch.provider,
    provider_match_id: providerMatch.provider_match_id || localMatch.provider_match_id || null,
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
  const sportSrcApiKey = process.env.SPORTSRC_API_KEY;
  const timeZone = process.env.RESULTS_TIMEZONE || DEFAULT_TIMEZONE;
  const date = normalizeDate((req.query && req.query.date) || getTodayInTimeZone(timeZone));
  const dailyBudget = Number(process.env.RESULTS_DAILY_BUDGET || 1000);
  const dryRun = String((req.query && req.query.dryRun) || "").toLowerCase() === "true";
  const force = String((req.query && req.query.force) || "").toLowerCase() === "true";

  if (!supabaseUrl || !supabaseServiceRoleKey || !sportSrcApiKey) {
    return json(res, 500, {
      error: "Missing env vars",
      required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SPORTSRC_API_KEY"]
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
    const providerResponses = await Promise.all(PROVIDER_STATUS_BUCKETS.map((status) => fetchSportSrcMatches(date, status, sportSrcApiKey)));
    const localMatches = await fetchSupabasePartidos(supabaseUrl, supabaseServiceRoleKey, date);

    const providerMatches = uniqueBy(
      providerResponses
        .flat()
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
      providerStatusesQueried: PROVIDER_STATUS_BUCKETS,
      providerMatchesSeen: providerMatches.length,
      providerMatchesByStatus,
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
      error: error.message
    });
  }
};
