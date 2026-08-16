const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const { protect } = require("../middleware/auth.middleware");
const {
    getPlans,
    createSubscription,
    verifySubscription,
    cancelSubscription,
    webhookHandler,
} = require("../controllers/razorpay.controller");

router.get("/plans", (req, res) => {
    console.log("🔥 PLANS ROUTE HIT");
    res.status(200).json({
        success: true,
        message: "Plans route is working"
    });
});
router.post("/subscription", protect, createSubscription);
router.post("/verify", protect, verifySubscription);
router.post("/cancel", protect, cancelSubscription);

// ⚠️ Razorpay webhook needs the RAW body to verify the signature —
// keep this bodyParser.raw() BEFORE any express.json() touches this path.
router.post("/webhook", bodyParser.raw({ type: "application/json" }), webhookHandler);

module.exports = router;