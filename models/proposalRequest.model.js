// models/proposal.model.js

const mongoose = require("mongoose");

const proposalRequestSchema = new mongoose.Schema(
    {
        projectTitle: {
            type: String,
            required: true,
            trim: true
        },

        focusAreas: [
            {
                id: String,
                name: String
            }
        ],

        countries: [
            {
                code: String,
                name: String
            }
        ],

        donors: [
            {
                id: String,
                name: String
            }
        ],

        includeLOI: {
            type: Number,
            enum: [0, 1],
            default: 0
        },

        includeCoverLetter: {
            type: Number,
            enum: [0, 1],
            default: 0
        },

        status: {
            type: String,
            enum: ["processing", "completed", "failed"],
            default: "processing"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("ProposalRequest", proposalRequestSchema);