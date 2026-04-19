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
    removeSavedGrant,
    updateUserPlan,
    getUserDetails,
    downLoadFeature
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
//Plan 

// routes/userRoutes.js
router.patch("/:id/subscription", updateUserPlan);
router.get("/:id",getUserDetails)
router.post("/:id/download", downLoadFeature);



module.exports = router;