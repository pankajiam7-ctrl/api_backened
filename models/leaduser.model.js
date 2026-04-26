const mongoose = require("mongoose");

const leadUserSchema = new mongoose.Schema(
  {
    user_email:   { type: String, required: true },
    user_country: { type: String, default: "N/A" },
    sent_email:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LeadUser", leadUserSchema, "leadUsers");