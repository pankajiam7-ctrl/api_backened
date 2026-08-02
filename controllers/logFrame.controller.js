const LogFrame = require("../models/logFrame.model");

// Create LogFrame
exports.logFrame = async (req, res) => {
    try {
        const logFrame = await LogFrame.create(req.body);

        res.status(201).json({
            success: true,
            message: "LogFrame created successfully.",
            data: logFrame,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Get All LogFrame
exports.getlogFrame = async (req, res) => {
    try {
        const logFrames = await LogFrame.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: logFrames.length,
            data: logFrames,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Delete LogFrame
exports.deletelogFrame = async (req, res) => {
    try {
        const logFrame = await LogFrame.findByIdAndDelete(req.params.id);

        if (!logFrame) {
            return res.status(404).json({
                success: false,
                message: "LogFrame not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "LogFrame deleted successfully.",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};