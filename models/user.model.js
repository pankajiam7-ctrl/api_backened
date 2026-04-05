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
        plan: { type: String, default: "free" },
        status: { type: String, default: "not_active" }
    },

    stripeCustomerId: String,
    stripeSubscriptionId: String,

    // ✅ ONLY PROPOSAL TRACKING
    proposalStats: {
        sampleDownloadedCount: {   // sample proposal download
            type: Number,
            default: 0
        },
        createdCount: {           // user created proposals
            type: Number,
            default: 0
        },
        trackerUsageCount: {      // tracker use / open
            type: Number,
            default: 0
        }
    }

},
{ timestamps: true }
);

module.exports = mongoose.model("User", userSchema);