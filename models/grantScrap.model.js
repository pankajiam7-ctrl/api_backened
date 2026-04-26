const mongoose = require("mongoose");

const grantSchema = new mongoose.Schema(
    {
        // ─── RAW AI OUTPUT ────────────────────────────────────────────────
        raw: {
            grant_name:             { type: String, default: null },
            deadline:               { type: String, default: null },
            amount:                 { type: String, default: null },
            region:                 { type: String, default: null },
            donor_agency:           { type: String, default: null },
            eligibility:            [{ type: String }],
            inferred_focus_areas:   { type: [String], default: [] },  // ✅ FIXED
            short_description:      { type: String, default: null },
            source_url:             { type: String, default: null },
            apply_url:              { type: String, default: null },
        },

        // ─── CORE FIELDS ──────────────────────────────────────────────────
        title:      { type: String, required: true, index: true, unique: true },
        donor:      { type: String, index: true },
        category:   { type: String, default: "grant" },

        // ✅ TOP-LEVEL inferred_focus_areas (scraper saves here directly)
        inferred_focus_areas: { type: [String], default: [] },

        // ─── GEOGRAPHY ───────────────────────────────────────────────────
        geography: {
            region:             { type: String },
            region_normalized:  { type: String, index: true },
            country:            [{ type: String, index: true }],
        },

        // ─── AI ENRICHMENT (filled by separate AI enrichment job) ────────
        ai: {
            inferred_focus_areas:   { type: [String], default: [] },  // ✅ FIXED
            inferred_focus_country: { type: [String], default: [] },
            inferred_region:        { type: String, default: null },
            inferred_donor:         { type: String, default: null },
            summary:                { type: String, default: null },
            long_description:       { type: String, default: null },
        },

        // ─── FINANCIALS ───────────────────────────────────────────────────
        financials: {
            raw:        { type: String, default: null },
            maxAmount:  { type: Number, default: null },
            currency: {
                type: String,
                enum: ["USD", "EUR", "INR", "GBP", "CAD", "AUD", "Unknown"],
                default: "Unknown",
            },
        },

        // ─── DEADLINE & STATUS ────────────────────────────────────────────
        deadline:   { type: Date,    default: null,     index: true },
        status: {
            type:    String,
            enum:    ["active", "rolling", "expired"],
            default: "active",
            index:   true,
        },
        isOpen:     { type: Boolean, default: true },

        // ─── CONTENT ─────────────────────────────────────────────────────
        eligibility:        [{ type: String }],
        shortDescription:   { type: String, default: null },
        applyUrl:           { type: String, default: null },
        searchText:         { type: String, index: true },

        // ─── MEDIA & META ─────────────────────────────────────────────────
        imageUrl:       { type: String, default: null },
        TitleURL:       { type: String, default: null },
        PDFURL:         { type: String, default: null },
        TitleName:      { type: String, default: null },
        seo_url:        { type: String, default: null },

        // ─── FLAGS ────────────────────────────────────────────────────────
        featured:       { type: Boolean, default: false },
        hasAiDetail:    { type: Boolean, default: false },
        type:           { type: Number,  default: 0 },
    },
    { timestamps: true }
);

// ─── INDEXES ──────────────────────────────────────────────────────────────────
grantSchema.index({
    title:              "text",
    donor:              "text",
    "geography.region": "text",
    searchText:         "text",
});

// ─── MODELS ───────────────────────────────────────────────────────────────────
const GrantScrap = mongoose.models.GrantScrap || mongoose.model("GrantScrap", grantSchema);

const grantMemorySchema = new mongoose.Schema(
    {
        url:            { type: String, unique: true },
        last_scraped:   { type: Date,   default: null },
        grants_found:   { type: Number, default: 0 },
        avg_score:      { type: Number, default: 0 },
        fail_count:     { type: Number, default: 0 },
        skip:           { type: Boolean, default: false },
        skip_reason:    { type: String, default: null },
    },
    { timestamps: true }
);

const GrantMemory = mongoose.models.GrantMemory || mongoose.model("GrantMemory", grantMemorySchema);

module.exports = { GrantScrap, GrantMemory };