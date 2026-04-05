const mongoose = require("mongoose");

const proposalSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        grant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Grant"
        },

        title: String,

        status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "pending"
        },

        score: Number,

        // 🧠 FULL AI GENERATED CONTENT
        content: {
            type: Object,
            required: true
        }

    },
    { timestamps: true }
);

module.exports = mongoose.model("Proposal", proposalSchema);