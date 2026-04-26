const router = require("express").Router();
const { protect } = require("../middleware/auth.middleware");

const {
    getUsers,
    getStats,
    updateUserPlan,
    publishGrant,
    updateLink,
    updateImage,
    getLink,
    getCludinaryLink
} = require("../controllers/admin.controller");

// 🔒 Admin only (add role check later)
router.get("/users", getUsers);
router.get("/stats", protect, getStats);
router.put("/users/:id/plan", protect, updateUserPlan);
router.put("/grants/:id/publish", protect, publishGrant);
router.post('/updateLink',updateLink);
router.post('/updateImage',updateImage)
router.get('/getUrlLink',getLink);
router.get('/linkCloudinary', getCludinaryLink);

module.exports = router;