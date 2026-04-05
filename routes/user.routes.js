const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/auth.middleware");

const {
    getMe,
    updateMe,
    getSubscription,
    deleteAccount,
    uploadAvatar,
    getSavedGrants,
    saveGrant,
    removeSavedGrant
} = require("../controllers/user.controller");

router.get("/me", protect, getMe);
router.put("/me", protect, updateMe);
router.get("/me/subscription", protect, getSubscription);
router.delete("/me", protect, deleteAccount);
router.post("/me/avatar", protect, uploadAvatar);
//Save
router.get("/me/saved-grants", protect, getSavedGrants);
router.post("/me/saved-grants/:grantId", protect, saveGrant);
router.delete("/me/saved-grants/:grantId", protect, removeSavedGrant);



module.exports = router;