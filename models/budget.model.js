const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        projectDuration: {
            type: String,
            required: true,
        },
        focusArea: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: "",
        },
        docUrl: {
            type: String,
            default: "",
        },
        type: {
            type: Number,
            enum: [0, 1], // 0 = User, 1 = Admin
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

module.exports = mongoose.model("Budget", budgetSchema);