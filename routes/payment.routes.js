const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");

const {
    createSubscription,
    cancelSubscription,
    webhookHandler,
    getPlan,
    subscriptionVerify,
    subscriptionId,
    getSubscription,
    cancel,
    webhook
} = require("../controllers/payment.controller");

router.post("/create-subscription", createSubscription);
router.post("/cancel-subscription", cancelSubscription);

// router.get("/plan", getPlan);
// router.post("subscriptionVerify",subscriptionVerify)
// router.get('subscriptionId',subscriptionId)

router.get('/plan', getPlan);
router.post('/subscription/verify', subscriptionVerify);
router.get('/subscription/:subscriptionId', getSubscription);
router.post('/subscription/:subscriptionId/cancel', cancel);
router.post('/webhook', webhook);


// ⚠️ RAW body for webhook
router.post(
    "/webhook",
    bodyParser.raw({ type: "application/json" }),
    webhookHandler
);

module.exports = router;
