const mongoose = require("mongoose");

const logFrameSchema = new mongoose.Schema(
    {
        projectTitle: {
            type: String,
            required: true,
            trim: true,
        },
        problemStatement: {
            type: String,
            required: true,
        },
        docUrl: {
            type: String,
            default: "",
        },
        type: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        categoryType: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("LogFrame", logFrameSchema);