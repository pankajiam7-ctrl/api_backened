const mongoose = require("mongoose");

const grantSchema = new mongoose.Schema(
    {
        // =========================
        // 🧾 RAW DATA (Source of Truth)
        // =========================
        raw: {
            grant_name: { type: String, default: null },
            deadline: { type: String, default: null }, // keep as string — parsed separately
            amount: { type: String, default: null },
            region: { type: String, default: null },
            donor_agency: { type: String, default: null },
            eligibility: { type: String, default: null },
            short_description: { type: String, default: null },
            source_url: { type: String, default: null },
        },

        // =========================
        // 📌 CORE FIELDS (UI / API)
        // =========================
        title: { type: String, required: true, index: true },
        donor: { type: String, index: true },
        category: { type: String, default: "grant" },

        // =========================
        // 🌍 GEOGRAPHY
        // =========================
        geography: {
            region: { type: String },
            region_normalized: { type: String, index: true },
            country: [{ type: String, index: true }],
        },

        // =========================
        // 🧠 AI INFERRED DATA
        // =========================
        ai: {
            inferred_focus_country: [String],
            inferred_focus_areas: [String],
            inferred_region: String,
            inferred_donor: String,
            summary: String,
            long_description: String,
        },

        // =========================
        // 💰 FUNDING
        // =========================
        financials: {
            raw: { type: String, default: null },
            maxAmount: { type: Number, default: null },
            currency: {
                type: String,
                enum: ["USD", "EUR", "INR", "GBP", "CAD", "AUD", "Unknown"],
                default: "Unknown",
            },
        },

        // =========================
        // 📅 TIMELINE
        // =========================
        deadline: { type: Date, default: null, index: true },

        status: {
            type: String,
            enum: ["active", "rolling", "expired"],
            default: "active",
            index: true,
        },

        isOpen: { type: Boolean, default: true },

        // =========================
        // 📝 CONTENT
        // =========================
        eligibility: { type: String, default: null },
        shortDescription: { type: String, default: null },

        // =========================
        // 🔍 SEARCH
        // =========================
        searchText: { type: String, index: true },

        // =========================
        // 🖼 MEDIA
        // =========================
        imageUrl: String,
        TitleURL: {
            type: String,
            default: null
        },
        PDFURL: {
            type: String,
            default: null
        },

        // =========================
        // ⭐ FLAGS
        // =========================
        featured: { type: Boolean, default: false },
        hasAiDetail: { type: Boolean, default: false }, // replaces the old "content" flag

        type: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// =========================
// 🔎 TEXT INDEX
// =========================
grantSchema.index({
    title: "text",
    donor: "text",
    "geography.region": "text",
    searchText: "text",
});

module.exports = mongoose.model("GrantScrap", grantSchema);
