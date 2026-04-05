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