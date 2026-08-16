const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const User = require("../models/user.model");

// ─────────────────────────────────────────────────────────────────────────
// Plan config — maps our internal plan name -> Razorpay plan_id + limits.
//
// FIXED: previously each entry had an `internalPlan` field that translated
// 'monthly' -> "paid" and 'yearly' -> "premium" before saving to
// user.subscription.plan. That's exactly why createSubscription() started
// throwing "`paid` is not a valid enum value" once the User schema's
// subscription.plan enum was locked to ["free","monthly","yearly"] — the
// enum is correct, this file was translating into values outside it.
// Removed the indirection entirely: user.subscription.plan is now just set
// to planType directly ('monthly' | 'yearly'), which is also exactly what
// the frontend (Pricing.jsx, useQuota.js) already expects to read.
//
// ALSO FIXED: `limits` now includes LOIcount/CoverCount (2/2 monthly,
// 24/24 yearly), matching src/utils/plans.js on the frontend. Previously
// these were missing entirely — user.model.js needs the corresponding
// LOIcount/CoverCount fields added to proposalStats if it doesn't have them
// yet (see backend-updates/models/User.js from earlier in this thread).
// ─────────────────────────────────────────────────────────────────────────
const PLAN_CONFIG = {
    monthly: {
        planId: process.env.RAZORPAY_PLAN_ID_MONTHLY,
        totalCount: 60,  // bill for up to 60 months (~5 yrs), auto-renews each cycle
        price: 4.99,
        limits: {
            sampleDownloadedCount: 2,
            createdCount: 2,
            LOIcount: 2,
            CoverCount: 2,
            trackerUsageCount: 5,
        },
    },
    yearly: {
        planId: process.env.RAZORPAY_PLAN_ID_YEARLY,
        totalCount: 10,  // bill for up to 10 years
        price: 24.99,
        limits: {
            sampleDownloadedCount: 24,
            createdCount: 24,
            LOIcount: 24,
            CoverCount: 24,
            trackerUsageCount: 9999,
        },
    },
};

// GET /api/payment/razorpay/plans
exports.getPlans = (req, res) => {
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");

    const { RAZORPAY_KEY_ID } = process.env;
    const monthlyPlanId = PLAN_CONFIG.monthly.planId;
    const yearlyPlanId = PLAN_CONFIG.yearly.planId;

    // Catch missing env vars early with a clear message instead of
    // returning { planId: undefined } and failing silently on the frontend.
    if (!RAZORPAY_KEY_ID || !monthlyPlanId || !yearlyPlanId) {
        console.error("❌ Razorpay plans misconfigured:", {
            hasKeyId: !!RAZORPAY_KEY_ID,
            hasMonthlyPlanId: !!monthlyPlanId,
            hasYearlyPlanId: !!yearlyPlanId,
        });
        return res.status(500).json({
            success: false,
            message: "Razorpay plans are not configured on the server. Check RAZORPAY_KEY_ID, RAZORPAY_PLAN_ID_MONTHLY, RAZORPAY_PLAN_ID_YEARLY env vars.",
        });
    }

    res.json({
        success: true,
        key: RAZORPAY_KEY_ID,
        monthly: { planId: monthlyPlanId, price: PLAN_CONFIG.monthly.price, period: "month" },
        yearly: { planId: yearlyPlanId, price: PLAN_CONFIG.yearly.price, period: "year" },
    });
};
// ─────────────────────────────────────────────────────────────────────────
// POST /api/payment/razorpay/subscription
// body: { planType: "monthly" | "yearly" }
// auth required — req.user is the logged-in user id (set by protect middleware)
// ─────────────────────────────────────────────────────────────────────────
exports.createSubscription = async (req, res) => {
    try {
        const { planType } = req.body;
        const config = PLAN_CONFIG[planType];

        if (!config) {
            return res.status(400).json({ success: false, message: "Invalid planType. Use 'monthly' or 'yearly'." });
        }
        if (!config.planId) {
            return res.status(500).json({ success: false, message: `Razorpay plan id not configured for ${planType}` });
        }

        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const subscription = await razorpay.subscriptions.create({
            plan_id: config.planId,
            customer_notify: 1,
            total_count: config.totalCount,
            quantity: 1,
            notes: {
                userId: user._id.toString(),
                planType,
            },
        });

        // Save the pending subscription id right away so the webhook/verify
        // step can find the user even if the browser tab closes early.
        user.razorpaySubscriptionId = subscription.id;
        // FIXED: was config.internalPlan ("paid"/"premium") — now the real
        // planType, which matches the schema enum and what the frontend reads.
        user.subscription.plan = planType;
        user.subscription.status = "pending";
        await user.save();

        res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            subscriptionId: subscription.id,
            planType,
        });
    } catch (err) {
        console.error("Razorpay createSubscription error:", err?.error || err.message);
        res.status(500).json({ success: false, message: "Failed to create subscription" });
    }
};

