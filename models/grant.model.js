const mongoose = require("mongoose");

// ── GrantScrap ─────────────────────────────────────────────────────────────────
const grantScrapSchema = new mongoose.Schema(
  {
    raw: {
      grant_name:        { type: String, default: "Unnamed Grant" },
      deadline:          { type: String, default: "N/A" },
      amount:            { type: String, default: "N/A" },
      region:            { type: String, default: "N/A" },
      donor_agency:      { type: String, default: "N/A" },
      eligibility:       { type: String, default: "N/A" },
      short_description: { type: String, default: "" },
      source_url:        { type: String, default: "#" },
    },
  },
  { timestamps: true }
);

const GrantCron = mongoose.model("GrantScrap", grantScrapSchema, "grantscraps");

// ── GrantMemory (future: track sent history etc.) ─────────────────────────────
const grantMemorySchema = new mongoose.Schema(
  {
    grant_id:   { type: mongoose.Schema.Types.ObjectId, ref: "GrantScrap" },
    sent_at:    { type: Date, default: Date.now },
    sent_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const GrantMemory = mongoose.model("GrantMemory", grantMemorySchema, "grantmemory");

module.exports = { GrantCron, GrantMemory };