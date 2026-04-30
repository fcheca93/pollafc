// World Cup 2026 results polling strategy for PollaFC.
// The product is World Cup-only and does not expose live scoring in the UI.

const WORLD_CUP_2026_UTC_RANGES = [
  { start: "2026-06-11", end: "2026-06-12", matchesPerDay: 2, phase: "group" },
  { start: "2026-06-13", end: "2026-06-23", matchesPerDay: 4, phase: "group" },
  { start: "2026-06-24", end: "2026-06-27", matchesPerDay: 6, phase: "group" },
  { start: "2026-06-28", end: "2026-06-28", matchesPerDay: 1, phase: "round_of_32" },
  { start: "2026-06-29", end: "2026-07-03", matchesPerDay: 3, phase: "round_of_32" },
  { start: "2026-07-04", end: "2026-07-07", matchesPerDay: 2, phase: "round_of_16" },
  { start: "2026-07-09", end: "2026-07-10", matchesPerDay: 1, phase: "quarter_final" },
  { start: "2026-07-11", end: "2026-07-11", matchesPerDay: 2, phase: "quarter_final" },
  { start: "2026-07-14", end: "2026-07-15", matchesPerDay: 1, phase: "semi_final" },
  { start: "2026-07-18", end: "2026-07-19", matchesPerDay: 1, phase: "finals" }
];

const DEFAULT_DAILY_BUDGET = 1000;
const DEFAULT_SAFETY_BUFFER = 0.15;
const MATCH_DAY_INTERVAL_MINUTES = 10;

function normalizeDate(input) {
  if (typeof input === "string") return input.slice(0, 10);
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  throw new Error("normalizeDate expects a Date or YYYY-MM-DD string");
}

function isDateInRange(target, range) {
  return target >= range.start && target <= range.end;
}

function getMatchProfile(dateInput) {
  const date = normalizeDate(dateInput);
  const range = WORLD_CUP_2026_UTC_RANGES.find((item) => isDateInRange(date, item));

  if (!range) {
    return {
      date,
      phase: null,
      matchesPerDay: 0,
      estimatedActiveHours: 0
    };
  }

  return {
    date,
    phase: range.phase,
    matchesPerDay: range.matchesPerDay,
    estimatedActiveHours: estimateActiveHours(range.matchesPerDay)
  };
}

function estimateActiveHours(matchesPerDay) {
  if (matchesPerDay <= 0) return 0;
  if (matchesPerDay === 1) return 2.5;
  if (matchesPerDay === 2) return 5;
  if (matchesPerDay === 3) return 8;
  if (matchesPerDay === 4) return 10;
  return 14;
}

function estimateRequests(activeHours, intervalMinutes) {
  if (!activeHours || !intervalMinutes) return 0;
  return Math.ceil((activeHours * 60) / intervalMinutes);
}

function getSafeBudget(dailyBudget = DEFAULT_DAILY_BUDGET, safetyBuffer = DEFAULT_SAFETY_BUFFER) {
  return Math.floor(dailyBudget * (1 - safetyBuffer));
}

function getPollingPlan(dateInput, dailyBudget = DEFAULT_DAILY_BUDGET, safetyBuffer = DEFAULT_SAFETY_BUFFER) {
  const profile = getMatchProfile(dateInput);

  if (profile.matchesPerDay === 0) {
    return {
      ...profile,
      dailyBudget,
      safeBudget: getSafeBudget(dailyBudget, safetyBuffer),
      shouldPoll: false,
      recommendation: "No tournament matches scheduled. Skip polling.",
      windows: []
    };
  }

  const safeBudget = getSafeBudget(dailyBudget, safetyBuffer);
  const estimatedRequests = estimateRequests(profile.estimatedActiveHours, MATCH_DAY_INTERVAL_MINUTES);

  return {
    ...profile,
    dailyBudget,
    safeBudget,
    shouldPoll: true,
    estimatedTotalRequests: estimatedRequests,
    recommendation: `Poll every ${MATCH_DAY_INTERVAL_MINUTES} minute(s) on World Cup match days.`,
    windows: [
      {
        label: "match_day_sync",
        description: "Run a single recurring sync cadence throughout World Cup match days",
        intervalMinutes: MATCH_DAY_INTERVAL_MINUTES,
        estimatedRequests
      }
    ]
  };
}

function summarizeTournamentBudget(dailyBudget = DEFAULT_DAILY_BUDGET, safetyBuffer = DEFAULT_SAFETY_BUFFER) {
  return WORLD_CUP_2026_UTC_RANGES.map((range) => {
    const samplePlan = getPollingPlan(range.start, dailyBudget, safetyBuffer);
    return {
      phase: range.phase,
      start: range.start,
      end: range.end,
      matchesPerDay: range.matchesPerDay,
      estimatedActiveHours: samplePlan.estimatedActiveHours,
      syncIntervalMinutes: samplePlan.windows[0].intervalMinutes,
      estimatedTotalRequestsPerDay: samplePlan.estimatedTotalRequests
    };
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    WORLD_CUP_2026_UTC_RANGES,
    estimateActiveHours,
    estimateRequests,
    getMatchProfile,
    getPollingPlan,
    summarizeTournamentBudget
  };
}

