const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// -----------------------------
// CREATE CUSTOMER
// -----------------------------
const createCustomer = async (email) => {
    const customer = await stripe.customers.create({ email });
    return customer.id;
};

// -----------------------------
// CREATE SUBSCRIPTION
// -----------------------------
exports.createSubscription = async (req, res) => {
    try {
        const { email, planType } = req.body;

        let priceId;

        if (planType === "monthly") {
            priceId = process.env.PRICE_MONTHLY;
        } else if (planType === "yearly") {
            priceId = process.env.PRICE_YEARLY;
        } else {
            return res.status(400).json({ error: "Invalid plan type" });
        }

        const customerId = await createCustomer(email);

        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: "default_incomplete",
            expand: ["latest_invoice.payment_intent"],
        });

        res.json({
            subscriptionId: subscription.id,
            clientSecret:
                subscription.latest_invoice.payment_intent.client_secret,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// -----------------------------
// CANCEL SUBSCRIPTION
// -----------------------------
exports.cancelSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.body;

        const deleted = await stripe.subscriptions.del(subscriptionId);

        res.json({ success: true, data: deleted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// -----------------------------
// WEBHOOK
// -----------------------------
exports.webhookHandler = (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.log("Webhook error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case "invoice.payment_succeeded":
            console.log("✅ Payment success");
            break;

        case "invoice.payment_failed":
            console.log("❌ Payment failed");
            break;

        case "customer.subscription.created":
            console.log("📦 Subscription created");
            break;

        case "customer.subscription.deleted":
            console.log("🛑 Subscription cancelled");
            break;

        default:
            console.log(`Unhandled event: ${event.type}`);
    }

    res.sendStatus(200);
};