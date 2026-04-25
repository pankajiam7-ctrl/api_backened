const mongoose = require("mongoose");

const grantSchema = new mongoose.Schema(
    {
        raw: {
            grant_name: { type: String, default: null },
            deadline: { type: String, default: null },
            amount: { type: String, default: null },
            region: { type: String, default: null },
            donor_agency: { type: String, default: null },
            eligibility: [{ type: String }],
            short_description: { type: String, default: null },
            source_url: { type: String, default: null },
            apply_url: { type: String, default: null },
        },
        title: { type: String, required: true, index: true, unique: true },
        donor: { type: String, index: true },
        category: { type: String, default: "grant" },
        geography: {
            region: { type: String },
            region_normalized: { type: String, index: true },
            country: [{ type: String, index: true }],
        },
        ai: {
            inferred_focus_country: [String],
            inferred_focus_areas: [String],
            inferred_region: String,
            inferred_donor: String,
            summary: String,
            long_description: String,
        },
        financials: {
            raw: { type: String, default: null },
            maxAmount: { type: Number, default: null },
            currency: {
                type: String,
                enum: ["USD", "EUR", "INR", "GBP", "CAD", "AUD", "Unknown"],
                default: "Unknown",
            },
        },
        deadline: { type: Date, default: null, index: true },
        status: {
            type: String,
            enum: ["active", "rolling", "expired"],
            default: "active",
            index: true,
        },
        isOpen: { type: Boolean, default: true },
        eligibility: [{ type: String }],
        shortDescription: { type: String, default: null },
        applyUrl: { type: String, default: null },
        searchText: { type: String, index: true },
        imageUrl: String,
        TitleURL: { type: String, default: null },
        PDFURL: { type: String, default: null },
        TitleName: { type: String, default: null },
        featured: { type: Boolean, default: false },
        hasAiDetail: { type: Boolean, default: false },
        type: { type: Number, default: 0 },
        seo_url: { type: String },
    },
    { timestamps: true }
);

grantSchema.index({ title: "text", donor: "text", "geography.region": "text", searchText: "text" });

const GrantScrap = mongoose.model("GrantScrap", grantSchema);

const grantMemorySchema = new mongoose.Schema({
    url: { type: String, unique: true },
    last_scraped: Date,
    grants_found: { type: Number, default: 0 },
    avg_score: { type: Number, default: 0 },
    fail_count: { type: Number, default: 0 },
    skip: { type: Boolean, default: false },
    skip_reason: { type: String, default: null },
}, { timestamps: true });

const GrantMemory = mongoose.models.GrantMemory || mongoose.model("GrantMemory", grantMemorySchema);

module.exports = { GrantScrap, GrantMemory };