// ─────────────────────────────────────────────────────────────────────────
// POST /api/payment/razorpay/verify
// body: { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
// Called from the frontend's Razorpay Checkout `handler` callback right
// after the user completes payment. This gives an instant UX update; the
// webhook below is the source of truth for anything that happens later
// (renewals, failures, cancellations) since it doesn't depend on the
// browser staying open.
// ─────────────────────────────────────────────────────────────────────────
exports.verifySubscription = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

        if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: "Missing verification fields" });
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        const user = await User.findOne({ razorpaySubscriptionId: razorpay_subscription_id });
        if (!user) {
            return res.status(404).json({ success: false, message: "No matching user for this subscription" });
        }

        // FIXED: user.subscription.plan is now already 'monthly'/'yearly'
        // directly (set in createSubscription above), so this no longer
        // needs to reverse-lookup through an internalPlan translation table.
        const planType = user.subscription.plan;
        const config = PLAN_CONFIG[planType] || PLAN_CONFIG.monthly;

        user.subscription.status = "active";
        // Track when this billing period started, so counters can be
        // refilled on schedule (30 days for monthly, 365 for yearly) —
        // see backend-updates/controllers/downloadController.js.
        user.subscription.currentPeriodStart = new Date();
        user.proposalStats.sampleDownloadedCount = config.limits.sampleDownloadedCount;
        user.proposalStats.createdCount = config.limits.createdCount;
        // ADDED: previously missing — this is why LOI/Cover downloads
        // remaining always showed 0 after a purchase, even a successful one.
        user.proposalStats.LOIcount = config.limits.LOIcount;
        user.proposalStats.CoverCount = config.limits.CoverCount;
        user.proposalStats.trackerUsageCount = config.limits.trackerUsageCount;
        await user.save();

        res.json({ success: true, message: "Payment verified, subscription active", data: user });
    } catch (err) {
        console.error("Razorpay verifySubscription error:", err.message);
        res.status(500).json({ success: false, message: "Verification failed" });
    }
};

// ─────────────────────────────────────────────────────────────────────────
// POST /api/payment/razorpay/webhook
// Configure this URL in Razorpay Dashboard → Settings → Webhooks, and
// subscribe to: subscription.activated, subscription.charged,
// subscription.cancelled, subscription.completed, subscription.halted
// IMPORTANT: this route needs the RAW request body — see app.js wiring.
// ─────────────────────────────────────────────────────────────────────────
exports.webhookHandler = async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];

        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(req.body) // raw buffer/string, not parsed JSON
            .digest("hex");

        if (expected !== signature) {
            console.log("❌ Razorpay webhook signature mismatch");
            return res.status(400).json({ success: false, message: "Invalid webhook signature" });
        }

        const event = JSON.parse(req.body);
        const sub = event.payload?.subscription?.entity;

        switch (event.event) {
            case "subscription.activated":
            case "subscription.charged": {
                if (sub?.id) {
                    // On renewal charges, also refill the period counters —
                    // otherwise a monthly subscriber's LOI/Cover/download
                    // counts only ever get set once, at first purchase, and
                    // never refill on subsequent billing cycles.
                    const renewingUser = await User.findOne({ razorpaySubscriptionId: sub.id });
                    if (renewingUser) {
                        const planType = renewingUser.subscription.plan;
                        const config = PLAN_CONFIG[planType];
                        renewingUser.subscription.status = "active";
                        renewingUser.subscription.currentPeriodStart = new Date();
                        if (config) {
                            renewingUser.proposalStats.sampleDownloadedCount = config.limits.sampleDownloadedCount;
                            renewingUser.proposalStats.createdCount = config.limits.createdCount;
                            renewingUser.proposalStats.LOIcount = config.limits.LOIcount;
                            renewingUser.proposalStats.CoverCount = config.limits.CoverCount;
                            renewingUser.proposalStats.trackerUsageCount = config.limits.trackerUsageCount;
                        }
                        await renewingUser.save();
                    }
                }
                console.log("✅ Razorpay subscription active:", sub?.id);
                break;
            }
            case "subscription.cancelled":
            case "subscription.completed": {
                if (sub?.id) {
                    await User.findOneAndUpdate(
                        { razorpaySubscriptionId: sub.id },
                        { $set: { "subscription.status": "cancelled" } }
                    );
                }
                console.log("🛑 Razorpay subscription ended:", sub?.id);
                break;
            }
            case "subscription.halted": {
                // Razorpay pauses a subscription after repeated payment failures
                if (sub?.id) {
                    await User.findOneAndUpdate(
                        { razorpaySubscriptionId: sub.id },
                        { $set: { "subscription.status": "past_due" } }
                    );
                }
                console.log("⏸️ Razorpay subscription halted:", sub?.id);
                break;
            }
            default:
                console.log("Unhandled Razorpay event:", event.event);
        }

        res.status(200).json({ received: true });
    } catch (err) {
        console.error("Razorpay webhook error:", err.message);
        res.status(500).json({ success: false });
    }
};

// ─────────────────────────────────────────────────────────────────────────
// POST /api/payment/razorpay/cancel
// body: { cancelAtCycleEnd?: boolean }
// ─────────────────────────────────────────────────────────────────────────
exports.cancelSubscription = async (req, res) => {
    try {
        const user = await User.findById(req.user);
        if (!user?.razorpaySubscriptionId) {
            return res.status(404).json({ success: false, message: "No active subscription found" });
        }

        const cancelAtCycleEnd = req.body.cancelAtCycleEnd ? 1 : 0;
        await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, cancelAtCycleEnd);

        if (!cancelAtCycleEnd) {
            user.subscription.status = "cancelled";
            await user.save();
        }

        res.json({ success: true, message: "Subscription cancellation requested" });
    } catch (err) {
        console.error("Razorpay cancelSubscription error:", err?.error || err.message);
        res.status(500).json({ success: false, message: "Failed to cancel subscription" });
    }
};