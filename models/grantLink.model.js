const mongoose = require("mongoose");

const grantLinkSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            default: "main"
        },
        grantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GrantScrap",
            required: false,
            index: true
        },

        links: {
            type: [String],
            default: []
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("GrantLink", grantLinkSchema);