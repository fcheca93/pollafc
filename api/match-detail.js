const SPORTSRC_V2_BASE_URL = "https://api.sportsrc.org/v2/";

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

async function fetchMatchDetail(id, apiKey) {
  const url = new URL(SPORTSRC_V2_BASE_URL);
  url.searchParams.set("type", "detail");
  url.searchParams.set("id", id);

  const response = await fetch(url, {
    headers: {
      "X-API-KEY": apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SportSRC detail failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  return response.json();
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const expectedToken = process.env.RESULTS_SYNC_TOKEN || "";
  if (expectedToken && getRequestToken(req) !== expectedToken) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const id = String((req.query && req.query.id) || "").trim();
  const sportSrcApiKey = process.env.SPORTSRC_API_KEY;

  if (!id) {
    return json(res, 400, { error: "Missing id query param" });
  }

  if (!sportSrcApiKey) {
    return json(res, 500, { error: "Missing SPORTSRC_API_KEY" });
  }

  try {
    const detail = await fetchMatchDetail(id, sportSrcApiKey);
    return json(res, 200, {
      ok: true,
      id,
      detail
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      id,
      error: error.message
    });
  }
};

