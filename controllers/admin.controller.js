const User = require("../models/user.model");
const Grant = require("../models/grantScrap.model");
const Proposal = require("../models/proposal.model");
const GrantLink = require("../models/grantLink.model");
const cloudinary = require('../config/cloudinary');

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

exports.updateImage  = async (req, res) => {
    try {
     const data = await Grant.findOneAndUpdate(
            { _id: req.body.id },
            { $set: { imageUrl: req.body.imageUrl } },
            { new: true, upsert: false } // ✅ important fixes
        );
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
 }
}

exports.updateLink = async (req, res) => {
    try {
        const data = await GrantLink.findOneAndUpdate(
            { name: "main" },
            { $set: { name: "main", links: req.body.links } },
            { new: true, upsert: true }
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

exports.addPdfURL = async (req, res) => {
    try {
        const { data } = req.body;

    } catch (err) {
        res.status(500).json({ message: err.message });
    }

}

const saveInBackground = async (files) => {
    for (const file of files) {
        try {
            await Grant.updateOne(
                { TitleURL: file.seo_url },   // filter
                {
                    $set: {
                        title: file.title,
                        TitleURL: file.seo_url,
                        PDFURL: file.PDFURL,
                        type: file.type
                    }
                },
                { upsert: true }
            );

            console.log("Saved:", file.seo_url);

        } catch (err) {
            console.error("Error:", err.message);
        }
    }
};

// 🚀 Main API
exports.getCludinaryLink = async (req, res) => {
    try {
        const result = await cloudinary.search
            .expression('folder: DOC_SAMPLE')
            .max_results(100)
            .execute();

        const files = result.resources.map(item => {
            let name = item.filename.replace('.docx', '');

            // remove random suffix
            name = name.replace(/_[a-z0-9]+(_[a-z0-9]+)?$/, '');

            // create slug
            const slug = name
                .toLowerCase()
                .replace(/_/g, ' ')
                .replace(/[^a-z0-9 ]/g, '')
                .replace(/\s+/g, '-');


            return {
                title: name,
                seo_url: slug,
                PDFURL: item.secure_url,
                type: 1
            };
        });

        // ✅ Send response immediately
        res.json({
            success: true,
            count: files.length,
            data: files
        });

        // ✅ Save in background
        saveInBackground(files);

    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};