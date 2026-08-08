const User = require("../models/user.model"); // adjust path to match your project
const { getPlanLimits, getPeriodDays } = require("../config/planLimits");

// Maps the frontend's `type` values to the proposalStats field each one
// decrements. Must match QUOTA_FIELD in the frontend's src/hooks/useQuota.js.
const TYPE_TO_FIELD = {
    proposal: "createdCount",
    loi: "LOIcount",
    cover: "CoverCount",
    download: "sampleDownloadedCount",
};

const TYPE_TO_NOUN = {
    proposal: "proposal",
    loi: "LOI",
    cover: "cover letter",
    download: "sample download",
};

// POST /api/users/:id/download
// Body: { type: "loi" | "cover" | "download" | "proposal" }
async function consumeDownload(req, res) {
    try {
        const { id } = req.params;
        const { type } = req.body;

        const field = TYPE_TO_FIELD[type];
        if (!field) {
            // This is exactly the 400 the frontend was hitting for "loi"/"cover"
            // before this field mapping existed — now it's a real code path
            // instead of falling through to a generic validation rejection.
            return res.status(400).json({
                success: false,
                message: `Unsupported download type: "${type}".`,
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const plan = user.subscription?.plan || "free";
        const limits = getPlanLimits(plan);
        const periodDays = getPeriodDays(plan);

        // Refill the counters if a new billing period has started. Free plan
        // (periodDays === null) never refills — it's a one-time allowance.
        if (periodDays) {
            const periodStart = user.subscription?.currentPeriodStart || user.createdAt;
            const daysSinceStart = (Date.now() - new Date(periodStart).getTime()) / 86400000;
            if (daysSinceStart >= periodDays) {
                user.proposalStats.sampleDownloadedCount = limits.sampleDownloadedCount;
                user.proposalStats.createdCount = limits.createdCount;
                user.proposalStats.LOIcount = limits.LOIcount;
                user.proposalStats.CoverCount = limits.CoverCount;
                user.proposalStats.trackerUsageCount = limits.trackerUsageCount;
                user.subscription.currentPeriodStart = new Date();
            }
        }

        const current = user.proposalStats[field] ?? 0;
        if (current <= 0) {
            const noun = TYPE_TO_NOUN[type];
            return res.status(400).json({
                success: false,
                message: plan === "free"
                    ? `You've used your free ${noun}. Upgrade your plan for more.`
                    : `You've used all your ${noun}s for this billing period. Upgrade your plan for more.`,
            });
        }

        user.proposalStats[field] = current - 1;
        await user.save();

        return res.status(200).json({
            success: true,
            remaining: user.proposalStats[field],
        });
    } catch (err) {
        console.error("[consumeDownload] error:", err);
        return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
}

module.exports = { consumeDownload };