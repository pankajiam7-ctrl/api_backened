// controllers/proposal.controller.js

const ProposalRequest = require("../models/proposalRequest.model");

exports.requestProposal = async (req, res) => {
    try {
        const {
            projectTitle,
            focusAreas,
            countries,
            donors,
            includeLOI = 0,
            includeCoverLetter = 0
        } = req.body;

        // Validation
        if (!projectTitle?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Project title is required."
            });
        }

        if (!Array.isArray(focusAreas) || focusAreas.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one focus area is required."
            });
        }

        if (!Array.isArray(countries) || countries.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one country is required."
            });
        }

        if (!Array.isArray(donors) || donors.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one donor is required."
            });
        }

  const proposalRequest = await ProposalRequest.create({
            projectTitle,
            focusAreas,
            countries,
            donors,
            includeLOI,
            includeCoverLetter,
            status: "processing"
        });

        return res.status(201).json({
            success: true,
            message: "Proposal created successfully.",
            data: proposalRequest
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
};