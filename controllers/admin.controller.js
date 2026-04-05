const User = require("../models/user.model");
const Grant = require("../models/grantScrap.model");
const Proposal = require("../models/proposal.model");
const GrantLink = require("../models/grantLink.model");

// =====================================================
// 👥 GET ALL USERS (FILTERS)
// GET /api/admin/users
// =====================================================
exports.getUsers = async (req, res) => {
    try {
        const {
            paid,
            active,
            emailVerified,
            page = 1,
            limit = 10
        } = req.query;

        let query = {};

        // 💳 Paid / Not Paid
        if (paid === "true") {
            query["subscription.status"] = "active";
        } else if (paid === "false") {
            query["subscription.status"] = { $ne: "active" };
        }

        // 🟢 Active / Inactive
        if (active === "true") {
            query.isActive = true;
        } else if (active === "false") {
            query.isActive = false;
        }

        // 📧 Email Verified
        if (emailVerified === "true") {
            query.emailVerified = true;
        } else if (emailVerified === "false") {
            query.emailVerified = false;
        }

        const users = await User.find(query)
            .select("name email subscription isActive emailVerified createdAt")
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(query);

        res.json({
            total,
            page: Number(page),
            users
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 📊 PLATFORM STATS
// GET /api/admin/stats
// =====================================================
exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalGrants = await Grant.countDocuments();
        const totalProposals = await Proposal.countDocuments();

        const activeSubscriptions = await User.countDocuments({
            "subscription.status": "active"
        });

        const stats = {
            users: totalUsers,
            grants: totalGrants,
            proposals: totalProposals,
            activeSubscriptions
        };

        res.json(stats);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 💳 UPDATE USER PLAN (ADMIN)
// PUT /api/admin/users/:id/plan
// =====================================================
exports.updateUserPlan = async (req, res) => {
    try {
        const { plan, status } = req.body;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            {
                subscription: {
                    plan,
                    status
                }
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// =====================================================
// 🚀 PUBLISH / UNPUBLISH GRANT
// PUT /api/admin/grants/:id/publish
// =====================================================
exports.publishGrant = async (req, res) => {
    try {
        const { isOpen, featured } = req.body;

        const grant = await Grant.findByIdAndUpdate(
            req.params.id,
            {
                isOpen,
                featured
            },
            { new: true }
        );

        if (!grant) {
            return res.status(404).json({ message: "Grant not found" });
        }

        res.json(grant);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateLink = async (req, res) => {
    try {
        const { links } = req.body;

        if (!Array.isArray(links)) {
            return res.status(400).json({ message: "Links must be an array" });
        }

        const data = await GrantLink.findOneAndUpdate(
            { grantId: req.params.id },
            { $set: { links } },
            { upsert: true, returnDocument: "after" }
        );

        res.json(data);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getLink = async (req, res) => {
    try {
        const data = await GrantLink.find();

        res.json(data);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.addPdfURL = async(req, res)=>{
    try{
     const { data } = req.body;

    }catch (err) {
        res.status(500).json({ message: err.message });
    }

}
