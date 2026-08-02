const CoverLoi = require("../models/coverLoi.model");

exports.coverLoi = async (req, res) => {
    try {
        const { title, summary, docUrl, isCover, isLOI } = req.body;

        if (!title || !summary || !docUrl) {
            return res.status(400).json({
                success: false,
                message: "Title, Summary and Doc URL are required.",
            });
        }

        const coverLoi = await CoverLoi.create({
            title,
            summary,
            docUrl,
            isCover,
            isLOI,
        });

        return res.status(201).json({
            success: true,
            message: "Document saved successfully.",
            data: coverLoi,
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong.",
            error: error.message,
        });
    }
};


exports.getCoverLoi = async (req, res) => {
    try {
        const documents = await CoverLoi.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: documents.length,
            data: documents,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.deleteCoverLoi = async (req, res) => {
    try {
        const document = await CoverLoi.findByIdAndDelete(req.params.id);

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Document deleted successfully.",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};