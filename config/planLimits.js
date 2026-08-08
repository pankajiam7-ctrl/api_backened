// Server-side mirror of the frontend's src/utils/plans.js PLAN_LIMITS.
// This is the table that actually matters for security — the frontend copy
// only controls what the UI *shows*; this one controls what the server
// *allows*. Keep the two in sync if pricing changes.
const PLAN_LIMITS = {
    free: {
        createdCount: 1,
        LOIcount: 1,
        CoverCount: 1,
        sampleDownloadedCount: 1,
        trackerUsageCount: 1,
    },
    monthly: {
        createdCount: 2,
        LOIcount: 2,
        CoverCount: 2,
        sampleDownloadedCount: 2,
        trackerUsageCount: 5,
    },
    yearly: {
        createdCount: 24,
        LOIcount: 24,
        CoverCount: 24,
        sampleDownloadedCount: 24,
        trackerUsageCount: 9999, // treated as effectively unlimited
    },
};

// How often each plan's counters refill.
const PERIOD_DAYS = {
    free: null,       // never refills — one-time allowance
    monthly: 30,
    yearly: 365,
};

function getPlanLimits(planKey) {
    return PLAN_LIMITS[planKey] || PLAN_LIMITS.free;
}

function getPeriodDays(planKey) {
    return PERIOD_DAYS[planKey] ?? null;
}

module.exports = { PLAN_LIMITS, getPlanLimits, getPeriodDays };