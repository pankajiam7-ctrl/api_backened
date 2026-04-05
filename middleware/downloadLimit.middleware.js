const User = require("../models/user.model");

exports.checkDownloadLimit = async (req, res, next) => {
    try {
        const user = await User.findById(req.user);

        if (user.subscription?.status !== "active") {
            return res.status(403).json({
                message: "Upgrade plan to download proposals"
            });
        }

        if (user.downloadCount >= user.downloadLimit) {
            return res.status(403).json({
                message: "Download limit reached"
            });
        }

        req.userData = user;
        next();

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};