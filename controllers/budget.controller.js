const Budget = require("../models/budget.model");

// Create Budget
exports.budget = async (req, res) => {
    try {
        const budget = await Budget.create(req.body);

        res.status(201).json({
            success: true,
            message: "Budget created successfully.",
            data: budget,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Get All Budget
exports.getbudget = async (req, res) => {
    try {
        const budgets = await Budget.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: budgets.length,
            data: budgets,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Delete Budget
exports.deletebudget = async (req, res) => {
    try {
        const budget = await Budget.findByIdAndDelete(req.params.id);

        if (!budget) {
            return res.status(404).json({
                success: false,
                message: "Budget not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Budget deleted successfully.",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};