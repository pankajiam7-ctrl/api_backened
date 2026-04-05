const mongoose = require("mongoose");

const grantLinkSchema = new mongoose.Schema(
    {
        grantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GrantScrap",
            required: true,
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