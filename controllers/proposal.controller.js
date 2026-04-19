const Proposal = require("../models/proposal.model");
const { buildProposalPrompt } = require("../services/promptBuilder");
const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
exports.dashboard = async (req, res) => {
    try {
        const { userId, grantId, title, proposalType } = req.body;

        const proposal = await Proposal.findOneAndUpdate(
            { userId, grantId, proposalType },
            {
                $setOnInsert: {
                    userId,
                    grantId,
                    title,
                    proposalType
                }
            },
            {
                new: true,
                upsert: true
            }
        );

        res.json({
            success: true,
            data: proposal
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};

exports.saveStatus = async (req, res) => {
    try {
        const { userId, grantId, proposalType, type } = req.body;
        // type = "draft" | "liked" | "saved"

        const proposal = await Proposal.findOne({
            userId,
            grantId,
            proposalType
        });

        if (!proposal) {
            return res.status(404).json({ message: "Proposal not found" });
        }

        // Check if already exists
        const existing = proposal.savedBy.find(
            (item) => item.user.toString() === userId
        );

        if (existing) {
            // update type
            existing.type = type;
            existing.savedAt = new Date();
        } else {
            // push new
            proposal.savedBy.push({
                user: userId,
                type
            });
        }

        await proposal.save();

        res.json({
            success: true,
            message: "Status updated",
            data: proposal
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};

exports.dashboardStatus = async (req, res) => {
    try {
        const userId = req.params.userId; // ✅ from query

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }

        const proposals = await Proposal.find({ userId });

        if (!proposals || proposals.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No proposals found"
            });
        }

        res.status(200).json({
            success: true,
            count: proposals.length,
            data: proposals
        });

    } catch (err) {
        console.error("Get User Proposals Error:", err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};


exports.generateProposal = async (req, res) => {
    try {
        const { title, focus, budget, section } = req.body;

        if (!title || !focus || !budget || !section) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        // 👉 Use external prompt builder
        const prompt = buildProposalPrompt({ title, focus, budget, section });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a professional grant proposal writer." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 400   // ✅ added
        });

        const generatedContent = response.choices[0].message.content;

        res.status(200).json({
            success: true,
            section,
            content: generatedContent.replace(
                new RegExp(`(^|\\n)\\s*(#+\\s*)?\\*?\\*?${section}\\*?\\*?\\s*`, "gi"),
                ""
            )
        });

    } catch (err) {
        console.error("Generate Proposal Error:", err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};