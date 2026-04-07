// World Cup 2026 results polling strategy for PollaFC.
// This file is provider-agnostic on purpose so we can reuse it with SportSRC,
// API-Football, or any future data source.

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
const LIVE_INTERVAL_OPTIONS = [1, 2, 3, 5, 10, 15];

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

function chooseLiveInterval(matchesPerDay, dailyBudget = DEFAULT_DAILY_BUDGET, safetyBuffer = DEFAULT_SAFETY_BUFFER) {
  const activeHours = estimateActiveHours(matchesPerDay);
  const safeBudget = getSafeBudget(dailyBudget, safetyBuffer);

  for (const intervalMinutes of LIVE_INTERVAL_OPTIONS) {
    const requests = estimateRequests(activeHours, intervalMinutes);
    if (requests <= safeBudget) {
      return {
        intervalMinutes,
        estimatedRequests: requests,
        safeBudget
      };
    }
  }

  const fallbackInterval = LIVE_INTERVAL_OPTIONS[LIVE_INTERVAL_OPTIONS.length - 1];
  return {
    intervalMinutes: fallbackInterval,
    estimatedRequests: estimateRequests(activeHours, fallbackInterval),
    safeBudget
  };
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

  const live = chooseLiveInterval(profile.matchesPerDay, dailyBudget, safetyBuffer);
  const preMatchInterval = profile.matchesPerDay >= 4 ? 15 : 10;
  const postMatchInterval = 30;
  const preMatchRequests = estimateRequests(0.5, preMatchInterval);
  const postMatchRequests = estimateRequests(1, postMatchInterval);

  return {
    ...profile,
    dailyBudget,
    safeBudget: live.safeBudget,
    shouldPoll: true,
    estimatedLiveRequests: live.estimatedRequests,
    estimatedTotalRequests: live.estimatedRequests + preMatchRequests + postMatchRequests,
    recommendation: `Poll every ${live.intervalMinutes} minute(s) while a match is live.`,
    windows: [
      {
        label: "pre_match",
        description: "Thirty minutes before the first kickoff of the day",
        intervalMinutes: preMatchInterval,
        estimatedRequests: preMatchRequests
      },
      {
        label: "live",
        description: "Only while at least one World Cup match is in progress",
        intervalMinutes: live.intervalMinutes,
        estimatedRequests: live.estimatedRequests
      },
      {
        label: "post_match",
        description: "Cooldown after the final match of the day",
        intervalMinutes: postMatchInterval,
        estimatedRequests: postMatchRequests
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
      liveIntervalMinutes: samplePlan.windows[1].intervalMinutes,
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

