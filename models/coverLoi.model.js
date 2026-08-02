const mongoose = require("mongoose");

const coverLoiSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        summary: {
            type: String,
            required: true,
            trim: true,
        },
        docUrl: {
            type: String,
            required: true,
        },
        isCover: {
            type: Boolean,
            default: false,
        },
        isLOI: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("CoverLoi", coverLoiSchema);