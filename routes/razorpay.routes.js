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

router.get("/plans", getPlans);
router.post("/subscription", createSubscription);
router.post("/verify", verifySubscription);
router.post("/cancel", cancelSubscription);

// ⚠️ Razorpay webhook needs the RAW body to verify the signature —
// keep this bodyParser.raw() BEFORE any express.json() touches this path.
router.post("/webhook", bodyParser.raw({ type: "application/json" }), webhookHandler);

module.exports = router;