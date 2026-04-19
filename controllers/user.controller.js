const User = require("../models/user.model");

// GET /api/users/me
exports.getMe = async (req, res) => {
    const user = await User.findById(req.user).select("-password");
    res.json(user);
};

// PUT /api/users/me
exports.updateMe = async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.user,
        req.body,
        { new: true }
    ).select("-password");

    res.json(user);
};

// GET /api/users/me/subscription
exports.getSubscription = async (req, res) => {
    const user = await User.findById(req.user);
    res.json(user.subscription);
};

// DELETE /api/users/me
exports.deleteAccount = async (req, res) => {
    await User.findByIdAndDelete(req.user);
    res.json({ message: "Account deleted" });
};

// POST /api/users/me/avatar
exports.uploadAvatar = async (req, res) => {
    const { avatar } = req.body;

    const user = await User.findByIdAndUpdate(
        req.user,
        { avatar },
        { new: true }
    );

    res.json(user);
};



// ✅ GET Saved Grants
exports.getSavedGrants = async (req, res) => {
    try {
        const user = await User.findById(req.user)
            .populate("savedGrants", "title donor deadline maxAmount");

        res.json(user.savedGrants);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ SAVE Grant
exports.saveGrant = async (req, res) => {
    try {
        const { grantId } = req.params;

        const user = await User.findById(req.user);

        // Prevent duplicate save
        if (user.savedGrants.includes(grantId)) {
            return res.status(400).json({ message: "Already saved" });
        }

        user.savedGrants.push(grantId);
        await user.save();

        res.json({ message: "Grant saved" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ✅ REMOVE Saved Grant
exports.removeSavedGrant = async (req, res) => {
    try {
        const { grantId } = req.params;

        const user = await User.findById(req.user);

        user.savedGrants = user.savedGrants.filter(
            id => id.toString() !== grantId
        );

        await user.save();

        res.json({ message: "Removed from saved" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
exports.updateUserPlan = async (req, res) => {
    try {
        const userId = req.params.id;
        const { plan } = req.body;

        if (!plan) {
            return res.status(400).json({
                success: false,
                message: "Plan is required"
            });
        }

        const PLAN_LIMITS = {
            free: {
                sampleDownloadedCount: 1,
                createdCount: 1,
                trackerUsageCount: 1
            },
            paid: {
                sampleDownloadedCount: 100,
                createdCount: 50,
                trackerUsageCount: 30
            },
            premium: {
                sampleDownloadedCount: 500,
                createdCount: 200,
                trackerUsageCount: 100
            }
        };

        const selectedPlan = PLAN_LIMITS[plan];

        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan"
            });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    "subscription.plan": plan,
                    "subscription.status": "active",

                    "proposalStats.sampleDownloadedCount": selectedPlan.sampleDownloadedCount,
                    "proposalStats.createdCount": selectedPlan.createdCount,
                    "proposalStats.trackerUsageCount": selectedPlan.trackerUsageCount
                }
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Subscription updated successfully",
            data: user
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
exports.getUserDetails = async (req, res) => {
    try {
        const userId = req.params.id;

        const user = await User.findById(userId).select(
            "name email role subscription proposalStats"
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: {
                name: user.name,
                email: user.email,
                role: user.role,

                plan: user.subscription.plan,
                status: user.subscription.status,

                trackerUsageCount: user.proposalStats.trackerUsageCount,
                createdCount: user.proposalStats.createdCount,
                sampleDownloadedCount: user.proposalStats.sampleDownloadedCount
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
exports.downLoadFeature = async (req, res) => {
    try {
        const userId = req.params.id;
        const { type } = req.body;

        const user = await User.findById(userId);

        // ❌ Plan inactive
        if (user.subscription.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Please purchase a plan"
            });
        }

        // 🔑 Map type → field
        const usageMap = {
            download: "sampleDownloadedCount",
            create: "createdCount",
            tracker: "trackerUsageCount"
        };

        const field = usageMap[type];

        if (!field) {
            return res.status(400).json({
                success: false,
                message: "Invalid usage type"
            });
        }

        // ❌ Limit check
        if (user.proposalStats[field] <= 0) {
            return res.status(403).json({
                success: false,
                message: `${type} limit reached`
            });
        }

        // ✅ Decrease count
        user.proposalStats[field] -= 1;

        await user.save();

        res.json({
            success: true,
            message: `${type} allowed`,
            remaining: user.proposalStats[field]
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
