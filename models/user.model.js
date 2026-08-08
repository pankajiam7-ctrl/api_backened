const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: String,
        email: { type: String, unique: true },
        password: String,

        role: {
            type: String,
            enum: ["ngo", "consultant"],
            default: "ngo"
        },

        phone: String,
        avatar: String,

        organization: {
            name: String,
            website: String,
            description: String,
            country: String
        },

        subscription: {
            // CHANGED: was a free-text String defaulting to "free" with no
            // constraint, and the checkout flow was writing the single
            // literal value "paid" for every purchase regardless of billing
            // cycle. That collapses monthly and yearly into one bucket,
            // which is exactly why the frontend can't tell a monthly buyer
            // (2 LOIs/2 Covers per month) apart from a yearly buyer
            // (24/24 per year) — there was nowhere to read that from.
            //
            // Set this to "monthly" or "yearly" at checkout (based on which
            // Razorpay/Stripe plan the user actually purchased) instead of
            // the generic "paid". "free" stays the default for new signups.
            plan: {
                type: String,
                enum: ["free", "monthly", "yearly"],
                default: "free"
            },
            status: { type: String, default: "not_active" },
            // When the current period's counters were last reset. Needed so
            // the "2 / month" and "24 / year" allowances actually refill on
            // schedule instead of just draining to 0 forever after signup.
            currentPeriodStart: { type: Date, default: Date.now }
        },

        stripeCustomerId: String,
        stripeSubscriptionId: String,

        razorpayCustomerId: String,
        razorpaySubscriptionId: String,

        proposalStats: {
            sampleDownloadedCount: {   // sample proposal download
                type: Number,
                default: 1
            },
            createdCount: {           // user created proposals
                type: Number,
                default: 1
            },
            trackerUsageCount: {      // tracker use / open
                type: Number,
                default: 1
            },

            // ADDED: previously missing entirely — this is the direct cause
            // of "Cover letter downloads remaining: 0" / "LOI downloads
            // remaining: 0" always showing on the frontend, no matter what
            // the user's actual plan was. Defaults mirror the free plan's
            // "1 LOI / 1 Cover Letter" allowance from PLAN_LIMITS.free in
            // the frontend's utils/plans.js — keep these two in sync if
            // that file's numbers ever change.
            LOIcount: {
                type: Number,
                default: 1
            },
            CoverCount: {
                type: Number,
                default: 1
            }
        }

    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);