const Proposal = require("../models/proposal.model");


// =====================================================
// 🤖 AI GENERATE PROPOSAL
// POST /api/proposals/generate
// =====================================================
exports.generateProposal = async (req, res) => {
    try {
        const { grantId, input } = req.body;

        // 🔥 Replace this with OpenAI later
        const aiContent = {
            title: "AI Generated Proposal",
            background: "Problem explanation...",
            objectives: ["Objective 1", "Objective 2"],
            methodology: "Step by step implementation..."
        };

        const proposal = await Proposal.create({
            user: req.user,
            grant: grantId,
            title: aiContent.title,
            status: "completed",
            content: aiContent
        });

        res.json({
            jobId: proposal._id,
            status: proposal.status,
            proposal
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 🔄 REGENERATE SECTION
// POST /api/proposals/regenerate/:id
// =====================================================
exports.regenerateProposal = async (req, res) => {
    try {
        const { id } = req.params;
        const { section } = req.body;

        const proposal = await Proposal.findOne({
            _id: id,
            user: req.user
        });

        if (!proposal) {
            return res.status(404).json({ message: "Proposal not found" });
        }

        // 🔥 Replace with AI regeneration
        proposal.content[section] = "Regenerated AI content";

        await proposal.save();

        res.json(proposal);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 📊 GENERATION STATUS
// GET /api/proposals/generate/status/:jobId
// =====================================================
exports.getStatus = async (req, res) => {
    try {
        const { jobId } = req.params;

        const proposal = await Proposal.findOne({
            _id: jobId,
            user: req.user
        });

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json({
            status: proposal.status,
            proposal: proposal.status === "completed" ? proposal : null
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// ⭐ SCORE PROPOSAL
// POST /api/proposals/score
// =====================================================
exports.scoreProposal = async (req, res) => {
    try {
        const { content } = req.body;

        // 🔥 Replace with AI scoring
        const score = Math.floor(Math.random() * 40) + 60;

        res.json({
            score,
            feedback: "Good proposal, improve clarity in methodology."
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 📄 GET ALL PROPOSALS
// GET /api/proposals
// =====================================================
exports.getProposals = async (req, res) => {
    try {
        const { status } = req.query;

        let query = { user: req.user };

        if (status) query.status = status;

        const proposals = await Proposal.find(query)
            .sort({ createdAt: -1 })
            .select("title status score createdAt updatedAt");

        res.json(proposals);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 📄 GET SINGLE PROPOSAL
// GET /api/proposals/:id
// =====================================================
exports.getProposalById = async (req, res) => {
    try {
        const proposal = await Proposal.findOne({
            _id: req.params.id,
            user: req.user
        });

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(proposal);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// ➕ CREATE PROPOSAL
// POST /api/proposals
// =====================================================
exports.createProposal = async (req, res) => {
    try {
        const { title, grantId } = req.body;

        const proposal = await Proposal.create({
            user: req.user,
            grant: grantId,
            title: title || "New Proposal",
            status: "pending",
            content: {}
        });

        res.status(201).json(proposal);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// ✏️ UPDATE PROPOSAL
// PUT /api/proposals/:id
// =====================================================
exports.updateProposal = async (req, res) => {
    try {
        const { content, title } = req.body;

        const proposal = await Proposal.findOneAndUpdate(
            { _id: req.params.id, user: req.user },
            { content, title },
            { new: true }
        );

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(proposal);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 🔄 UPDATE STATUS
// PATCH /api/proposals/:id/status
// =====================================================
exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;

        const proposal = await Proposal.findOneAndUpdate(
            { _id: req.params.id, user: req.user },
            { status },
            { new: true }
        );

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json(proposal);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// ❌ DELETE PROPOSAL
// DELETE /api/proposals/:id
// =====================================================
exports.deleteProposal = async (req, res) => {
    try {
        const proposal = await Proposal.findOneAndDelete({
            _id: req.params.id,
            user: req.user
        });

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        res.json({ message: "Proposal deleted" });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 📄 DUPLICATE PROPOSAL
// POST /api/proposals/:id/duplicate
// =====================================================
exports.duplicateProposal = async (req, res) => {
    try {
        const proposal = await Proposal.findOne({
            _id: req.params.id,
            user: req.user
        });

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        const newProposal = await Proposal.create({
            user: req.user,
            grant: proposal.grant,
            title: proposal.title + " (Copy)",
            status: "pending",
            content: proposal.content
        });

        res.json(newProposal);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.downloadProposal = async (req, res) => {
    try {
        const Proposal = require("../models/proposal.model");

        const proposal = await Proposal.findOne({
            _id: req.params.id,
            user: req.user
        });

        if (!proposal) {
            return res.status(404).json({ message: "Not found" });
        }

        // 🔥 increase count
        req.userData.downloadCount += 1;
        await req.userData.save();

        res.json({
            message: "Download success",
            remaining: req.userData.downloadLimit - req.userData.downloadCount,
            proposal
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};