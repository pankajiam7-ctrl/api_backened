const mongoose = require("mongoose");

const proposalSchema = new mongoose.Schema(
{
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },

    grantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Grant",
        index: true
    },

    title: {
        type: String,
        default: "Untitled Proposal",
        trim: true
    },

    // ✅ content (AI/manual)
    content: {
        type: Object,
        default: {}
    },

    // ✅ status
    status: {
        type: String,
        enum: ["draft", "in_progress", "completed", "rejected"],
        default: "draft",
        index: true
    },

    // ✅ type
    proposalType: {
        type: String,
        enum: ["sample", "created", "tracking"],
        default: "created",
        index: true
    },

    // ✅ save / like / draft
    savedBy: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            type: {
                type: String,
                default: "draft",
                enum: ["draft", "liked", "saved"]
            },
            savedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    // ✅ score
    score: {
        type: Number
    }

},
{
    timestamps: true
}
);

module.exports = mongoose.model("Proposal", proposalSchema);